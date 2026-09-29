# Staging stack

One VPC (2 public subnets, no NAT), one ALB for `https://<domain_name>`, an ECS cluster with the `api`
and `web` services on FARGATE_SPOT, and an empty Secrets Manager secret `/job-platform/staging/api`.

| Path | Goes to |
|---|---|
| `/api/*`, `/socket.io/*` | api service, port 5000 (sticky sessions) |
| everything else | web service, port 3000 |
| `http://` | 301 to `https://` |

Rough cost with one task each: ALB ~$18, public IPv4 addresses ~$15 (2 for the ALB, 1 per task), Fargate
Spot ~$6, Route 53 + Secrets Manager + logs ~$2. About **$40/month**, before Atlas and Redis.

## Before the first plan

1. The bootstrap is applied and its repo variables are set (`infra/BOOTSTRAP.md`).
2. The Route 53 hosted zone for your domain exists in this account.
3. Set `zone_name` and `domain_name` in `terraform.tfvars` and commit it.

## First apply

CI applies on every merge to `main` that touches `infra/**`, so merging the tfvars change is enough.
From a laptop instead (admin credentials):

```bash
cd infra/envs/staging
terraform init -backend-config="bucket=$(gh variable get TF_STATE_BUCKET)"
terraform plan -out staging.tfplan
terraform apply staging.tfplan
```

The first apply waits for ACM to validate the certificate through DNS, which usually takes 2–5 minutes.
Both services start with `desired_count = 0`, so nothing runs yet and nothing fails.

## Fill in the secret (rollout step 5)

ECS injects each key in `api_secret_keys` (in `variables.tf`) as an env var of the same name. **Every
key must exist in the JSON**, or the task fails to start with `ResourceInitializationError`. Leave optional
ones as `""`:

```bash
aws secretsmanager put-secret-value --secret-id /job-platform/staging/api \
  --secret-string file://staging-api-secret.json    # keep the file out of git, delete it afterwards
```

```json
{
  "MONGODB_URI": "mongodb+srv://...",
  "REDIS_URL": "",
  "JWT_SECRET": "<64 random chars: openssl rand -hex 32>",
  "ADMIN_BOOTSTRAP_SECRET": "<random>",
  "RESEND_API_KEY": "re_...",
  "CLOUDINARY_CLOUD_NAME": "...",
  "CLOUDINARY_API_KEY": "...",
  "CLOUDINARY_API_SECRET": "...",
  "SSLCOMMERZ_STORE_ID": "...",
  "SSLCOMMERZ_STORE_PASSWORD": "...",
  "GROQ_API_KEY": "",
  "SENTRY_DSN": ""
}
```

To add a key: add it to `api_secret_keys` **and** to the secret value *before* merging. Tasks started
from the new task definition fail if the key is missing.

## Turning the services on

Once the secret has values and CD has pushed an image (step 6), set `api_desired_count` and
`web_desired_count` to `1` in `terraform.tfvars`.

## Who owns what

- Terraform owns the task definitions' CPU, memory, env vars, secrets and roles.
- CD owns the running revision and image. It takes the family's **latest** revision, swaps the image and
  registers a new one, so Terraform changes ship with the next deploy. The service has
  `ignore_changes = [task_definition]`, so an apply never rolls the running image back.

## Tests

`terraform test` (here, and in `modules/alb` and `modules/ecs-service`) plans and applies against a
mocked AWS provider, with no credentials needed. CI runs it on every infra PR.
