# Production-Grade AWS on a $110 Budget: The Cloud Architecture Behind Smart JobHub

*How I took a job platform from two loose repos to a Terraform-managed, keyless, versioned AWS
deployment, and the security decisions (and trade-offs) behind it.*

---

## TL;DR

- **Smart JobHub** is a job platform for Bangladesh: job search, applications, company pages and
  real-time chat. The stack is Next.js 15, Express 5, Socket.IO, MongoDB and Redis.
- It runs on **AWS ECS Fargate** in Mumbai (`ap-south-1`), behind **CloudFront** and one
  **Application Load Balancer**, with **ElastiCache Valkey** and **MongoDB Atlas**.
- **Everything is Terraform**: two environments (staging, prod) built from one composition module,
  tested in CI against a mocked AWS provider, and scanned with tflint and checkov.
- **There are no AWS keys anywhere.** GitHub Actions authenticates with OIDC. Each workflow gets its
  own narrowly scoped role, and every role the pipeline creates carries a permissions boundary.
- **Releases are immutable and promoted, never rebuilt.** The exact image that passed staging is the
  one production runs, behind an approval gate.
- **Observability:** CloudWatch alarms to email, Sentry, and a private Prometheus + Loki + Grafana
  stack you can only reach through an SSM tunnel.
- **Cost:** roughly $50–65 per environment per month. The biggest single saving is having no NAT gateway.

---

## 1. The problem

I started with two repositories: an Express/Socket.IO backend and a Next.js frontend. Both had
half-working CI and no real deployment story. The goal was to make it production-ready the way a
small company would, under constraints a small company actually has:

| Constraint     | What it meant                                                                  |
| -------------- | ------------------------------------------------------------------------------ |
| **Budget**     | About $110/month for the whole AWS account, both environments included.        |
| **Team size**  | One person. Anything that needs babysitting (servers, patching) is a liability. |
| **Users**      | Bangladesh, so the region is Mumbai, also close to the payment provider (SSLCommerz). |
| **Real-time**  | Chat over WebSockets has to work across several API containers.                |
| **Auditability** | Every change to infrastructure and every release must be reviewable and reversible. |

The first decision was a **monorepo** (`apps/api`, `apps/web`, `infra/`), merged with `git subtree`
so both projects kept their full history.

---

## 2. Architecture at a glance

```
                                   ┌──────────────────────────────────────────────────────────┐
                                   │  AWS ap-south-1 (Mumbai) · one VPC per environment · 2 AZs │
                                   │                                                          │
 Browser ── HTTPS ──> CloudFront ──┼──> ALB (only accepts CloudFront + secret header)         │
                                   │      │                                                   │
                                   │      ├── /*                    ──> web  (Next.js, Fargate) │
                                   │      └── /api/*, /socket.io/*  ──> api  (Express, Fargate) │
                                   │                                     │   │                │
                                   │           ElastiCache Valkey <── TLS + AUTH                │
                                   │           (Socket.IO adapter, rate limits, BullMQ)       │
                                   │                                         │                │
                                   │  Secrets Manager ── injected at task start ──> api        │
                                   │  CloudWatch alarms ── SNS ──> email                       │
                                   │  Prometheus · Loki · Grafana (private, Fargate)          │
                                   └─────────────────────────────────────────┼────────────────┘
                                                                             │ TLS
                                              MongoDB Atlas (AWS Mumbai) <───┘
                                              Resend · Cloudinary · SSLCommerz · Groq
```

### Same origin by design

The browser only ever talks to **one host**. CloudFront forwards everything to the ALB, and the ALB
routes by path:

- `/api/*` and `/socket.io/*` go to the API service. Socket.IO uses **sticky sessions** for long-polling.
- Everything else goes to the web service.

This one decision removed a whole class of problems:

- **No CORS.**
- **No API URL baked into the frontend build.**
- **One web image that works in every environment.** That is what makes "build once, promote
  everywhere" possible.

### Compute: ECS Fargate

Both apps run as **ECS Fargate** services. There are no servers to patch and no cluster to upgrade,
which matters when you're a team of one.

- **Staging** runs on **Fargate Spot**, at a fixed size, for about 70% less compute cost.
- **Production** runs on-demand, with **CPU target-tracking autoscaling**: the API scales from 1 to 3
  tasks and the web from 1 to 2.
- **Every service has the ECS deployment circuit breaker with automatic rollback.** A bad release
  rolls itself back.

### Data

- **MongoDB Atlas**, hosted on AWS in Mumbai, with backups on. A quarterly restore drill restores a
  backup into a temporary cluster and checks document counts and freshness.
- **ElastiCache Valkey 8** (the open-source Redis fork) does three jobs:
  - It's the **Socket.IO adapter**, so a chat message reaches the right user whichever API task they're
    connected to.
  - It holds **distributed rate limits**.
  - It backs the **BullMQ email queue**.
  - It runs with `maxmemory-policy noeviction`, because an evicted queue key would silently lose an email.

### Simplification: removing RabbitMQ

The original backend shipped with RabbitMQ. When I traced what it actually did, chat already wrote
every message straight to MongoDB, and the RabbitMQ consumers only logged or repeated those writes.

A managed broker would have cost $20–30/month for nothing, so **I deleted it**. The Redis adapter
handles the real cross-task fan-out. The best infrastructure is often the infrastructure you remove.

---

## 3. The network: public subnets, no NAT gateway, still locked down

A NAT gateway costs about **$35–45/month per AZ** before any data transfer. On this budget that's
more than an entire environment's compute.

So the tasks run in **public subnets with public IPs** (for outbound calls to Atlas, ECR and
third-party APIs), and **security groups do the isolation**:

```
Internet ──X──> api / web tasks        (no inbound rule from the internet)
CloudFront ───> ALB                    (only CloudFront's managed origin-facing prefix list)
ALB ──────────> api :5000, web :3000   (only the ALB's security group)
api ──────────> Valkey :6379           (only the api's security group)
Prometheus ───> api :5000              (only Prometheus' security group, for /metrics)
```

A public IP is not the same as a public service. Nothing can open a connection *to* a task
unless a security group explicitly allows its source, and every rule references another
security group, never `0.0.0.0/0`.

### Protecting the origin without a domain

Until a domain is bought, CloudFront serves the site on its own `*.cloudfront.net` certificate. To
stop anyone from going around CloudFront straight to the load balancer, the ALB has two locks:

1. **The source must be CloudFront.** Its security group only accepts the AWS-managed
   `com.amazonaws.global.cloudfront.origin-facing` prefix list.
2. **The request must carry a per-environment secret header** (`X-Origin-Verify`). CloudFront
   adds it, and the ALB's default action returns **403** for any request without it.

When a domain is added, a single Terraform variable switches the environment to Route 53 plus an
**ACM certificate on the ALB**, with an HTTP→HTTPS redirect and a TLS 1.2/1.3-only security policy.

---

## 4. Security, layer by layer

Security here isn't one feature. It's a set of independent layers, so a single mistake doesn't
expose everything.

### 4.1 Identity: zero long-lived credentials

**There is not one AWS access key in this project:** not in GitHub, not on a laptop, not in a
`.env` file.

- **GitHub Actions uses OIDC.** Each workflow exchanges a short-lived GitHub token for a short-lived
  AWS role session.
- **Every role trusts exactly one workflow file on `main`**, and only inside a specific GitHub
  environment. The trust policy matches on `job_workflow_ref`, so the web deploy workflow
  *cannot* assume the API deploy role, and a feature branch can't assume any of them.
- **Plans and applies use separate roles:**
  - `infra-planner` is read-only and used for `terraform plan` on pull requests. A PR can edit the
    workflow it runs, so a PR must never hold write access.
  - `infra-deployer` applies only from `main`, inside the `staging` or `production` environment.
  - `api-deployer` / `web-deployer` can push to their own ECR repository and update their own ECS
    service. Nothing else.
- **A permissions boundary on everything the pipeline creates.** The deployer can only create IAM
  roles under `/job-platform/`, and only if they carry the workload boundary. The boundary denies:
  - every IAM write
  - Organizations and account changes
  - any access to the Terraform state bucket

  Even a fully compromised pipeline can't mint itself an admin role.
- **CI can't widen its own permissions.** The deploy roles live in a separate, hand-applied
  bootstrap stack, not in the environment stacks CI applies.
- **People:** the AWS root user is MFA-protected and never used. Daily work uses an IAM admin with MFA.

### 4.2 Secrets

- **AWS Secrets Manager** holds runtime secrets under `/job-platform/<env>/...`.
- **Terraform creates the secret containers empty.** The values are filled in by hand, so API keys
  never appear in Terraform state or CI logs.
- **ECS injects secrets when a task starts.** CI never reads them, and only the task's execution role
  can.
- Generated secrets (the Valkey AUTH token, the Grafana admin password) are 32–64 character random
  values created by Terraform.

### 4.3 Encryption

| Data                    | At rest                    | In transit                              |
| ----------------------- | -------------------------- | --------------------------------------- |
| MongoDB Atlas           | Atlas encryption           | TLS only                                |
| ElastiCache Valkey      | Encrypted                  | TLS + 64-char AUTH token                |
| Terraform state (S3)    | SSE, versioned             | Bucket policy denies non-TLS requests   |
| Observability (S3, EFS) | SSE / encrypted EFS        | Non-TLS denied (S3), TLS + IAM auth (EFS) |
| User traffic            | n/a                        | HTTPS (TLS 1.2/1.3 only with a domain)  |

### 4.4 Containers and supply chain

- **Multi-stage, non-root images.** The production stage:
  - runs as the `node` user
  - runs `apk upgrade`
  - **deletes npm, npx, corepack and yarn** from the base image. Their bundled dependencies were the
    only HIGH/CRITICAL findings, and the app never uses them at runtime.
- **Node runs as PID 1**, so `SIGTERM` reaches the graceful-shutdown handler. It drains HTTP,
  WebSockets, the queue, Redis and Mongo within 10 seconds.
- **Trivy** scans every image in CI and fails on HIGH/CRITICAL.
- **Pinned scanner image.** CI runs Trivy from the pinned `aquasec/trivy` container rather than the
  popular GitHub Action, whose tags were hijacked in a 2026 supply-chain attack.
- **ECR:** immutable tags plus scan-on-push. A version like `api-v12` can never be overwritten, so
  "what's running in prod" always has one exact answer.
- **CodeQL** runs on every PR, and `npm audit` blocks high-severity dependency issues.
- **No source maps served publicly.** `productionBrowserSourceMaps` was removed from the frontend.

### 4.5 Infrastructure as code, verified

- `terraform fmt`, `validate`, **tflint** and **checkov** run on every PR. Each checkov skip is written
  inline with a reason, so every exception is a reviewed decision rather than a silenced warning.
- **`terraform test` against a mocked AWS provider.** Ten test suites assert the things that matter,
  for example:
  - the ALB only accepts CloudFront's prefix list
  - Prometheus may reach only the API's metrics port
  - an alarm fires when a service has no healthy targets

  These tests caught several plan-time `count`/`for_each` bugs before any real `plan` ran.

### 4.6 Application security

- **Authentication:**
  - Short-lived **JWT access tokens (15 minutes)** and **refresh tokens rotated on every use**.
  - Refresh tokens are stored only as **SHA-256 hashes**, in `httpOnly`, `SameSite=Lax`, `Secure`
    cookies.
  - Passwords are hashed with **bcrypt**.
  - Sessions can be revoked server-side.
- **Authorization:** role-based access control (jobseeker, employer, admin) enforced in middleware.
- **Rate limiting backed by Redis**, so the limits hold across every API task. `trust proxy` is set to
  the exact number of proxy hops, so each client gets its own bucket instead of everyone sharing the
  ALB's IP.
- **`helmet`** security headers, and input sanitization that strips MongoDB operator keys (`$`, `.`)
  to block NoSQL injection.
- **Strict CORS.** Unknown origins get a 403, not a generic 500.
- **The metrics endpoint isn't public.** `/metrics` sits outside `/api`, and the ALB only forwards
  `/api/*` and `/socket.io/*`, so the internet can't reach it. An optional bearer token adds a second lock.

---

## 5. CI/CD: reviewable, immutable, promotable

### Pull requests

```
npm ci → npm audit → lint → typecheck → tests (real Mongo + Redis containers)
       → docker build → Trivy → CodeQL → Playwright smoke test (web)
infra:  fmt → validate → terraform test → tflint → checkov → plan staging + prod
```

### Application releases (manual, versioned)

```
deploy-api (staging)                          deploy-api (production)
──────────────────────                        ──────────────────────────
cut api-vN from a branch                      version api-vN must have passed staging
build → Trivy → push to ECR (immutable)       ── approval required ──
git tag api-vN                                same image, no rebuild
roll out → watch the deployment               roll out → watch the deployment
smoke test: /api/health/ready returns         smoke test: the new version is the one answering
  "version": "api-vN"
commit status deploy/staging/api-vN ✓
```

- **Build once, promote everywhere.** Production never rebuilds. It deploys the exact image digest
  that passed staging.
- **The gate is a commit status** set only after a rollout that actually ran tasks *and* passed the
  smoke test.
- **The rollout is judged by the deployment's own `rolloutState`, not "service stable".** After a
  circuit-breaker rollback, the service is stable again, but on the old version. Checking stability
  alone would report a failed deploy as a success.
- **Rollback = promote the previous version.** It's the same workflow and the same guarantees.

### Infrastructure changes

- **Merge to `main`:** nothing is applied. Staging and production are each applied by a manual run.
- **Production:** a manual run from `main` saves a plan to **S3**, waits for approval, and then **that exact plan file** is
  applied after its SHA-256 is checked. If production changed in the meantime, Terraform refuses the
  stale plan. What was reviewed is exactly what runs.
- **Both environments come from one `environment` module.** `envs/staging` and `envs/prod` only set
  values (Spot vs. on-demand, scaling limits, log retention, deletion protection), so the two can't
  drift apart.

---

## 6. Reliability

- **Two availability zones**, health checks on `/api/health/ready` (which checks MongoDB), and the
  circuit breaker with rollback on every service.
- **Production autoscaling** on CPU (target 60%), plus deletion protection on the ALB.
- **Graceful shutdown**, so deploys and Spot interruptions don't drop in-flight requests.
- **Chat across tasks.** A two-server Socket.IO test in CI proves that a message sent on one task
  reaches a user connected to another.
- **Nightly demo reset.** EventBridge Scheduler runs a one-off Fargate task at 03:00 (Dhaka) that
  restores the public demo accounts.

---

## 7. Observability

### Alerting (what pages me)

CloudWatch alarms send email through SNS. Every alarm links to a runbook section. The alarms cover:

- ALB and per-service 5xx errors
- API p95 latency above 2 seconds
- **No healthy targets.** Missing data counts as "down", because a crashed service reports nothing.
- ECS CPU or memory above 85%
- Valkey memory above 80%. With `noeviction`, 100% means failed writes.
- Failed ECS deployments, through EventBridge

An **AWS Budget** alert emails at 80% and 100% of actual spend, and when the month's forecast passes
100%. **Sentry** tracks errors, tagged with the environment and the exact release (`api-v12`).

### Metrics, logs and dashboards (what I look at)

```
api tasks ── /metrics ─────────────────> Prometheus (Fargate, data on EFS) ──┐
          └─ FireLens (Fluent Bit) ────> Loki (Fargate, data in S3) ─────────┼──> Grafana (Fargate)
                                    └──> CloudWatch Logs (unchanged)         │        ▲
                    services find each other via a private Cloud Map namespace │        │ SSM tunnel
                                                                              ┘     engineer
```

- **Metrics:** the API exposes Prometheus metrics with `prom-client`:
  - request rate, errors and latency for each **route template**, never per raw URL, which would grow
    one time series per ID
  - whether MongoDB and Redis are reachable
  - the email queue by state
  - live Socket.IO connections
  - Node.js internals such as event-loop lag
- **Finding every task:** API tasks register in **Cloud Map**, so Prometheus discovers and scrapes
  each one.
- **Logs:**
  - A **FireLens sidecar** keeps writing the API's logs to CloudWatch, unchanged, and also ships a copy
    to Loki.
  - Every log line is structured JSON with a `requestId`.
  - Pasting one request ID into Grafana shows everything that request did.
- **Grafana has no public endpoint at all.** You open it with an **SSM port-forward** into its
  task. Its admin password is generated into Secrets Manager.
- **Same files locally:** dashboards and alert rules live in the repo. The exact same files run in a
  local Docker Compose stack and on AWS.

---

## 8. Cost

| Item                                         | Approx. per month         |
| -------------------------------------------- | ------------------------- |
| Staging (Fargate Spot, ALB, Valkey, logs)    | ~$50                      |
| Staging observability (Prometheus/Loki/Grafana on Spot) | ~$10–12        |
| Production (on-demand, autoscaling)          | ~$65                      |
| MongoDB Atlas (free tier staging, Flex prod) | $0 + $8–30                |
| CloudWatch alarms                            | ~$1 per environment       |
| **NAT gateway**                              | **$0 (deliberately none)** |

The levers that kept it there:
- no NAT gateway
- Spot for staging
- deleting RabbitMQ
- Valkey on a `t4g.micro`
- one ALB per environment with path routing, instead of a load balancer per service

---

## 9. Trade-offs I made on purpose (and what's next)

Being explicit about trade-offs is part of the design. Each of these was a conscious, documented
choice:

| Decision                                                   | Why                                       | Next step when budget/traffic allows          |
| ---------------------------------------------------------- | ----------------------------------------- | --------------------------------------------- |
| Atlas IP allowlist is open (`0.0.0.0/0`)                   | Fargate IPs change and there's no NAT; PrivateLink needs a larger Atlas tier | NAT + fixed egress IP, or Atlas PrivateLink |
| No AWS WAF                                                 | ~$6+/month, low traffic so far            | Managed rule sets on CloudFront               |
| CloudFront → ALB is HTTP in no-domain mode                 | The ALB has no certificate without a domain | Domain + ACM (one variable switches it)     |
| No VPC Flow Logs, GuardDuty or org-wide CloudTrail trail   | Cost relative to the rest of staging      | Enable GuardDuty and a CloudTrail trail first |
| Read-only root filesystem not yet on tasks                 | Needs writable volumes verified for the non-root user | Add tmpfs volumes, enable `readonlyRootFilesystem` |
| Single Prometheus and Loki task                            | Monitoring data is disposable; CloudWatch keeps every log line | Managed Prometheus or Loki in HA mode |

---

## 10. Lessons learned

1. **Test your infrastructure code like application code.** Mocked-provider `terraform test` suites
   caught real bugs before any `plan` ran, such as a `count` that depended on a value only known at
   apply time. That would have failed in the middle of a real deployment.
2. **"Stable" doesn't mean "succeeded".** After an automatic rollback, the ECS service reports stable,
   on the old version. Check the deployment's own state and the version that's actually answering.
3. **Delete before you scale.** Removing RabbitMQ saved money *and* fixed a stream of connection errors.
4. **Pin your supply chain.** A popular CI action got hijacked. Pinned container images and narrowly
   scoped, keyless roles limit the blast radius when (not if) something upstream breaks.
5. **Document the trade-offs.** "We don't have a WAF *yet*, here's why, here's the trigger to add
   it" is a design decision. Silence is a gap.

---

## Tech stack

**AWS:** ECS Fargate (+ Spot) · Application Load Balancer · CloudFront · ElastiCache (Valkey) ·
Secrets Manager · ECR · S3 · EFS · Cloud Map · CloudWatch · SNS · EventBridge (Scheduler) ·
Route 53 + ACM · IAM (OIDC, permissions boundaries) · Systems Manager · AWS Budgets

**IaC & CI/CD:** Terraform (modules, `terraform test`, S3 native locking) · GitHub Actions · tflint ·
checkov · Trivy · CodeQL · Playwright

**Observability:** Prometheus · Loki · Grafana · Fluent Bit (FireLens) · Sentry

**App:** Next.js 15 · React 19 · Express 5 · Socket.IO · BullMQ · MongoDB Atlas · TypeScript · Node 24

---

*The full source (Terraform, workflows, runbooks and architecture decision records) is on GitHub:
[github.com/Hazrat16/smart-jobhub](https://github.com/Hazrat16/smart-jobhub).*

*If you're building something similar on a small budget, I'd love to compare notes.*

#AWS #DevOps #Terraform #CloudArchitecture #CloudSecurity #ECS #GitHubActions #Observability
