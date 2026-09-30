# Job Platform — Production CI/CD & AWS Plan

Handoff document. Captures the decisions made so far so work can resume in any session.
Status is tracked in the checklist at the bottom.

## Decisions (already made — don't re-litigate)

- **Monorepo** (this repo), built with `git subtree` so both old repos keep their history:
  - `apps/api` ← `Hazrat16/job-platform` (Express 5 + Socket.IO + BullMQ, TypeScript, MongoDB, Redis)
  - `apps/web` ← `Hazrat16/job-platform-frontend` (Next.js 15, React 19, Playwright)
  - `infra/` ← Terraform (new)
  - Old repos get archived on GitHub, and each README points here.
- **Cloud: AWS, region `ap-south-1` (Mumbai)**, the closest region to Bangladesh users and SSLCommerz.
- **Runtime: ECS Fargate** behind one **ALB**, with a single domain and path-based routing:
  - `/api/*` → api service
  - `/socket.io/*` → api service (**sticky sessions**; the Redis adapter handles fan-out between tasks)
  - `/*` → web service
  - This means the browser uses same-origin `/api`, so `NEXT_PUBLIC_API_URL` stays unset. **One web
    image works for every environment**, which gives us build once, promote everywhere, and no CORS.
- **Data:** MongoDB **Atlas** (AWS Mumbai, backups on). Redis on **ElastiCache or Upstash**.
  *(Step 5: ElastiCache Valkey `cache.t4g.micro` per env; Atlas M0 for staging, Flex for prod.)*
- **Images:** ECR, **IMMUTABLE** tags, one repo per app (`job-platform-api`, `job-platform-web`), tagged with the git SHA.
- **CI → AWS auth: GitHub OIDC only, no static keys.** Three roles:
  `infra-deployer`, `api-deployer`, `web-deployer`. Trust is scoped by `job_workflow_ref` plus the
  GitHub `environment`, so the web workflow cannot deploy the API.
- **Secrets:** Secrets Manager `/job-platform/{env}/api`. ECS injects them when a task starts, and
  CI never reads the values. Terraform creates *empty* secrets; the values are filled in by hand.
- **Terraform state:** S3, encrypted and versioned, with native lockfile (no DynamoDB table).
- **Environments:** `staging` and `prod`. **Deploys are manual and versioned** (changed in step 6 at
  the owner's request; this replaces "auto-deploy staging on merge"). A staging run cuts `api-vN` /
  `web-vN` from a chosen branch, and production promotes the same image after approval. See
  `docs/releasing.md`.
- **Safety:** ECS deployment circuit breaker with rollback. Health check on `/api/health/ready`
  (already exists in `apps/api/src/app.ts`).
- **Cost target:** about $70–110/mo for both environments. Avoid a NAT gateway: tasks run in public
  subnets with a public IP, and the security group allows ingress **only from the ALB**.

Inspiration: Firmwide's infra practices (Terraform, OIDC, immutable releases, runbooks) plus
SmartCrowd's runtime model (ECS Fargate, test gates, Sentry, notifications).

## Target layout

```
apps/api/                 backend (+ deploy/task-def.json)
apps/web/                 frontend
infra/
  bootstrap/              one-time manual: state bucket, OIDC provider → BOOTSTRAP.md
  modules/                network, ecr, alb, ecs-service, secrets, github-oidc, monitoring
  envs/{staging,prod}/
.github/workflows/
  api.yml                 paths: apps/api/**  → CI, then deploy staging → approve → prod
  web.yml                 paths: apps/web/**  → same
  infra.yml               paths: infra/**     → fmt/validate/tflint/checkov/plan on PR; apply on merge
docs/
  architecture.md, decisions/ (ADRs), runbook.md
README.md                 live demo, badges, diagram, "production readiness" section
```

## Pipeline (per app)

- **PR:** `npm ci` → `npm audit` → lint → typecheck → tests (Mongo and Redis service containers) →
  docker build → Trivy scan → CodeQL. Web also runs the Playwright smoke test.
- **Merge to `main`:** CI only. Nothing deploys.
- **Staging (manual, `deploy-<app>.yml`):** version empty → next `<app>-vN` from Branch → build →
  Trivy → push `job-platform-<app>:<app>-vN` → git tag → deploy → watch rollout → smoke test → commit
  status `deploy/staging/<app>-vN`. Or enter an existing version to redeploy it.
- **Prod (manual):** version must have that staging status → approval gate → same image, no rebuild →
  watch rollout → smoke test. Rollback = promote the previous version.

## Known issues to fix (found during review)

- [x] Rename the default branch `master` → `main`. (Already `main` locally and on `origin`.)
- [x] Old per-repo workflow `apps/api/.github/workflows/ci.yml` is inert inside the monorepo. Move it to
      root `.github/workflows/api.yml` with path filters.
- [x] The old `quality-gate.yml` (in `Code/Node/job-platform-project/.github/`) called
      `npm run test:integration`, which doesn't exist, and used `MONGO_URI` where the API tests expect
      `TEST_MONGODB_URI`. Reconcile when writing the new workflows.
      (Done: `npm test` + `TEST_MONGODB_URI`; no Redis service, since the test harness unsets `REDIS_URL`.)
- [x] `apps/web` has no CI yet. (`.github/workflows/web.yml`)
- [x] `apps/api/Dockerfile`: use `npm ci` instead of `npm install`, and point the healthcheck at
      `/api/health/ready` instead of `/api/test`.
      (The issue was actually in `Dockerfile.chat` and the `docker-compose.chat*.yml` healthchecks;
      `Dockerfile` already used `npm ci`.)
- [x] `apps/api/docker-compose.yml` maps port 3000, but the app listens on 5000.
- [x] `apps/web/next.config.ts`: remove `productionBrowserSourceMaps: true` (it exposes the source
      publicly; upload source maps to Sentry instead). Add `output: "standalone"` for the Docker image.
      Keep the `/api` rewrite for local dev only.
- [x] `apps/web` needs a multi-stage, non-root Dockerfile.

- [x] API tests could not run in CI: `src/utils/email.ts` builds the Resend client at import time and throws
      without `RESEND_API_KEY`, and the payment tests got 503 without SSLCommerz credentials. The failed
      teardown then left Mongo open, so the run hung. Fixed in `tests/helpers/testApp.ts` (dummy key +
      `SSLCOMMERZ_ALLOW_TESTBOX`). Longer term, email.ts should create the client lazily.
- [x] `npm audit --audit-level=high` failed on web (postcss nested in next). Fixed with an npm `overrides`
      entry (`postcss ^8.5.23`) instead of the breaking `next@16` upgrade. Remove it once Next ships a fixed postcss.

### Phase 1 notes

- Path filtering is done inside each workflow (`dorny/paths-filter`) rather than `on.paths`, so the
  required checks `api-ci` and `web-ci` always report and never leave unrelated PRs stuck on "pending".
- Docker build + Trivy in PR CI: added in Phase 2 (`image` job in each workflow).
- Branch protection (owner, once the workflows have run on GitHub at least once):
  `gh api -X PUT repos/Hazrat16/smart-jobhub/branches/main/protection --input -` with
  `{"required_status_checks":{"strict":true,"contexts":["api-ci","web-ci","infra-ci","analyze"]},
  "enforce_admins":false,"required_pull_request_reviews":{"required_approving_review_count":0},
  "restrictions":null,"allow_force_pushes":false,"allow_deletions":false}`

### Phase 2 notes

- `apps/api/Dockerfile` and `apps/web/Dockerfile` are the production images (default target `production`,
  non-root `node` user, `node` as PID 1 so SIGTERM reaches graceful shutdown). The api `development`
  stage is kept for `docker-compose.dev.yml`. `Dockerfile.chat` / `Dockerfile.chat.dev` are now legacy
  (only the `docker-compose.chat*.yml` files use them); delete them or point those files at `Dockerfile`.
- **Node 24** (active LTS) everywhere: Node 20 went EOL in April 2026. npm 11 rejected the api lockfile
  (26 optional platform packages were missing); repaired with `npm install --package-lock-only`, no
  version changes.
- The production stage runs `apk upgrade` and deletes npm/npx/corepack/yarn from the base image. Their
  bundled deps (tar, glob, minimatch, ...) were the Trivy HIGH/CRITICAL findings. Both images scan clean.
- Web image has no `NEXT_PUBLIC_*` values. `src/lib/socket.ts` now uses the page's own origin outside
  dev, so Socket.IO goes through the ALB's `/socket.io/*` rule.
- CI runs Trivy from the pinned `aquasec/trivy` image, not `aquasecurity/trivy-action` (its tags were
  hijacked in a 2026 supply-chain attack).
- Verified locally: both images healthy behind an nginx that mimics the ALB path rules
  (`/`, `/jobs`, `/api/health/ready`, `/api/jobs`, `/socket.io/` all 200).
- ~~Open question: RabbitMQ has no place in AWS.~~ Resolved in Phase 5: RabbitMQ was removed.

### Phase 3 notes

- `infra/bootstrap` (local state first, then migrated to S3) creates the state bucket, the GitHub OIDC
  provider, both ECR repos (via `modules/ecr`), a workload permissions boundary, and two CI roles (via
  `modules/github-oidc`). Provider lock file is committed with linux/darwin hashes.
- **Addition to the three-role decision:** a read-only `infra-planner` role for `terraform plan` on PRs.
  A PR can edit the workflow it runs, so PRs must never assume `infra-deployer`. The three deploy roles
  are unchanged; `api-deployer` / `web-deployer` get created in step 6.
- `job_workflow_ref` scoping uses GitHub's OIDC subject customisation (`repo`, `context`,
  `job_workflow_ref`). The module rejects any subject without `job_workflow_ref`.
- `infra-deployer` = PowerUserAccess + IAM only under `/job-platform/`, and new roles must carry the
  workload boundary (which denies IAM writes, Organizations and account changes, and state-bucket access).
  CI roles live under `/job-platform-ci/` so the pipeline can't edit its own role.
- `infra.yml` currently runs fmt / validate / tflint / checkov (no AWS access). `plan` / `apply` get added
  with the staging stack in step 4.

### Phase 4 notes

- `infra/envs/staging` composes `modules/network`, `modules/alb` (ACM + Route 53 alias + path rules),
  `modules/secrets` and `modules/ecs-service` (one per app). Runbook: `infra/envs/staging/README.md`.
- Needs an existing Route 53 hosted zone; set `zone_name` / `domain_name` in `terraform.tfvars`.
- Services start at `desired_count = 0` and are raised once the secret is filled (step 5) and an
  image is pushed (step 6).
- Staging runs on FARGATE_SPOT. Rough staging cost: about $40/month before Atlas and Redis.
- **Change from the target layout:** no `apps/api/deploy/task-def.json`. Terraform owns the task
  definition (env, secrets, roles). CD takes the latest revision, swaps the image and registers a new
  one; the service ignores `task_definition` changes, so an apply never rolls back the running image.
  A JSON file would have duplicated the env and secret list in two places.
- API change: `app.set("trust proxy", TRUST_PROXY_HOPS)` (1 in ECS). Without it every client behind
  the ALB shared one rate-limit bucket.
- `terraform test` with a mocked AWS provider (root + `modules/alb` + `modules/ecs-service`) runs in CI
  and caught two plan-time `count`/`for_each` bugs before any real plan.
- `infra.yml`: PR → staging plan (infra-planner, output in the job summary); merge → staging apply
  (infra-deployer, `staging` environment). Both are skipped until the bootstrap repo variables exist.
- Fixed a Phase 1 bug that actionlint found: `paths-ignore` isn't a valid CodeQL init input; it now
  goes in `config`.

### Phase 5 notes

- **RabbitMQ removed.** Chat already saved every message and read state directly to MongoDB, and the
  RabbitMQ consumers only logged or repeated those writes. Without a broker, every typing indicator and
  connect/disconnect tried to open a new AMQP connection (error spam, Sentry noise). Amazon MQ or
  CloudAMQP would have cost ~$20–30/month for nothing. Deleted `chat/{rabbitMQ,producer,consumer}.ts`,
  `amqplib`, the three `docker-compose.chat*.yml`, `Dockerfile.chat*`, `env.chat.example`, the two chat
  start scripts, and the three docs that described that stack. `docker-compose.dev.yml` is now the one
  local stack (api + Mongo 7 + Redis), and it now sets `MONGODB_URI` (it used to set `MONGO_URL`, which
  nothing reads).
- **Chat fixed for more than one task:** `sendToUser` emits to the `user:<id>` room (through the Redis
  adapter, to every tab and every task), and `online-users` uses `fetchSockets()` across tasks. Before,
  both only saw sockets on the same task. `tests/chatRealtime.test.ts` runs two Socket.IO servers on one
  Redis and fails against the old code; API CI now has a Redis service for it.
- **Redis:** `modules/redis`, ElastiCache Valkey 8, single node, TLS + 64-char AUTH token,
  `maxmemory-policy noeviction` (BullMQ), ingress from the api SG only. Terraform writes `REDIS_URL` to
  `/job-platform/<env>/redis`. `ecs-service` now takes `secrets = { ENV = { arn, key } }` so one task
  can read several secrets. The planner may read the redis secret (it already reads state, which holds it).
- **Atlas by hand** (`infra/DATA.md`): one project per env, M0 staging / Flex prod, AWS Mumbai,
  `readWrite` on one DB. IP access list is `0.0.0.0/0` because Fargate IPs change and there's no NAT;
  mitigated by TLS-only, per-env users and strong passwords. PrivateLink needs M10+.
- API: the `dns.setServers(8.8.8.8, 1.1.1.1)` workaround for `mongodb+srv` now applies to local dev only.
- **Follow-up:** read-only root filesystem for tasks (checkov CKV_AWS_336, skipped). It needs writable
  volumes for `/tmp` and `.next/cache`, verified on Fargate for the non-root user.
- **Cost check:** staging ≈ $50/month. Prod will be about $60–70 on-demand, plus Atlas Flex ($8–30).
  Total ≈ $120–150, **above the $70–110 target**. The biggest levers: run staging only when needed
  (desired count 0 plus a scheduled scale-down), share one ALB for both envs via host rules (−$18), or
  stay on M0/free Redis for staging.

### Phase 6 notes

- Deploy workflows are `workflow_dispatch` only, one per app so each has its own role. Inputs:
  environment, version, branch. The logic lives in `.github/scripts/resolve-release.sh` and
  `.github/actions/ecs-deploy/` (tested locally: 16 release scenarios on a real git repo, 5 rollout
  outcomes against a stubbed ECS).
- Roles `job-platform-{api,web}-deployer` are in **bootstrap** (`deployers.tf`), not the env stacks, so
  CI can't widen its own deploy rights. They trust `deploy-<app>.yml@refs/heads/main` in the `staging` or
  `production` environment only. Scripts and actions always run from main; the branch being built is
  checked out into `build-src/` and built and scanned before AWS credentials exist in the job.
- The rollout is judged by the new deployment's `rolloutState`, not `services-stable`, because after a
  circuit-breaker rollback the service is stable again, on the old revision.
- The staging → prod gate is a commit status, set only after a rollout that ran tasks and passed the
  smoke test. A service with 0 desired tasks deploys but isn't marked as tested.
- ECR now keeps 200 versions (was 50). Otherwise the version prod runs could expire, and prod couldn't
  start new tasks.
- `infra.yml` still applies staging **infra** on merge to `main` (Terraform, not app deploys). Say if
  that should become manual too.
- `apps/api/deploy/task-def.json` isn't used (see Phase 4 notes); the deploy action derives the new
  revision from the family's latest one.

### Phase 7 notes

- **Infra flow (industry standard, approved):** PR → plan staging + prod. Merge → staging applies
  automatically (the reviewed PR is the approval) → `plan-prod` saves a plan to `s3://<state>/plans/prod/`
  → `apply-prod` waits on the `production` environment and applies **that file** after checking its
  SHA-256. Terraform refuses it if prod state changed in between. No prod changes means no approval.
- `modules/environment` is the one composition. `envs/staging` and `envs/prod` only set values, so
  the two can't drift. `moved` blocks keep an already-applied staging in place.
- `ecs-service` autoscaling: an Application Auto Scaling target is always registered (so changing
  `min_count` resizes even fixed-size services), and there's a CPU target-tracking policy (60%) when
  `max > min`. The service ignores `desired_count`.
- Prod defaults: on-demand Fargate, api 1–3 and web 1–2 tasks, ALB deletion protection, 30-day logs,
  live SSLCommerz. `api_min_count = 2` / `web_min_count = 2` for no-downtime AZ or task loss (+~$13/month
  each). Prod ≈ $65/month + Atlas Flex.
- The circuit breaker with rollback has been on every service since step 4. The deploy action fails the
  run if ECS rolls back.
- The planner now also trusts `ref:refs/heads/main` for infra.yml (the prod plan after merge) and may
  write `plans/*`; saved plans expire after 7 days. **Re-apply the bootstrap.**

### Phase 8 notes

- `modules/monitoring` (per env): SNS topic + email subscriptions; alarms for ALB 5xx, per-app 5xx, api
  p95 latency > 2 s, **no healthy targets** (armed only for services with `min_count >= 1`, missing data
  = down), ECS CPU/memory > 85% for 15 minutes, Valkey memory > 80% (noeviction makes 100% an outage);
  an EventBridge rule for `SERVICE_DEPLOYMENT_FAILED`. About $1/month per env. Every alarm links to its
  runbook section.
- Budget (bootstrap, account-wide): $110/month, emails at 80%/100% actual and 100% forecast.
- **Sentry:** `environment` was `NODE_ENV`, which is `production` in both envs. Now it's
  `SENTRY_ENVIRONMENT` (Terraform: `staging` / `production`), and `release` = `APP_VERSION` (set by the
  deploy, e.g. `api-v12`). Sentry creates releases from events, so no auth token is needed in CI.
- `/api/health` and `/api/health/ready` return `version`; the api deploy's smoke test fails unless the
  new version is the one answering. `modules/environment` exposes `redis_node_type`.
- Docs: `docs/runbook.md` (per-alarm steps, logs, stopped-task reasons, rollback, scaling, costs) and
  `docs/restore-drill.md` (quarterly Atlas restore into a temporary cluster, with count and freshness
  checks and a drill log).
- **Follow-ups:** Sentry for the web app (with source maps uploaded to Sentry, not served publicly);
  activate the `Project`/`Environment` cost allocation tags; first restore drill once prod has data.

### Phase 9 notes

- Root `README.md`: live demo + demo logins (placeholders `<your-domain>`, `<DEMO_PASSWORD>`), CI
  badges, a Mermaid diagram, a "production readiness" table linking to the docs, local setup.
- `docs/architecture.md` (runtime and delivery diagrams, rendered with mermaid-cli to check them) and
  `docs/decisions/` with 9 ADRs.
- Demo data: `apps/api/src/scripts/seedDemo.ts` (`npm run seed:demo`, or
  `node dist/scripts/seedDemo.js` in the image). Idempotent, and it resets the two demo accounts
  (password, suspension, jobs, applications, saved jobs, sessions) without touching real users. Tested in
  `tests/seedDemo.test.ts`. Prod runs it nightly at 03:00 Dhaka via EventBridge Scheduler
  (`demo_reset_schedule`): a one-off Fargate task on the api's latest task definition; `DEMO_PASSWORD`
  comes from the api secret.
- Note: prod uses live SSLCommerz, so the README tells demo visitors not to pay.
- **Owner:** archive `Hazrat16/job-platform` and `Hazrat16/job-platform-frontend`, with a README line:
  "Moved to https://github.com/Hazrat16/smart-jobhub (apps/api | apps/web), history preserved."

### Post-setup changes

- **Email verification is off by default** (`REQUIRE_EMAIL_VERIFICATION`, Terraform
  `require_email_verification`). Sign-up creates a verified account and returns a session (the web app
  already logs straight in when it gets one); login doesn't check `isVerified`. Set it to true to restore
  the old flow. Also fixed: the verification link was hardcoded to `localhost`, and the sender is now
  `EMAIL_FROM` (`email_from`).
- **Sample data** (`seedDemo.ts`): 3 employers + companies, 5 jobseekers (one suspended) with full
  profiles, an optional admin (`SEED_ADMIN_PASSWORD`, never in prod), 14 jobs (all types and statuses,
  one boosted, back-dated), 11 applications with status history, saved jobs, 4 chats, notifications of
  every type, and payments. Idempotent; it only resets `@smartjobhub.test` data. setup.md 10.4 seeds
  staging.

- **No-domain mode (CloudFront).** `zone_name` / `domain_name` are optional. Without them each
  environment is served on `https://<id>.cloudfront.net` (`modules/cdn`: CachingDisabled + AllViewer,
  hashed `/_next/static/*` cached, 5xx never cached). The ALB then has no certificate: it accepts
  HTTP only from CloudFront's origin-facing prefix list, and only with a per-env secret header
  (`X-Origin-Verify`); anything else gets a 403. `TRUST_PROXY_HOPS` is 2 in this mode. Adding a domain
  later switches the environment back to ACM + Route 53 (setup.md, "Later: add a domain").
  Trade-offs: the CloudFront → ALB hop is HTTP, and Resend can only email the account owner.

## Rollout checklist

1. [ ] **CI hygiene:** root workflows with path filters, fixes above, branch protection on `main`.
       (Workflows and fixes done; waiting on push + branch protection.)
2. [x] **Production Dockerfiles** for api and web; both build and run locally.
3. [ ] **Infra bootstrap** (manual, documented in `infra/BOOTSTRAP.md`): state bucket, OIDC provider, ECR.
       (Code done and passes fmt/validate/tflint/checkov; waiting on the owner to run BOOTSTRAP.md.)
4. [ ] **Staging infra:** network, ALB, ACM, Route 53, ECS services.
       (Code done and tested with a mocked provider; waiting on bootstrap + domain in `terraform.tfvars`.)
5. [ ] **Data and secrets:** Atlas cluster, Redis, Secrets Manager values populated.
       (Redis in Terraform, Atlas + secret values documented in `infra/DATA.md`; waiting on the owner.)
6. [ ] **CD workflows:** manual, versioned deploys (`deploy-api.yml`, `deploy-web.yml`).
       (Workflows done and tested locally; need the bootstrap re-applied for the deployer roles, repo/env
       variables, and a first run.)
7. [ ] **Prod:** approval gate, autoscaling, circuit breaker.
       (Code done and tested with mocks; waiting on bootstrap re-apply, prod domain, and first approval.)
8. [ ] **Operations:** CloudWatch alarms → SNS, AWS Budgets alert, Sentry releases, `docs/runbook.md`,
       an Atlas restore test.
       (Code and docs done; waiting on apply, alert email confirmation, and the first restore drill.)
9. [ ] **CV polish:** README diagram, badges, live demo and demo login, ADRs.
       (Done in the repo; waiting on the live URL and demo password in README.md, and archiving the old repos.)

## Prerequisites the owner must provide

- AWS account (root user MFA-protected, plus an IAM admin user with MFA)
- Domain (Route 53, or delegated to it)
- MongoDB Atlas account
- Create the GitHub repo, and archive or rename the old repos (the owner does this; the old backend repo
  is already named `job-platform`, so rename it first or choose a new name)
