# Runbook

What to do when an alert fires, plus everyday operations. Commands assume `AWS_REGION=ap-south-1`
and admin credentials. `<env>` is `staging` or `prod`; `<app>` is `api` or `web`.

**First, for any alert:** did something just ship? Check the latest `deploy-*` runs in GitHub Actions.
If a deploy is the cause, [roll back](#roll-back) first and investigate after.

## Where to look

```bash
# Live logs
aws logs tail /ecs/job-platform-<env>-<app> --follow --since 30m

# What ECS did recently (deployments, failed health checks, task placement)
aws ecs describe-services --cluster job-platform-<env> --services job-platform-<env>-<app> \
  --query 'services[0].events[:10].[createdAt,message]' --output table

# Why tasks stopped (bad secret key, image pull, crash)
aws ecs list-tasks --cluster job-platform-<env> --service-name job-platform-<env>-<app> --desired-status STOPPED \
  --query 'taskArns[:5]' --output text | xargs -r aws ecs describe-tasks --cluster job-platform-<env> \
  --query 'tasks[].[stoppedAt,stoppedReason,containers[0].reason]' --output table --tasks

# Which version is serving
curl -s https://<domain>/api/health/ready | jq '{status, version, services}'
```

Errors with stack traces are in Sentry, filtered by environment (`staging` / `production`) and release
(`api-v12`).

Where `observability_enabled` is on (staging), the same api logs are also in Loki, and metrics are in
Prometheus. Open them in Grafana with `bash scripts/grafana-tunnel.sh <env>` (see
[observability.md](observability.md#on-aws)). Paste a `requestId` into the dashboard's log search to
see everything one request logged.

## Alerts

Alerts arrive by email from the `job-platform-<env>-alerts` SNS topic, once when they fire (ALARM) and
once when they clear (OK).

### ALB 5xx

The load balancer answered 5xx itself: usually **no healthy task** (502/503) or a task that timed out
(504).

1. Check [no healthy targets](#no-healthy-targets); it's probably firing too.
2. 504 without 502/503 points to slow requests; see [latency](#latency).

### App 5xx

The app returned 5xx.

1. Sentry, filtered by the environment: look for a new error type, and note the release.
2. Logs: `aws logs tail ... --since 30m | grep -i error`.
3. It started with a deploy → [roll back](#roll-back).
4. `/api/health/ready` says `db: down` → check Atlas (status page, cluster metrics, IP access list).

### Latency

The api's p95 has been above 2 s for 10 minutes.

1. CPU high as well? Autoscaling should be adding tasks; check it's not at `max_count`
   (`describe-services` events). If it is, raise `max_count` (prod `main.tf`) or task `cpu`.
2. Atlas slow queries (Atlas → Query Insights). A missing index is the usual cause.
3. A slow third party (Groq/OpenAI, Cloudinary, SSLCommerz) shows up in logs as long requests on those
   routes.

### No healthy targets

A service expected to run has **zero** healthy tasks. The app, or half of it, is down.

1. [Why tasks stopped](#where-to-look). The usual reasons:
   - `ResourceInitializationError ... did not contain json key X`: a key is missing from
     `/job-platform/<env>/api`. Add it (`infra/DATA.md`), then force a new deployment.
   - `CannotPullContainerError`: the image tag doesn't exist (a placeholder, or expired from ECR).
     Promote a real version.
   - Exit code 1 at startup: see logs. Missing `JWT_SECRET`, Atlas unreachable, etc.
   - Health check failing: `/api/health/ready` returns 503 when MongoDB isn't connected.
   - `log-router` exited (observability on): the api task's Fluent Bit sidecar is essential, so the
     task stops with it. Its own logs are in the api log group under the `log-router/` stream prefix.
     A bad Fluent Bit config in S3 is the usual cause; `terraform apply` re-uploads it from the repo.
2. Right after a deploy → [roll back](#roll-back).

### CPU or memory high

Average above 85% for 15 minutes.

- **CPU:** autoscaling handles spikes; this alert means it's pinned (at `max_count`, or no policy
  because min = max). Raise `max_count` or `cpu`.
- **Memory:** Node rarely releases memory. Steady growth across hours means a leak; a jump after a
  deploy means that release. Short term: raise `memory` (Terraform) or force a new deployment to restart
  tasks. Then find the cause.

### Redis memory

Valkey above 80%. It runs with `noeviction` (BullMQ needs that), so **at 100% writes fail**: rate
limits, cache, email queue and the Socket.IO adapter all break.

1. The likely cause is the email queue backing up because the worker can't send (Resend down, bad API
   key). Check api logs for email errors.
2. Short term: move to a bigger node. Add `redis_node_type = "cache.t4g.small"` to the `module "env"`
   block in `infra/envs/<env>/main.tf` and merge. That takes a few minutes; the data is kept.
3. Everything in Valkey can be rebuilt. Replacing the node (`terraform apply -replace=module.env.module.redis.aws_elasticache_replication_group.this`)
   empties it; only queued emails are lost.

### Deployment failed

`SERVICE_DEPLOYMENT_FAILED` from ECS: the circuit breaker rolled a deployment back. The service is
running the previous revision, so users should be fine. The `deploy-*` run that started it failed too;
its logs and the [stopped task reasons](#where-to-look) say why.

## Operations

### Deploy and roll back

See `docs/releasing.md`.

#### Roll back

**Actions → deploy-<app> → production**, version = the previous one (it's already passed staging). For
staging, redeploy the previous version the same way.

### Restart tasks (e.g. after changing a secret)

```bash
aws ecs update-service --cluster job-platform-<env> --service job-platform-<env>-<app> --force-new-deployment
```

### Scale

Permanent: change `api_min_count` / `web_min_count` (prod `terraform.tfvars`) or `max_count`
(prod `main.tf`) and merge. Emergency, until the next apply:

```bash
aws application-autoscaling register-scalable-target --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/job-platform-prod/job-platform-prod-api --min-capacity 2 --max-capacity 6
```

### Rotate secrets

See `infra/DATA.md` → "Changing a secret later".

### Check costs

AWS Budgets emails at 80% and 100% of the monthly budget, and when the forecast crosses 100%. To see
where the money goes: Cost Explorer, grouped by service, filtered by tag `Project = job-platform` and by
`Environment`. Tag filters only work after activating `Project` and `Environment` once under
Billing → Cost allocation tags; they cover costs from then on.

### Database restore drill

Quarterly; see `docs/restore-drill.md`.
