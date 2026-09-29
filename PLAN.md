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
- **Images:** ECR, **IMMUTABLE** tags, one repo per app (`job-platform-api`, `job-platform-web`), tagged with the git SHA.
- **CI → AWS auth: GitHub OIDC only, no static keys.** Three roles:
  `infra-deployer`, `api-deployer`, `web-deployer`. Trust is scoped by `job_workflow_ref` plus the
  GitHub `environment`, so the web workflow cannot deploy the API.
- **Secrets:** Secrets Manager `/job-platform/{env}/api`. ECS injects them when a task starts, and
  CI never reads the values. Terraform creates *empty* secrets; the values are filled in by hand.
- **Terraform state:** S3, encrypted and versioned, with native lockfile (no DynamoDB table).
- **Environments:** `staging` (auto-deploy on merge to `main`) and `prod` (same image, manual approval
  via the GitHub Environment `production`).
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
- **Merge to `main`:** build the image once → push `:<sha>` to ECR → deploy to staging → wait for the
  service to be stable → smoke test `/api/health/ready` → Sentry release.
- **Prod:** approval gate → same `:<sha>` image, no rebuild → wait for stable → notify.

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
- [ ] `apps/web` needs a multi-stage, non-root Dockerfile. (Deferred to Phase 2.)

- [x] API tests could not run in CI: `src/utils/email.ts` builds the Resend client at import time and throws
      without `RESEND_API_KEY`, and the payment tests got 503 without SSLCommerz credentials. The failed
      teardown then left Mongo open, so the run hung. Fixed in `tests/helpers/testApp.ts` (dummy key +
      `SSLCOMMERZ_ALLOW_TESTBOX`). Longer term, email.ts should create the client lazily.
- [x] `npm audit --audit-level=high` failed on web (postcss nested in next). Fixed with an npm `overrides`
      entry (`postcss ^8.5.23`) instead of the breaking `next@16` upgrade. Remove it once Next ships a fixed postcss.

### Phase 1 notes

- Path filtering is done inside each workflow (`dorny/paths-filter`) rather than `on.paths`, so the
  required checks `api-ci` and `web-ci` always report and never leave unrelated PRs stuck on "pending".
- Docker build + Trivy in PR CI are deferred to Phase 2, once the production Dockerfiles exist.
- Branch protection (owner, once the workflows have run on GitHub at least once):
  `gh api -X PUT repos/Hazrat16/smart-jobhub/branches/main/protection --input -` with
  `{"required_status_checks":{"strict":true,"contexts":["api-ci","web-ci","analyze"]},
  "enforce_admins":false,"required_pull_request_reviews":{"required_approving_review_count":0},
  "restrictions":null,"allow_force_pushes":false,"allow_deletions":false}`

## Rollout checklist

1. [ ] **CI hygiene:** root workflows with path filters, fixes above, branch protection on `main`.
       (Workflows and fixes done; waiting on push + branch protection.)
2. [ ] **Production Dockerfiles** for api and web; both build and run locally.
3. [ ] **Infra bootstrap** (manual, documented in `infra/BOOTSTRAP.md`): state bucket, OIDC provider, ECR.
4. [ ] **Staging infra:** network, ALB, ACM, Route 53, ECS services.
5. [ ] **Data and secrets:** Atlas cluster, Redis, Secrets Manager values populated.
6. [ ] **CD workflows:** merge to `main` deploys to staging automatically.
7. [ ] **Prod:** approval gate, autoscaling, circuit breaker.
8. [ ] **Operations:** CloudWatch alarms → SNS, AWS Budgets alert, Sentry releases, `docs/runbook.md`,
       an Atlas restore test.
9. [ ] **CV polish:** README diagram, badges, live demo and demo login, ADRs.

## Prerequisites the owner must provide

- AWS account (root user MFA-protected, plus an IAM admin user with MFA)
- Domain (Route 53, or delegated to it)
- MongoDB Atlas account
- Create the GitHub repo, and archive or rename the old repos (the owner does this; the old backend repo
  is already named `job-platform`, so rename it first or choose a new name)
