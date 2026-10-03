# Production stack

The same composition as staging (`modules/environment`) with production values:

| | staging | prod |
|---|---|---|
| Fargate | Spot | **On-demand** |
| api tasks | fixed (0 until turned on) | **1–3**, CPU target 60% |
| web tasks | fixed | **1–2**, CPU target 60% |
| ALB deletion protection | off | **on** |
| Log retention | 14 days | **30 days** |
| SSLCommerz | sandbox | **live** |
| VPC | 10.20.0.0/16 | 10.30.0.0/16 |

Rough cost at the minimum size: ALB ~$18, public IPv4 ~$15, Fargate on-demand ~$19, Valkey ~$10, plus
Route 53, Secrets Manager and logs ~$4. About **$65/month**, plus Atlas Flex ($8–30).

## How infra changes reach prod

1. **PR:** `infra.yml` plans staging **and** prod; both plans are in the job summary.
2. **Merge:** nothing is applied.
3. **Run:** Actions → **infra** → **Run workflow** from `main`, Environment `production` (apply
   `staging` the same way first). `plan-prod` plans prod from current
   `main`, saves the plan file to `s3://<state bucket>/plans/prod/`, and shows it in the job summary.
4. **Approve:** `apply-prod` waits on the `production` environment. Read the plan in `plan-prod`'s
   summary, then approve (or **Reject** to drop it). It applies **that saved file**, after checking its
   SHA-256. If someone applied prod in between, Terraform rejects the stale plan; run the workflow again.

If the prod plan has no changes, there's nothing to approve. App versions are deployed separately, with
`deploy-api` / `deploy-web` (`docs/releasing.md`).

## First apply

1. Set `zone_name` and `domain_name` in `terraform.tfvars`.
2. Merge, then run **infra** from `main` with Environment `production` and approve `apply-prod`. The first apply waits for ACM validation (2–5 minutes) and Valkey
   (about 10 minutes).
3. Create the prod Atlas cluster and fill `/job-platform/prod/api` (`infra/DATA.md`). Use **different**
   values from staging.
4. Promote a staging-tested version: **deploy-api**, production, version `api-vN` (and the same for web).

Services start at `min_count = 1` but on a placeholder image tag that doesn't exist, so their tasks
fail to start until step 4. That's expected and costs nothing (failed tasks aren't billed). The first
promote replaces the placeholder. The apply doesn't wait for the services, so it isn't affected.

## High availability

`api_min_count = 2` and `web_min_count = 2` in `terraform.tfvars` put a task in each AZ, so losing one
task or one AZ causes no downtime. Cost is about +$13/month per service.

## Deleting prod

ALB deletion protection has to be switched off first (`deletion_protection = false`, apply). That's
deliberate.
