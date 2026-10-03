# 7. Terraform: S3 native locking, manual applies, saved-plan prod

- **Status:** accepted
- **Date:** 2026-09

## Context

State needs locking, and infra changes need review without making staging tedious or prod risky.

## Decision

- State in a versioned, encrypted S3 bucket with the S3 backend's native lockfile. No DynamoDB table.
- PR: plan staging **and** prod (read-only role). Merge: nothing runs.
- Staging: a manual run of `infra.yml` (Environment `staging`) plans and applies; the reviewed PR is
  the review.
- Prod: a manual run (Environment `production`) saves the plan to `s3://<state>/plans/prod/`. Approving the `production`
  environment applies **that file**, after its SHA-256 matches the plan job's output. Terraform itself
  rejects the plan if prod state changed.
- One composition module (`modules/environment`); `envs/staging` and `envs/prod` only set values.
- `terraform test` with a mocked AWS provider runs in CI (no credentials). It caught several plan-time
  `count`/`for_each` bugs before any real apply.

## Consequences

- What the reviewer approved is exactly what's applied to prod.
- `main` can be ahead of staging until someone runs the staging apply. That's the trade-off for
  nothing changing without a deliberate action (updated 2026-10-03; staging used to auto-apply).
- The two environments can't drift structurally.
