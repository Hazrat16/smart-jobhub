# Releasing

Deploys are **manual and versioned**. Nothing deploys on merge. Each app has its own workflow:
**Actions → deploy-api** or **deploy-web → Run workflow**, always with *Use workflow from: main*.

| Environment | Version | Branch | What happens |
|---|---|---|---|
| staging | *(empty)* | `main` or any branch | Cuts the next version (`api-v13`) from that branch: build → Trivy scan → push `job-platform-api:api-v13` to ECR → create git tag `api-v13` → deploy → smoke test → mark the commit `deploy/staging/api-v13` ✅ |
| staging | `api-v12` | ignored | Redeploys an existing image. Nothing is rebuilt. |
| production | `api-v12` | ignored | Checks `api-v12` passed staging → **waits for approval** → deploys the **same image** → smoke test |

## Why production doesn't rebuild

The web image has no build-time settings: the browser calls same-origin `/api` and `/socket.io`, and the
ALB routes those to the api. Runtime config (URLs, secrets) comes from the ECS task definition of each
environment. So the image that passed staging is exactly what runs in production, byte for byte.

## Typical flow

1. Merge to `main`. CI runs; nothing deploys.
2. **deploy-api**, staging, version empty → creates `api-v13` and deploys it.
3. Test on staging.
4. **deploy-api**, production, version `api-v13` → a reviewer approves → live.

Apps are versioned separately: `api-v13` and `web-v8` can go out independently.

## Rolling back

Run the workflow with **production** and the previous version (e.g. `api-v12`). It already passed
staging, so it goes straight to approval. If a deploy fails its health checks, ECS rolls back by
itself (circuit breaker) and the run fails with "ECS rolled back to the previous revision".

## Testing a feature branch on staging

Staging, version empty, Branch `feature/x`. You get a normal version (`api-v14`) built from that branch.
It can be promoted to production like any other version, so only promote it if you mean to ship that
branch.

## Guard rails

- **Production only takes versions that passed staging.** The check is the commit status
  `deploy/staging/<version>`, set only after a successful staging rollout and smoke test.
- **Versions can't be overwritten.** ECR tags are IMMUTABLE, and the `release tags` ruleset blocks
  moving or deleting `api-v*` / `web-v*`.
- **Each workflow can only deploy its own app.** `deploy-web` can't assume the api's role, and a branch
  can't edit the deploy workflow to borrow a role: roles trust the workflow file on `main` only.
- **One deploy per app and environment at a time.** Runs queue; they never cancel each other.
- ECR keeps the last 200 versions per app. Don't let production fall further behind than that.

## Where things are

- `.github/workflows/deploy-{api,web}.yml`: the workflows
- `.github/scripts/resolve-release.sh`: version and branch rules, and the staging check
- `.github/actions/ecs-deploy/`: registers the task definition, rolls the service, watches the rollout
- `infra/bootstrap/deployers.tf`: what the deploy roles may do
