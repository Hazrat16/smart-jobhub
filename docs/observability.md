# Observability: Prometheus, Loki, Grafana

The API's metrics and logs, viewed in Grafana, in two places:

- **Locally**, next to the dev stack with Docker Compose ([Local stack](#local-stack)).
- **On AWS**, per environment, on Fargate. It's on in staging and off in prod for now ([On AWS](#on-aws)).

Both use the same dashboards and alert rules from `apps/api/observability/`. CloudWatch alarms
and Sentry ([runbook.md](runbook.md)) stay the paging system. Nothing here sends notifications.

## Local stack

### Start it

```bash
cd apps/api
docker compose -f docker-compose.dev.yml -f docker-compose.observability.yml up --build
```

| UI | URL | Notes |
|---|---|---|
| Grafana | http://localhost:3001 | `admin` / `admin` (set `GRAFANA_ADMIN_PASSWORD` to change). Opens on the **Smart JobHub API** dashboard. |
| Prometheus | http://localhost:9090 | *Status > Targets* shows what is scraped; *Alerts* shows rule state. |
| Alloy | http://localhost:12345 | Health of the log pipeline. |

All ports bind to `127.0.0.1` only. Grafana uses 3001 because the web app uses 3000.

Stop it with the same `-f` flags and `down`. Add `-v` to delete the stored metrics, logs
and Grafana state.

### How it fits together

```
job-platform-api ── GET /metrics ──────────────┐
redis-exporter   ── redis_* metrics ───────────┼──> Prometheus ──┐
mongodb-exporter ── mongodb_* metrics ─────────┘   (alerts.yml)  │
                                                                 ├──> Grafana
api / mongo / redis stdout ──> Alloy ──> Loki ───────────────────┘
        (Docker logs)          (parses the API's JSON lines)
```

- **Metrics:** the API serves Prometheus metrics at `GET /metrics`, defined in
  `apps/api/src/utils/metrics.ts`. Prometheus scrapes it every 15 s. The endpoint sits outside
  `/api` on purpose: the ALB only forwards `/api/*` and `/socket.io/*`, so it can't be reached from
  the internet. Setting `METRICS_TOKEN` also requires `Authorization: Bearer <token>`.
- **Logs:** the API already writes one JSON object per line (`src/utils/logger.ts`). Alloy tails
  the Docker logs of containers labelled `smartjobhub.logs=true`. It turns `level` into a Loki label,
  stores `requestId` and `path` as structured metadata, and pushes everything to Loki. Other
  containers on your machine are ignored. Loki keeps 7 days, and so does Prometheus.

## API metrics

| Metric | Type | Labels | What it tells you |
|---|---|---|---|
| `http_requests_total` | counter | `method`, `route`, `status_code` | Traffic and errors (RED). |
| `http_request_duration_seconds` | histogram | `method`, `route`, `status_code` | Latency percentiles. |
| `app_dependency_up` | gauge | `dependency` = `mongodb` / `redis` | Whether the API can reach them. |
| `email_queue_jobs` | gauge | `state` | BullMQ email queue: waiting, active, delayed, failed, completed. |
| `socketio_connected_clients` | gauge | | Live chat connections on this process. |
| `process_*`, `nodejs_*` | various | | CPU, memory, heap, GC, event loop lag (prom-client defaults). |

Every series also carries `service="job-platform-api"`.

`route` is the Express route template (`/api/jobs/:id`), never the raw URL. Every distinct label
value creates a new time series, so raw ids would grow them without limit. Requests that match no
route share `route="unmatched"`. Scrapes of `/metrics` itself are not recorded.

To add a metric, define it in `metrics.ts` on `registry`. Keep label values to a small, fixed set:
no user ids, emails or URLs.

## Dashboard

**Smart JobHub API** (`observability/grafana/dashboards/api-overview.json`):

- **Overview:** API up, requests/s, 5xx rate, p95 latency, MongoDB and Redis reachability.
- **HTTP (RED):** rate by route, p50/p95/p99 latency, status codes, slowest routes.
- **Node.js process:** memory, CPU, event loop lag.
- **Queues and realtime:** email queue by state, Socket.IO clients.
- **Datastores:** MongoDB connections and operations, Redis memory, commands and clients.
- **Logs:** volume by level and a live log panel. Pick a level, or paste a `requestId` into
  *Log search* to see everything that one request logged.

Dashboards are provisioned from the repo, so edits made in the UI are lost on restart. To change
one, edit it in Grafana, use *Share > Export > Save to file*, and commit the JSON over the existing file.

## Useful queries

PromQL (Grafana *Explore*, or Prometheus):

```promql
# 5xx rate per route
sum by (route) (rate(http_requests_total{status_code=~"5.."}[5m]))

# p95 latency per route
histogram_quantile(0.95, sum by (le, route) (rate(http_request_duration_seconds_bucket[5m])))
```

LogQL (Grafana *Explore* > Loki). These work locally and on AWS:

```logql
# Everything one request logged (the X-Request-Id response header, or requestId in a log line)
{service="job-platform-api"} | json | requestId="<id>"

# Error logs with their fields parsed
{service="job-platform-api"} | json | level="error"

# Requests slower than 500 ms
{service="job-platform-api"} | json | message="http_request" and latencyMs > 500
```

## Alerts

Rules live in `observability/prometheus/alerts.yml`: API down, 5xx rate above 5%, p95 above 1 s,
event loop lag, a dependency unreachable, email queue backlog or failures, Redis or MongoDB down,
and Redis memory. Locally there is no Alertmanager, so rules show their state in Prometheus and
Grafana but don't notify anyone.

After editing a Prometheus file locally, reload it without a restart:
`curl -X POST localhost:9090/-/reload`. On AWS, `terraform apply` uploads it and redeploys Prometheus.

Metrics and logs queries in dashboards must work in both places. Locally Alloy also turns `level`
into a label, but on AWS it isn't one, so parse it from the line (`| json level`) as the dashboard does.

## On AWS

`infra/modules/observability`, switched on per environment with `observability_enabled` in
`infra/envs/<env>/main.tf` (staging: on, prod: off).

```
api tasks ── GET /metrics ───────────────────> Prometheus (Fargate, data on EFS) ──┐
          └─ FireLens (Fluent Bit sidecar) ──> Loki (Fargate, data in S3) ─────────┼──> Grafana (Fargate)
                                          └──> CloudWatch Logs (unchanged)         │      ^
                                                                                   │      │ SSM port forward
              all of them find each other as <service>.job-platform-<env>.internal ┘   your laptop
```

- **Metrics:** the api tasks register in a private Cloud Map namespace, so
  `api.job-platform-<env>.internal` resolves to every running task, and Prometheus scrapes each one.
  Prometheus keeps 15 days on EFS. Only one Prometheus task runs at a time, so the data is never
  written by two.
- **Logs:** the api task has a FireLens log router (AWS for Fluent Bit). It writes the app's lines to
  the same CloudWatch log group as before (`aws logs tail` and the runbook still work), and sends a
  copy to Loki, which keeps 7 days in S3. The router's own logs go to the `log-router/` streams of
  that log group.
- **Config:** Terraform renders each service's config (Prometheus scrape targets, Loki storage,
  Grafana data sources) and uploads it to S3, together with this repo's dashboards and alert rules.
  An init container copies it into the task at start. Changing any of these files and applying
  redeploys only the service that reads it.
- **Access:** no service has a public address or any ingress from the internet. Prometheus may only
  reach the api's port 5000. Loki only accepts the api, Grafana and Prometheus. Grafana is reached
  through an SSM port forward into its task.

### Open Grafana, Prometheus and Loki

None of them has a public address. You reach them in two hops:

1. An **SSM tunnel** from your work machine (the EC2 machine in `setup.md`) into the Grafana task.
   It opens the port on the work machine's `localhost`.
2. An **SSH port forward** from your laptop to the work machine, so your laptop's browser can use it.

| Tool       | Tunnel command (on the work machine)                | Laptop URL            |
| ---------- | --------------------------------------------------- | --------------------- |
| Grafana    | `bash scripts/grafana-tunnel.sh`                    | http://localhost:3001 |
| Prometheus | `bash scripts/grafana-tunnel.sh staging prometheus` | http://localhost:9091 |
| Loki       | No UI of its own: use Grafana → **Explore**         | (through Grafana)     |

For prod, replace `staging` with `prod` (Grafana: `bash scripts/grafana-tunnel.sh prod`).

**One time, on the work machine:** install the AWS CLI v2 (setup.md step 2) and the
[Session Manager plugin](https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html):

```bash
curl -sSLo /tmp/session-manager-plugin.deb \
  "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb"
sudo dpkg -i /tmp/session-manager-plugin.deb
```

#### Grafana

**Terminal 1, on the work machine.** Leave it running; Ctrl+C closes the tunnel.

```bash
cd ~/smart-jobhub
export AWS_PROFILE=smartjobhub-admin AWS_REGION=ap-south-1
bash scripts/grafana-tunnel.sh --password   # admin password (generated, in Secrets Manager)
bash scripts/grafana-tunnel.sh              # prints "Waiting for connections..."
```

**Terminal 2, on your laptop** (not inside an SSH session). This is the SSH command you normally use
to reach the work machine, with `-N -L` added. It prints nothing while it works.

```bash
ssh -i <your-key.pem> -N -L 3001:localhost:3001 ubuntu@<your-ec2-address>
```

With VS Code Remote-SSH you can skip terminal 2: **Ports** tab → **Forward a Port** → `3001`.

Open **http://localhost:3001** on your laptop and log in as `admin`. Grafana keeps no state of its
own: data sources and dashboards are re-created from config on every start, and edits made in the UI
are lost. Change the JSON in the repo instead (see [Dashboard](#dashboard)).

#### Prometheus

**Terminal 1, on the work machine** (leave it running):

```bash
cd ~/smart-jobhub
export AWS_PROFILE=smartjobhub-admin AWS_REGION=ap-south-1
bash scripts/grafana-tunnel.sh staging prometheus
```

**Terminal 2, on your laptop:**

```bash
ssh -i <your-key.pem> -N -L 9091:localhost:9091 ubuntu@<your-ec2-address>
```

Open **http://localhost:9091**:

- **Status → Targets:** `api`, `loki` and `prometheus` are all **UP**.
- **Alerts:** the rules from `alerts.yml` and their state.
- **Query:** e.g. `http_requests_total` or `app_dependency_up`.

To run both at once, start each tunnel in its own terminal on the work machine, and forward both
ports with one laptop command:

```bash
ssh -i <your-key.pem> -N -L 3001:localhost:3001 -L 9091:localhost:9091 ubuntu@<your-ec2-address>
```

Prometheus is also a data source in Grafana (**Explore** → **Prometheus**), so the Grafana tunnel
alone covers most checks.

#### Loki

Loki only has an API, so you read it through Grafana. Open Grafana as above, then **Explore** (the
compass icon) → data source **Loki** → **Code** mode, and run a query:

```logql
# All api logs
{service="job-platform-api"}

# Errors only
{service="job-platform-api"} | json | level="error"

# Everything one request logged
{service="job-platform-api"} | json | requestId="<id>"

# Requests slower than 500 ms
{service="job-platform-api"} | json | message="http_request" and latencyMs > 500
```

The **API logs** panel at the bottom of the Smart JobHub API dashboard shows the same data.

#### If it doesn't connect

| You see                                               | Cause and fix                                                                                       |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `No such file or directory` for the script            | You're not in the project folder: `cd ~/smart-jobhub`, then `git pull`.                             |
| `session-manager-plugin is not installed`             | Install it (the one-time step above).                                                               |
| `Permission denied (publickey)` from `ssh -L`         | You ran it on the work machine. Run it on your laptop, with the key you use to reach the machine.   |
| The laptop URL doesn't load                           | Terminal 1's tunnel was stopped (Ctrl+C), or terminal 2 isn't running. Both must stay open.         |
| `no running Grafana task`                             | See [Troubleshooting](#troubleshooting).                                                            |

### Turn it on for prod

Set `observability_enabled = true` in `infra/envs/prod/main.tf` and apply. That adds the namespace,
the bucket, the EFS file system and the three services. The api picks up its log router and Cloud Map
registration at its next deploy: CD always builds on the latest task definition revision.

### Cost

Each service runs as one task at 0.25 vCPU: Prometheus with 0.5 GB, Loki with 1 GB, Grafana with
0.5 GB. On Spot (staging) that's roughly $10–12/month in total. On-demand (prod) it's roughly
$30/month. EFS, S3 and Cloud Map add cents at this volume. The api's Fluent Bit sidecar shares the
task's existing CPU and memory.

### Limits, on purpose

- **One Loki and one Prometheus task.** A Spot interruption or a deploy leaves a short gap in
  metrics. Loki can lose the last few unflushed minutes. CloudWatch still has every log line.
- **No Alertmanager.** Rule state is visible in Grafana and Prometheus, but paging stays with the
  CloudWatch alarms → SNS (`modules/monitoring`).
- **No Redis or MongoDB exporters on AWS.** ElastiCache reports to CloudWatch, and Atlas has its own
  monitoring. Their rules in `alerts.yml` only fire locally.

## Troubleshooting

**Local:**


- **A target is down in Prometheus:** check the container is running (`docker ps`). The API target
  stays down until the API has started.
- **No API logs in Grafana:** Alloy rediscovers containers every minute, so a container that
  started after Alloy appears within about a minute. The Alloy UI lists the containers it tails.
- **Port already in use:** another project is using 27017, 6379, 3001 or 9090. Stop it, or override
  the port in a local compose file.

**On AWS:**

- **The tunnel says there's no running Grafana task:** check the service's events with
  `aws ecs describe-services --cluster job-platform-<env> --services job-platform-<env>-grafana`.
  A task that stops right after starting usually means the config copy failed; that container's
  output is in `/ecs/job-platform-<env>-grafana`.
- **The api target is missing in Prometheus (Status > Targets):** the api registers in Cloud Map only
  from its first deploy after observability was switched on. Run the deploy workflow.
- **No logs in Loki, but they're in CloudWatch:** look at the api log group's `log-router/` streams
  for Fluent Bit's errors (Loki unreachable, bad config).
