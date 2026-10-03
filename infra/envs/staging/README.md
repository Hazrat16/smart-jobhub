# Staging stack

One VPC (2 public subnets, no NAT), one ALB for `https://<domain_name>`, an ECS cluster with the `api`
and `web` services on FARGATE_SPOT, a single-node Valkey (Redis) cache reachable only from the api, an
empty Secrets Manager secret `/job-platform/staging/api` (you fill it in), and
`/job-platform/staging/redis` (Terraform fills it in). MongoDB is on Atlas; see `infra/DATA.md`.

| Path | Goes to |
|---|---|
| `/api/*`, `/socket.io/*` | api service, port 5000 (sticky sessions) |
| everything else | web service, port 3000 |
| `http://` | 301 to `https://` |

Rough cost with one task each: ALB ~$18, public IPv4 addresses ~$15 (2 for the ALB, 1 per task), Fargate
Spot ~$6, Valkey `cache.t4g.micro` ~$10, Route 53 + Secrets Manager + logs ~$3. About **$50/month**.
Atlas M0 is free.

## Before the first plan

1. The bootstrap is applied and its repo variables are set (`infra/BOOTSTRAP.md`).
2. The Route 53 hosted zone for your domain exists in this account.
3. Set `zone_name` and `domain_name` in `terraform.tfvars` and commit it.

## First apply

Merging doesn't apply anything. After merging the tfvars change, run **Actions → infra → Run
workflow** from `main` with Environment `staging`. From a laptop instead (admin credentials):

```bash
cd infra/envs/staging
terraform init -backend-config="bucket=$(gh api repos/Hazrat16/smart-jobhub/actions/variables/TF_STATE_BUCKET --jq .value)"
terraform plan -out staging.tfplan
terraform apply staging.tfplan
```

The first apply waits for ACM to validate the certificate through DNS, which usually takes 2–5 minutes.
Both services start with `desired_count = 0`, so nothing runs yet and nothing fails.

## Fill in the secret (rollout step 5)

Follow `infra/DATA.md`: create the Atlas cluster and user, then write `/job-platform/staging/api`.
**Every key in `api_secret_keys` (in `variables.tf`) must exist in the JSON**, even as `""`, or the
task fails to start. `REDIS_URL` isn't in that list; it comes from the Terraform-managed redis secret.

To add a key, add it to `api_secret_keys` **and** to the secret value *before* merging.

## Turning the services on

1. Fill in the secret (above).
2. **Actions → deploy-api** and **deploy-web**, environment staging, version empty. This creates `api-v1` /
   `web-v1` and registers them. With 0 desired tasks nothing starts yet; the run says so and doesn't
   mark the version as tested.
3. Set `api_desired_count` and `web_desired_count` to `1` in `terraform.tfvars`, merge, and run
   **infra** for `staging`. The services start on the version from step 2.
4. Run the deploy again with version `api-v1` / `web-v1`. This time the smoke test runs, and the version
   is marked as passed staging, so it can be promoted to production.

See `docs/releasing.md` for everyday releases.

## Who owns what

- Terraform owns the task definitions' CPU, memory, env vars, secrets and roles.
- CD owns the running revision and image. It takes the family's **latest** revision, swaps the image and
  registers a new one, so Terraform changes ship with the next deploy. The service has
  `ignore_changes = [task_definition]`, so an apply never rolls the running image back.

## Tests

`terraform test` (here, and in `modules/alb` and `modules/ecs-service`) plans and applies against a
mocked AWS provider, with no credentials needed. CI runs it on every infra PR.
