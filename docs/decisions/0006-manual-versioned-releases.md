# 6. Manual, versioned releases with a staging gate

- **Status:** accepted
- **Date:** 2026-09

## Context

The first plan auto-deployed staging on every merge. The owner wanted deliberate releases, with version
names they can see, test and then promote, like their earlier frontend flow.

## Decision

`deploy-api` / `deploy-web` are `workflow_dispatch` only. Staging with no version cuts the next `api-vN`
from a chosen branch (build → Trivy → push → git tag → deploy → smoke test), or redeploys an existing one.
Production accepts only a version with a `deploy/staging/<version>` commit status, which a successful
staging rollout sets, then waits for approval and deploys the same image. A rollout counts as successful
when the new deployment reaches `rolloutState = COMPLETED`, not merely `services-stable` (which is also
true after a rollback). The smoke test checks `/api/health/ready` reports the new `version`.

## Consequences

- Clear history: every release is a tag, an ECR image and a Sentry release.
- Rolling back = promoting the previous version.
- Merges don't reach users by themselves; someone has to press the button.
- ECR keeps 200 versions, so prod's version can't expire.
