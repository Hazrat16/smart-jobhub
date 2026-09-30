# Setup: from an empty AWS account to a live site

Follow the parts **in order**. Each step says what to run and how to check it worked. Don't skip the
checks: most problems later come from an earlier step that half-worked.

**You'll end up with:** `https://staging.<your-domain>` and `https://<your-domain>`, each on ECS Fargate
behind a load balancer with HTTPS, MongoDB on Atlas, Redis on ElastiCache, alarms by email, and
manual versioned releases from GitHub Actions.

**Time:** about 3–4 hours spread over a day (DNS and certificate checks involve some waiting).
**Cost:** about $50/month staging + $65/month prod + Atlas Flex ($8–30). It starts billing in Part 6.
Part 13 explains how to stop it.

Placeholders used below, which you replace with your own values:

| Placeholder | Example |
|---|---|
| `<your-domain>` | `smartjobhub.com` |
| `<alert-email>` | `alerts@smartjobhub.com` (a shared alias is best; it goes in committed files) |
| `<ACCOUNT_ID>` | the 12 digits from `aws sts get-caller-identity` |

---

## Part 1: Accounts you need

Create these before starting. Free tiers are fine except where noted.

- [ ] **AWS account.** You'll need a card.
- [ ] **A domain name,** from any registrar (Namecheap, GoDaddy, Route 53, …).
- [ ] **GitHub.** The repo `Hazrat16/smart-jobhub` must exist, and you must be an admin of it.
- [ ] **MongoDB Atlas.** https://cloud.mongodb.com (staging is free; prod Flex is about $8–30/month).
- [ ] **Resend** for email: https://resend.com
- [ ] **Cloudinary** for uploads: https://cloudinary.com
- [ ] **SSLCommerz.** A **sandbox** store for staging (https://developer.sslcommerz.com). Production
      needs a **live** store, which requires business verification. If you don't have one yet, see Part 10.
- [ ] *(optional)* **Groq** for the AI resume analyzer (https://console.groq.com), and **Sentry** for
      error tracking (https://sentry.io, create a Node.js project and copy its DSN).

## Part 2: Tools on your laptop (Ubuntu)

```bash
# AWS CLI v2 (the apt "awscli" package is the old v1; don't use it)
cd /tmp && curl -sSLo awscliv2.zip "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip"
unzip -q awscliv2.zip && sudo ./aws/install --update && aws --version     # aws-cli/2.x

# Terraform (1.11 or newer)
wget -qO- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install -y terraform && terraform version

# GitHub CLI, jq, dig, openssl
sudo apt install -y gh jq dnsutils openssl
gh auth login          # choose GitHub.com → HTTPS → log in with the browser
gh auth status         # must show your account, with the "repo" and "workflow" scopes

# (optional) mongosh, to test the Atlas connection
# https://www.mongodb.com/try/download/shell
```

- [ ] `aws --version` shows **2.x**, `terraform version` shows **≥ 1.11**, and `gh auth status` is logged in.

## Part 3: Secure the AWS account and get CLI access

In the AWS console (https://console.aws.amazon.com), signed in as **root**:

1. [ ] **Enable MFA on root:** top right → *Security credentials* → *Assign MFA device*.
2. [ ] **Create an admin user:** IAM → Users → *Create user* `admin`, tick *Provide user access to the
       console*, and attach the policy **AdministratorAccess**.
3. [ ] Sign out of root and **sign in as `admin`**. From now on, don't use root.
4. [ ] Enable MFA on `admin` too (IAM → Users → admin → *Security credentials*).
5. [ ] Create a CLI key: IAM → Users → admin → *Security credentials* → *Create access key* →
       *Command Line Interface*. Copy both values.

```bash
aws configure --profile smartjobhub-admin
#   AWS Access Key ID:     <paste>
#   AWS Secret Access Key: <paste>
#   Default region name:   ap-south-1
#   Default output format: json

export AWS_PROFILE=smartjobhub-admin AWS_REGION=ap-south-1
aws sts get-caller-identity
```

- [ ] The output shows `"Arn": "arn:aws:iam::<ACCOUNT_ID>:user/admin"`. Note the 12-digit `<ACCOUNT_ID>`.

> Put `export AWS_PROFILE=smartjobhub-admin AWS_REGION=ap-south-1` at the top of every new terminal
> you use for this guide.

## Part 4: Put your domain on Route 53

The load balancer's HTTPS certificate is validated through DNS, so the domain's DNS must be hosted in
Route 53 in **this** AWS account.

```bash
aws route53 create-hosted-zone --name <your-domain> --caller-reference "setup-$(date +%s)" \
  --query 'DelegationSet.NameServers' --output text
```

That prints four name servers (like `ns-123.awsdns-45.com`).

- [ ] **At your registrar**, replace the domain's name servers with those four. (If you bought the
      domain through Route 53, this is already done.)
- [ ] Wait until the new name servers are live. It usually takes minutes, sometimes a few hours:

```bash
dig NS <your-domain> +short      # must list the same four awsdns name servers
```

> **Already have a website or email on this domain?** Copy its existing DNS records (A, MX, TXT, …)
> into the new hosted zone *before* switching name servers, or they'll stop working. Prod also creates an
> A record for the bare `<your-domain>`. If that's already in use, choose `app.<your-domain>` for prod in
> Part 8.

## Part 5: GitHub setup

### 5.1 Push the code and let CI run once

```bash
cd ~/path/to/smart-jobhub
git push origin main
```

- [ ] GitHub → **Actions**: the `api`, `web`, `infra` and `codeql` runs are green. The AWS jobs are
      *skipped* for now; that's expected.

### 5.2 Protect `main`

This needs the CI checks to have run once (5.1). The `production` environment only accepts deploys from
protected branches.

```bash
gh api -X PUT repos/Hazrat16/smart-jobhub/branches/main/protection --input - <<'EOF'
{"required_status_checks": {"strict": true, "contexts": ["api-ci", "web-ci", "infra-ci", "analyze"]},
 "enforce_admins": false,
 "required_pull_request_reviews": {"required_approving_review_count": 0},
 "restrictions": null, "allow_force_pushes": false, "allow_deletions": false}
EOF
```

- [ ] Settings → Branches shows a rule for `main`.

From here on, make changes with **pull requests**. Terraform plans show up on the PR, which is the
point of the review. The merge commands below wait for the checks first (`gh pr checks --watch`),
because a protected branch won't merge while they're running.

### 5.3 Put the workflow name into the OIDC token

The AWS roles trust a specific workflow *file*. GitHub only includes that in the token after this setting:

```bash
gh api -X PUT repos/Hazrat16/smart-jobhub/actions/oidc/customization/sub --input - <<'EOF'
{"use_default": false, "include_claim_keys": ["repo", "context", "job_workflow_ref"]}
EOF
gh api repos/Hazrat16/smart-jobhub/actions/oidc/customization/sub
```

- [ ] The output shows `"use_default": false` and the three keys.

### 5.4 Create the two environments

```bash
gh api -X PUT repos/Hazrat16/smart-jobhub/environments/staging
gh api -X PUT repos/Hazrat16/smart-jobhub/environments/production --input - <<EOF
{"reviewers": [{"type": "User", "id": $(gh api users/Hazrat16 --jq .id)}],
 "deployment_branch_policy": {"protected_branches": true, "custom_branch_policies": false}}
EOF
```

- [ ] Settings → Environments lists `staging`, and `production` with you as the required reviewer.

## Part 6: Bootstrap AWS (one time)

This creates the Terraform state bucket, the GitHub OIDC login, the image registries (ECR), the CI
roles, and the monthly budget alert. Background: `infra/BOOTSTRAP.md`.

### 6.1 Set the budget email

Edit `infra/bootstrap/terraform.tfvars`:

```hcl
budget_alert_emails = ["<alert-email>"]
monthly_budget_usd  = 110
```

### 6.2 Apply

```bash
cd infra/bootstrap
terraform init
terraform plan -out bootstrap.tfplan    # read it: ~20 resources to add, 0 to destroy
terraform apply bootstrap.tfplan
terraform output
```

- [ ] The apply ends with `Apply complete!`, and `terraform output` shows `state_bucket`,
      `deployer_role_arns` and the rest.

### 6.3 Move the bootstrap state into S3

```bash
cp backend.tf.example backend.tf
sed -i "s/<ACCOUNT_ID>/$(aws sts get-caller-identity --query Account --output text)/" backend.tf
terraform init -migrate-state            # answer: yes
rm -f terraform.tfstate terraform.tfstate.backup
```

- [ ] `terraform plan` now says **No changes**, reading state from S3.

### 6.4 Give GitHub the outputs (variables, not secrets)

Still in `infra/bootstrap`:

```bash
gh variable set AWS_REGION                  --body ap-south-1
gh variable set TF_STATE_BUCKET             --body "$(terraform output -raw state_bucket)"
gh variable set AWS_INFRA_PLANNER_ROLE_ARN  --body "$(terraform output -raw infra_planner_role_arn)"
gh variable set AWS_INFRA_DEPLOYER_ROLE_ARN --body "$(terraform output -raw infra_deployer_role_arn)"
gh variable set WORKLOAD_BOUNDARY_ARN       --body "$(terraform output -raw workload_boundary_arn)"
gh variable set AWS_API_DEPLOYER_ROLE_ARN   --body "$(terraform output -json deployer_role_arns | jq -r .api)"
gh variable set AWS_WEB_DEPLOYER_ROLE_ARN   --body "$(terraform output -json deployer_role_arns | jq -r .web)"

gh variable set APP_URL --env staging    --body "https://staging.<your-domain>"
gh variable set APP_URL --env production --body "https://<your-domain>"
```

Protect release tags, so a version can never be moved or deleted:

```bash
gh api -X POST repos/Hazrat16/smart-jobhub/rulesets --input - <<'EOF'
{"name": "release tags", "target": "tag", "enforcement": "active",
 "conditions": {"ref_name": {"include": ["refs/tags/api-v*", "refs/tags/web-v*"], "exclude": []}},
 "rules": [{"type": "deletion"}, {"type": "non_fast_forward"}, {"type": "update"}]}
EOF
```

- [ ] `gh variable list` shows 7 variables. Settings → Environments → staging and production each show
      `APP_URL`.
- [ ] Check your inbox: AWS Budgets doesn't send a confirmation, but its alerts will come to this address.

### 6.5 Commit the bootstrap changes

```bash
cd ../..
git checkout -b setup/bootstrap
git add infra/bootstrap/backend.tf infra/bootstrap/terraform.tfvars
git commit -m "infra: bootstrap state in S3, budget email"
gh pr create --fill
gh pr checks --watch && gh pr merge --squash --delete-branch
git checkout main && git pull
```

## Part 7: Resend (email) on your domain

Without this, password-reset emails only reach *your own* inbox. (Email verification at sign-up is
**off** by default, so sign-up works without it. To turn verification on later, set
`require_email_verification = true` in the `module "env"` block of `infra/envs/<env>/main.tf`.)

1. [ ] Resend → **Domains** → *Add domain* → `<your-domain>`. It shows 3–4 DNS records (MX, TXT/SPF,
       DKIM).
2. [ ] Add each record in Route 53: console → Route 53 → Hosted zones → `<your-domain>` → *Create
       record*. Copy the name, type and value exactly.
3. [ ] Back in Resend, click *Verify*. It turns **Verified** (usually within minutes).
4. [ ] Resend → **API Keys** → create a key (`re_...`) with *Sending access*. Keep it for Part 9.

## Part 8: Configure the environments and create the infrastructure

### 8.1 Fill in both environments

`infra/envs/staging/terraform.tfvars`:

```hcl
alert_emails = ["<alert-email>"]
zone_name    = "<your-domain>"
domain_name  = "staging.<your-domain>"

api_desired_count = 0
web_desired_count = 0
```

`infra/envs/prod/terraform.tfvars`:

```hcl
alert_emails = ["<alert-email>"]
zone_name    = "<your-domain>"
domain_name  = "<your-domain>"          # or "app.<your-domain>" (see Part 4)
```

Set the email sender (your Resend-verified domain). In **both** `infra/envs/staging/main.tf` and
`infra/envs/prod/main.tf`, add one line inside `module "env" { ... }`:

```hcl
  email_from = "Smart JobHub <no-reply@<your-domain>>"
```

> Fill in **both** environments now, even if prod comes later. After every merge, CI also plans prod,
> and a placeholder domain makes that plan fail. You decide *when* prod is created by when you approve
> it (8.3).

### 8.2 Open a PR and read the plans

```bash
git checkout -b setup/environments
git add infra/envs
git commit -m "infra: staging and prod values"
gh pr create --fill
```

- [ ] The PR's **infra** checks go green. Open *Details* → the `plan (staging)` and `plan (prod)` jobs →
      *Summary*. Each shows a plan adding about 60 resources and destroying none.

### 8.3 Merge and create staging

```bash
gh pr checks --watch && gh pr merge --squash --delete-branch
```

GitHub → Actions → the **infra** run on `main`:

1. `apply-staging` creates staging. It takes about **15 minutes** (the Valkey cache and the certificate
   take longest).
2. `plan-prod` makes the prod plan and shows it in its *Summary*.
3. `apply-prod` **waits for your approval.** Leave it waiting for now; you'll approve it in Part 11. A
   waiting job expires after 30 days, and the next infra merge makes a new plan anyway.

- [ ] `apply-staging` is green.
- [ ] Check it's up: `curl -sI https://staging.<your-domain>` gets an answer over HTTPS (a 503 is
      expected, since nothing is running yet). The certificate is valid in a browser.
- [ ] **Confirm the alert subscription:** AWS sent "AWS Notification - Subscription Confirmation" to
      `<alert-email>`. Click the link. No alerts arrive until you do.

## Part 9: Database and secrets for staging

### 9.1 Atlas cluster

In Atlas (https://cloud.mongodb.com):

1. [ ] Create a **project** `job-platform-staging`.
2. [ ] *Create cluster*: **M0 (Free)**, provider **AWS**, region **Mumbai (ap-south-1)**, name `staging`.
3. [ ] **Security → Database Access → Add user.** Username `api`, password authentication, with a
       generated password:
       `openssl rand -base64 36 | tr -d '/+=' | cut -c1-40`.
       Under *Specific privileges*, role **readWrite** on database **`job-platform`**.
4. [ ] **Security → Network Access → Add IP address → `0.0.0.0/0`.** Tasks have no fixed IP; the reason
       is in `docs/decisions/0004-public-subnets-no-nat.md`.
5. [ ] *Connect → Drivers* → copy the connection string, put in the password, and add the database
       name:

```
mongodb+srv://api:<PASSWORD>@staging.xxxxx.mongodb.net/job-platform?retryWrites=true&w=majority&appName=job-platform-staging
```

- [ ] (optional) `mongosh "<that string>" --eval 'db.runCommand({ping:1})'` prints `{ ok: 1 }`.

### 9.2 Write the staging secret

**Every key below must be present**, even if empty (`""`), or the api won't start.

```bash
umask 077
cat > /tmp/staging-api.json <<'EOF'
{
  "MONGODB_URI": "mongodb+srv://api:...@staging.xxxxx.mongodb.net/job-platform?retryWrites=true&w=majority&appName=job-platform-staging",
  "JWT_SECRET": "REPLACE_1",
  "ADMIN_BOOTSTRAP_SECRET": "REPLACE_2",
  "RESEND_API_KEY": "re_...",
  "CLOUDINARY_CLOUD_NAME": "...",
  "CLOUDINARY_API_KEY": "...",
  "CLOUDINARY_API_SECRET": "...",
  "SSLCOMMERZ_STORE_ID": "your sandbox store id",
  "SSLCOMMERZ_STORE_PASSWORD": "your sandbox store password",
  "GROQ_API_KEY": "",
  "SENTRY_DSN": ""
}
EOF
sed -i "s/REPLACE_1/$(openssl rand -hex 32)/; s/REPLACE_2/$(openssl rand -hex 24)/" /tmp/staging-api.json
nano /tmp/staging-api.json          # fill in the real values, save

jq . /tmp/staging-api.json >/dev/null && echo "valid JSON"
aws secretsmanager put-secret-value --secret-id /job-platform/staging/api \
  --secret-string file:///tmp/staging-api.json
```

- [ ] Check the keys (not the values) are all there:
      `aws secretsmanager get-secret-value --secret-id /job-platform/staging/api --query SecretString --output text | jq -r 'keys[]'`
      lists 11 keys.
- [ ] Copy `ADMIN_BOOTSTRAP_SECRET` somewhere safe (a password manager); you'll use it in 10.5. Then
      delete the file: `shred -u /tmp/staging-api.json`.

## Part 10: First release on staging

### 10.1 Build and register version 1

GitHub → **Actions → deploy-api → Run workflow** (*Use workflow from*: **main**):
Environment `staging`, Version *(empty)*, Branch `main`. Then do the same with **deploy-web**.

- [ ] Both runs are green, and their summaries say `api-v1` / `web-v1`.
- [ ] Each run shows a yellow warning: "0 desired tasks, so nothing was started or tested". That's
      expected for this first run.
- [ ] GitHub → *Tags* shows `api-v1` and `web-v1`.

### 10.2 Start the services

```bash
git checkout main && git pull && git checkout -b setup/staging-on
sed -i 's/^api_desired_count = 0/api_desired_count = 1/; s/^web_desired_count = 0/web_desired_count = 1/' \
  infra/envs/staging/terraform.tfvars
git commit -am "staging: run one task per service"
gh pr create --fill
gh pr checks --watch && gh pr merge --squash --delete-branch
```

- [ ] The **infra** run's `apply-staging` is green (`apply-prod` waits again; leave it).
- [ ] After 2–3 minutes: `curl -s https://staging.<your-domain>/api/health/ready | jq` shows
      `"status": "ready"`, `"version": "api-v1"`, `"db": "up"`, `"redis": "up"`.
- [ ] `https://staging.<your-domain>` loads the site.

### 10.3 Mark v1 as tested

Run **deploy-api** again: environment `staging`, Version **`api-v1`**. Then **deploy-web** with
**`web-v1`**.

- [ ] Both are green. The commit behind `api-v1` shows a ✓ status `deploy/staging/api-v1`, which makes
      it promotable to production.

### 10.4 (optional) Fill staging with sample data

Creates 9 sample accounts (3 employers with companies, 5 jobseekers including one suspended, plus an
admin), 14 jobs of every type and status, applications at every stage, saved jobs, chats, notifications
and payments. Every account is on `@smartjobhub.test`. Running it again resets that data; nothing else
is touched.

```bash
NET=$(aws ecs describe-services --cluster job-platform-staging --services job-platform-staging-api \
  --query 'services[0].networkConfiguration' --output json)
aws ecs run-task --cluster job-platform-staging --launch-type FARGATE \
  --task-definition job-platform-staging-api --network-configuration "$NET" \
  --overrides '{"containerOverrides":[{"name":"app","command":["node","dist/scripts/seedDemo.js"],
    "environment":[{"name":"SEED_DEMO_CONFIRM","value":"yes"},
                   {"name":"DEMO_PASSWORD","value":"<password for the sample accounts, 10+ chars>"},
                   {"name":"SEED_ADMIN_PASSWORD","value":"<a different password, 12+ chars>"}]}]}' \
  --query 'tasks[0].taskArn' --output text

aws logs tail /ecs/job-platform-staging-api --since 5m | grep demo_seeded
```

- [ ] The log shows `demo_seeded` with `"users":9,"jobs":14`.
- [ ] Log in at `https://staging.<your-domain>` with your `DEMO_PASSWORD` as any of these (all
      `@smartjobhub.test`):
      - jobseekers: `demo.jobseeker`, `nusrat.jahan`, `rafi.ahmed`, `sadia.islam`
      - employers: `demo.employer`, `farhana.rahman`, `tanvir.hasan`

      The admin is `admin@smartjobhub.test`, with `SEED_ADMIN_PASSWORD`.

> These passwords are visible in the task's settings in the ECS console. That's fine for staging
> sample accounts; don't reuse them. On a laptop, `npm run seed:demo` in `apps/api` does the same
> against any `MONGODB_URI`.

### 10.5 Try it

- [ ] Register a user on staging. You're logged in straight away (verification is off).
- [ ] Create your admin account:

```bash
curl -s -X POST https://staging.<your-domain>/api/auth/bootstrap-admin \
  -H 'Content-Type: application/json' -H "x-admin-bootstrap-secret: <ADMIN_BOOTSTRAP_SECRET>" \
  -d '{"email":"you@<your-domain>","password":"<a strong password>","name":"Your Name"}' | jq
```

## Part 11: Production

### 11.1 Create prod's infrastructure

GitHub → Actions → the **latest infra run on `main`** → the waiting **`apply-prod`** job:

1. [ ] Open **`plan-prod` → Summary** and read the plan (about 65 resources to add, 0 to destroy).
2. [ ] *Review deployments* → tick **production** → **Approve and deploy**.
3. [ ] `apply-prod` is green (about 15 minutes).

> **Alarm emails right after this are expected.** The prod services exist but have no version and no
> secret values yet, so "no healthy targets" fires until 11.3. If the old `apply-prod` expired, make
> any small infra PR (for example a comment in `infra/envs/prod/README.md`) to get a fresh plan.

- [ ] Confirm the **prod** alert subscription email as well (a separate topic from staging).

### 11.2 Prod database and secret

Repeat Part 9 with these changes:

- [ ] Atlas project **`job-platform-prod`**, cluster tier **Flex** (it has daily backups), name `prod`,
      AWS Mumbai. Create a **new** user `api` with a **different** password, and add network access
      `0.0.0.0/0`.
- [ ] **Different** values for `JWT_SECRET` and `ADMIN_BOOTSTRAP_SECRET` (generate new ones).
- [ ] SSLCommerz **live** store credentials. **No live store yet?** Set
      `sslcommerz_sandbox  = true` in `infra/envs/prod/main.tf` (by PR) until you have one.
- [ ] One extra key, **`DEMO_PASSWORD`**: at least 10 characters. It becomes the *public* demo login,
      so never reuse it anywhere.

Create `/tmp/prod-api.json` the same way as in 9.2 (the same 11 keys, with prod values), plus
`"DEMO_PASSWORD": "..."`. Then:

```bash
jq . /tmp/prod-api.json >/dev/null && echo "valid JSON"
aws secretsmanager put-secret-value --secret-id /job-platform/prod/api \
  --secret-string file:///tmp/prod-api.json
aws secretsmanager get-secret-value --secret-id /job-platform/prod/api \
  --query SecretString --output text | jq -r 'keys[]'      # 12 keys, including DEMO_PASSWORD
shred -u /tmp/prod-api.json
```

### 11.3 Promote the tested versions

**Actions → deploy-api → Run workflow:** environment **production**, Version **`api-v1`**.
It waits for approval: *Review deployments* → approve. Then do **deploy-web** with **`web-v1`**.

- [ ] Both are green.
- [ ] `curl -s https://<your-domain>/api/health/ready | jq` shows `"version": "api-v1"` and
      `"status": "ready"`.
- [ ] `https://<your-domain>` loads, and the alarm emails change to **OK**.
- [ ] Create the prod admin with the `bootstrap-admin` command from 10.5, using prod's secret and URL.

### 11.4 Create the demo accounts now (instead of waiting for 03:00)

```bash
NET=$(aws ecs describe-services --cluster job-platform-prod --services job-platform-prod-api \
  --query 'services[0].networkConfiguration' --output json)
aws ecs run-task --cluster job-platform-prod --launch-type FARGATE \
  --task-definition job-platform-prod-api --network-configuration "$NET" \
  --overrides '{"containerOverrides":[{"name":"app","command":["node","dist/scripts/seedDemo.js"],"environment":[{"name":"SEED_DEMO_CONFIRM","value":"yes"}]}]}' \
  --query 'tasks[0].taskArn' --output text

aws logs tail /ecs/job-platform-prod-api --since 5m | grep demo_seeded
```

- [ ] The log shows `demo_seeded` with `"users":8,"jobs":14` (no admin on prod: the public demo never gets one).
- [ ] Log in at `https://<your-domain>` as `demo.employer@smartjobhub.test` with your `DEMO_PASSWORD`.

## Part 12: Finish up

- [ ] **README.md:** replace `<your-domain>` and `<DEMO_PASSWORD>` (by PR).
- [ ] **Cost tags:** AWS console → Billing → *Cost allocation tags* → activate `Project` and
      `Environment`. They cover costs from then on.
- [ ] **Budget check:** in a day or two, look at Billing → *Bills*. It should be on track for about
      $120–150/month in total.
- [ ] **Old repos:** archive `Hazrat16/job-platform` and `Hazrat16/job-platform-frontend` (Settings →
      Archive), after adding a README line pointing here.
- [ ] **Restore drill:** put a quarterly reminder in your calendar for `docs/restore-drill.md`. Do the
      first one once prod has real data.
- [ ] **Delete the root access key** if you ever created one, and keep the `admin` key only on your laptop.

From now on, releases are: **deploy-<app> → staging (empty version) → test → deploy-<app> → production
(that version) → approve.** Details in `docs/releasing.md`, and what to do when an alarm fires in
`docs/runbook.md`.

## Part 13: Stop paying (tear down)

To pause, set both staging counts to `0` (saves Fargate only; the ALB and Valkey still cost about
$30/month). To remove an environment completely:

```bash
cd infra/envs/staging            # or infra/envs/prod
terraform init -backend-config="bucket=$(gh variable get TF_STATE_BUCKET)"
terraform destroy
```

For **prod**, first turn off the load balancer's deletion protection: in `infra/envs/prod/main.tf`
set `deletion_protection = false`, then `terraform apply`, then `terraform destroy`. Secrets are kept
for 7 days after deletion, so re-creating an environment within a week needs
`aws secretsmanager restore-secret --secret-id /job-platform/<env>/api` (and `/redis`) first.

Destroy **both** environments before touching `infra/bootstrap` (its state bucket is protected on
purpose). Atlas clusters are deleted in the Atlas console.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | 5.3 wasn't done, the run wasn't started from **main**, or a variable from 6.4 is wrong. Check `gh api repos/Hazrat16/smart-jobhub/actions/oidc/customization/sub`. |
| Infra `plan`/`apply` jobs are **skipped** | The GitHub variables from 6.4 are missing. |
| `plan-prod` fails with `no matching Route 53 Hosted Zone` | `infra/envs/prod/terraform.tfvars` still has `example.com` (8.1), or the zone isn't in this account (Part 4). |
| `apply-staging` hangs on `aws_acm_certificate_validation` | The name servers at the registrar don't point to Route 53 yet. `dig NS <your-domain> +short` must list the awsdns servers. |
| Deploy to production is rejected: "branch is not allowed to deploy" | Branch protection on `main` is missing (5.2). |
| api task stops: `ResourceInitializationError ... did not contain json key X` | Key `X` is missing from the secret. Add it (Part 9 / 11.2), then run the deploy again for the same version. |
| `/api/health/ready` returns 503 `Database not connected` | Wrong `MONGODB_URI`, a missing `0.0.0.0/0` in Atlas Network Access, or a user without `readWrite` on `job-platform`. |
| Deploy says "Version api-vN has no successful staging deploy" | Deploy that version to staging first, with the services running (10.3). |
| Password-reset (or verification) emails don't arrive | The Resend domain isn't *Verified* (Part 7), `email_from` isn't set (8.1), or `RESEND_API_KEY` is wrong. Check `aws logs tail /ecs/job-platform-<env>-api --since 30m \| grep -i email`. |
| No alarm emails at all | The SNS subscription wasn't confirmed (8.3 / 11.1). |
| Anything else | `docs/runbook.md` → *Where to look* (logs, ECS events, why tasks stopped). |
