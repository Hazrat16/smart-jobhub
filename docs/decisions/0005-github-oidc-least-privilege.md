# 5. GitHub OIDC, per-workflow roles, permissions boundary

- **Status:** accepted
- **Date:** 2026-09

## Context

CI needs AWS access to plan and apply Terraform and to deploy two apps. Long-lived access keys in GitHub
secrets are the most common way CI credentials leak.

## Decision

GitHub OIDC only; no static keys. The repo's OIDC subject includes `job_workflow_ref`, so each role
trusts one workflow **file on main** (and a GitHub environment):
- `infra-planner`: read-only, for PR plans and the saved prod plan.
- `infra-deployer`: PowerUser. IAM is allowed only under `/job-platform/`, and every role it creates
  must carry a permissions boundary that denies IAM writes and state-bucket access.
- `api-deployer` / `web-deployer`: push to their own ECR repo, update their own ECS services, and pass
  their own task roles. Nothing else.

The CI roles and the boundary are created by the manual bootstrap stack, never by CI.

## Consequences

- A PR can't assume a write role, even by editing a workflow. `deploy-web` can't deploy the api.
- Deploy workflows run scripts from main and build the chosen branch in a separate checkout, before any
  AWS credentials exist in the job.
- Changing CI permissions means a manual bootstrap apply, which is deliberate.
