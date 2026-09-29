# Data and secrets (rollout step 5)

| Store | Where | Managed by | Holds |
|---|---|---|---|
| MongoDB | Atlas, AWS Mumbai (ap-south-1) | **By hand** (this page) | Users, jobs, applications, chat. The only data that matters. |
| Valkey (Redis) | ElastiCache `cache.t4g.micro`, one per env, inside the VPC | Terraform (`modules/redis`) | Socket.IO adapter, rate limits, cache, BullMQ email queue. Safe to lose. |
| `/job-platform/<env>/api` | Secrets Manager | Container by Terraform, **values by hand** | Third-party keys, Mongo URI, JWT secret |
| `/job-platform/<env>/redis` | Secrets Manager | Terraform, end to end | `REDIS_URL` (TLS + generated AUTH token) |

Atlas is set up by hand because the Atlas Terraform provider needs a long-lived Atlas API key in CI.
That's a new standing credential in exchange for automating two clusters that are created once.

## 1. Atlas: one project per environment

Separate projects keep database users and network access lists isolated, and each project can have its
own free M0 cluster.

| | staging | prod |
|---|---|---|
| Project | `job-platform-staging` | `job-platform-prod` |
| Cluster tier | **M0** (free, 512 MB, no backups) | **Flex** (daily snapshots with restore, capped at about $30/month) |
| Provider / region | AWS / Mumbai (ap-south-1) | AWS / Mumbai (ap-south-1) |
| Cluster name | `staging` | `prod` |
| Database | `job-platform` | `job-platform` |

Choose MongoDB 8.0. Move prod to M10 (about $57/month) if you need point-in-time restore, PrivateLink or
more than Flex's limits.

## 2. Network access

Add **`0.0.0.0/0`** to the project's IP access list. Fargate tasks get a new public IP on every deploy
and there's no NAT gateway (the cost decision in PLAN.md), so there's no stable IP to allowlist.

That's safe enough here because:

- Atlas only accepts TLS connections.
- Each environment has its own user with a long random password and access to one database only.
- The password lives only in Secrets Manager and your password manager.

The upgrade path is M10+ with PrivateLink, or a NAT gateway (about $35/month per AZ) plus allowlisting
its Elastic IP.

## 3. Database user

Security → Database Access → Add user:

- Username `api`, **password auth**. Generate the password with
  `openssl rand -base64 36 | tr -d '/+=' | cut -c1-40`. Alphanumeric only, so it needs no URL encoding.
- Built-in role **readWrite**, restricted to database **`job-platform`** ("Specific privileges").
  Not "Atlas admin".

The connection string (Connect → Drivers) becomes:

```
mongodb+srv://api:<PASSWORD>@staging.xxxxx.mongodb.net/job-platform?retryWrites=true&w=majority&appName=job-platform-staging
```

Check it from your laptop: `mongosh "<that string>" --eval 'db.runCommand({ping:1})'`.
Your IP is already covered by `0.0.0.0/0`.

## 4. Fill in the api secret

Run `terraform apply` for the env first, so the secret container exists. Then write the value from a
file that never goes into git:

```bash
umask 077
cat > /tmp/staging-api.json <<'EOF'
{
  "MONGODB_URI": "mongodb+srv://api:...@staging.xxxxx.mongodb.net/job-platform?retryWrites=true&w=majority&appName=job-platform-staging",
  "JWT_SECRET": "<openssl rand -hex 32>",
  "ADMIN_BOOTSTRAP_SECRET": "<openssl rand -hex 24>",
  "RESEND_API_KEY": "re_...",
  "CLOUDINARY_CLOUD_NAME": "...",
  "CLOUDINARY_API_KEY": "...",
  "CLOUDINARY_API_SECRET": "...",
  "SSLCOMMERZ_STORE_ID": "...",
  "SSLCOMMERZ_STORE_PASSWORD": "...",
  "GROQ_API_KEY": "",
  "SENTRY_DSN": ""
}
EOF
aws secretsmanager put-secret-value --secret-id /job-platform/staging/api \
  --secret-string file:///tmp/staging-api.json
shred -u /tmp/staging-api.json
```

- **Every key listed in `api_secret_keys` must be present**, even as `""`. Otherwise the task fails
  with `ResourceInitializationError: ... did not contain json key`.
- Use **different** values for staging and prod, especially `JWT_SECRET` and the Mongo user.
- `REDIS_URL` isn't in this secret. It comes from `/job-platform/<env>/redis`, which Terraform writes.
- **Prod only:** add `"DEMO_PASSWORD": "<at least 10 chars>"`. It's the public demo login shown in the
  README; the nightly reset (`demo_reset_schedule`) sets both demo accounts to it. Since it's public,
  never reuse it anywhere.

Check the keys (not the values) are right:

```bash
aws secretsmanager get-secret-value --secret-id /job-platform/staging/api \
  --query SecretString --output text | jq -r 'keys[]'
```

## 5. Redis: nothing to do by hand

`terraform apply` creates the Valkey node (about 10 minutes the first time), its security group (6379
from the api tasks only), and the `REDIS_URL` secret. It's `rediss://` (TLS) with a 64-character AUTH
token. The token is also in Terraform state, which is why state access is limited to the CI roles
and admins.

## Changing a secret later

ECS reads secrets only when a task **starts**, so running tasks keep the old value. After changing one:

```bash
aws ecs update-service --cluster job-platform-staging --service job-platform-staging-api --force-new-deployment
```

- **Mongo password:** add the new password in Atlas (edit user), update the secret, force a new
  deployment, then check the service is stable.
- **JWT_SECRET:** changing it logs every user out, since existing tokens stop verifying.
- **Redis AUTH token:** `terraform apply -replace=module.redis.random_password.auth`. With
  `auth_token_update_strategy = ROTATE`, ElastiCache accepts **both** the old and new token, so running
  tasks keep working. Force a new deployment so tasks pick up the new `REDIS_URL`. Then drop the old
  token by applying once with the strategy set to `SET` in `modules/redis/main.tf`, and set it back to
  `ROTATE`.
