# Setup guide

Put the project live on AWS, step by step. Do the steps **in order**, and don't skip the "You should
see" checks.

## Where each step happens

Every step starts with a label that tells you where to do it:

| Label            | Where                                         | What it means                                                         |
| ---------------- | --------------------------------------------- | --------------------------------------------------------------------- |
| 💻 **Terminal**  | Your EC2 work machine (the one you SSH into)  | Type the commands there                                               |
| 📝 **Edit file** | A file in `~/smart-jobhub` on the EC2 machine | Open it with `nano` (or VS Code Remote-SSH, see step 0) and change it |
| 🌐 **Website**   | A website in your browser                     | AWS console, GitHub, Atlas, Resend, your domain registrar             |
| 📧 **Email**     | Your inbox                                    | Click a link that was sent to you                                     |

**Every time you open a new terminal** for this guide, run these two lines first:

```bash
cd ~/smart-jobhub
export AWS_PROFILE=smartjobhub-admin AWS_REGION=ap-south-1
```

The first line takes you to the project folder (you create it in step 0). The second tells the `aws` and `terraform` commands
which AWS account to use (you create that login in step 4). Below, "a ready terminal" means a terminal
where you've run these two lines.

**Replace these everywhere** you see them:

| Write this                                                                           | Instead of      |
| ------------------------------------------------------------------------------------ | --------------- |
| the email that should get alerts                                                     | `<alert-email>` |
| staging's address, e.g. `https://d1abc234xyz.cloudfront.net` (you get it in step 14) | `<staging-url>` |
| production's address (you get it in step 23)                                         | `<prod-url>`    |

> **No domain needed.** Each environment gets a free HTTPS address from AWS CloudFront, like
> `https://d1abc234xyz.cloudfront.net`. You can add your own domain later ("Later: add a domain" at
> the end).

**Cost:** about $120–150 a month once both staging and prod are running. Most of it starts at step 14.
"Stop paying" at the end explains how to turn it off.

---

# Stage A: Prepare (about 1 hour)

## Step 0. Your work machine (EC2)

You run everything from your EC2 machine, not your laptop. That's fine, but the EC2 machine needs its
own copy of the project, because the files on your laptop aren't there.

**How to edit files on it:**

- **`nano`** (simplest): `nano path/to/file` opens the file. Edit it, then press **Ctrl+O** and
  **Enter** to save, and **Ctrl+X** to quit.
- **or VS Code Remote-SSH** (nicer): in VS Code on your laptop, install the **Remote - SSH** extension,
  then _Remote-SSH: Connect to Host…_ → `ubuntu@<your-ec2-address>` → _Open Folder_ →
  `/home/ubuntu/smart-jobhub`. VS Code then edits the files **on the EC2 machine** directly.

The project is copied onto the EC2 machine at the end of step 2 (it needs the GitHub login first).

> If you've changed files on your laptop that aren't on GitHub yet, push them from the laptop first
> (`git push`), so the EC2 copy gets them.

## Step 1. Create the accounts you need

🌐 **Website**

Sign up for each of these (free unless noted):

- [ ] **AWS**: https://aws.amazon.com (needs a card)
- [ ] **MongoDB Atlas**: https://cloud.mongodb.com (database; prod costs about $8–30 a month)
- [ ] **Resend**: https://resend.com (sends emails)
- [ ] **Cloudinary**: https://cloudinary.com (stores uploaded photos and resumes)
- [ ] **SSLCommerz sandbox**: https://developer.sslcommerz.com (test payments)
- [ ] _(optional)_ **Groq**: https://console.groq.com (AI resume analyzer)

## Step 2. Install the tools

💻 **Terminal** (any folder)

```bash
# Basics (fresh Ubuntu EC2 machines don't always have them)
sudo apt update && sudo apt install -y unzip curl git

# AWS CLI version 2
cd /tmp && curl -sSLo awscliv2.zip "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip"
unzip -q awscliv2.zip && sudo ./aws/install --update

# Terraform
wget -qO- https://apt.releases.hashicorp.com/gpg | sudo gpg --dearmor -o /usr/share/keyrings/hashicorp.gpg
echo "deb [signed-by=/usr/share/keyrings/hashicorp.gpg] https://apt.releases.hashicorp.com $(lsb_release -cs) main" \
  | sudo tee /etc/apt/sources.list.d/hashicorp.list
sudo apt update && sudo apt install -y terraform

# GitHub CLI and small helpers
sudo apt install -y gh jq dnsutils openssl
```

**Log the GitHub CLI in with a token that can only touch this one repo** (not your organizations).
Don't use `gh auth login`'s browser option: it can't leave organizations out.

🌐 **Website:** https://github.com/settings/personal-access-tokens/new

| Field             | Value                                                  |
| ----------------- | ------------------------------------------------------ |
| Token name        | `smart-jobhub setup`                                   |
| Resource owner    | **Hazrat16** (your own account, not an organization)   |
| Expiration        | 30 days (make a new one when it expires)               |
| Repository access | **Only select repositories** → `Hazrat16/smart-jobhub` |

Under **Repository permissions**, set these to **Read and write**:
**Actions, Administration, Contents, Environments, Pull requests, Variables, Workflows**.
Set **Commit statuses** to **Read-only**. (**Metadata** is read-only automatically.) Leave everything
else as _No access_, and leave **Account permissions** empty.

Click **Generate token** and copy it (`github_pat_...`).

💻 **Terminal:** paste the token when asked (nothing shows while you paste; that's normal):

```bash
read -rs GH_PAT && echo "$GH_PAT" | gh auth login --with-token && unset GH_PAT
```

Then let `git` use the same token, and copy the project onto this machine:

```bash
gh auth setup-git
git config --global user.name  "Hazrat16"
git config --global user.email "<your GitHub email>"
cd ~ && git clone https://github.com/Hazrat16/smart-jobhub.git
cd ~/smart-jobhub && git log --oneline -1
```

> If a `gh` or `git push` command later says `403` / "Resource not accessible", edit the token on
> GitHub and add the permission it names.

✅ **You should see:**

```bash
aws --version        # aws-cli/2.something
terraform version    # Terraform v1.11 or newer
gh auth status       # Logged in to github.com account Hazrat16
```

## Step 3. Make a safe admin login for AWS

🌐 **Website:** https://console.aws.amazon.com, signed in with your AWS email (the "root" user)

1. [ ] Top right → your name → **Security credentials** → **Assign MFA device**. Set up an
       authenticator app.
2. [ ] Search for **IAM** → **Users** → **Create user**:
   - User name: `admin`
   - Tick **Provide user access to the AWS Management Console**
   - Next → **Attach policies directly** → tick **AdministratorAccess** → Create
3. [ ] Sign out, then sign in again as the **`admin`** user (the sign-in URL is on the page you just
       saw). Use `admin` from now on, never root.
4. [ ] IAM → Users → **admin** → **Security credentials**:
   - **Assign MFA device** (for admin too)
   - **Create access key** → choose **Command Line Interface (CLI)** → copy the **Access key**
     and the **Secret access key**

## Step 4. Connect your terminal to AWS

💻 **Terminal** (any folder)

```bash
aws configure --profile smartjobhub-admin
```

It asks four questions. Paste your keys from step 3:

```
AWS Access Key ID:     (paste the Access key)
AWS Secret Access Key: (paste the Secret access key)
Default region name:   ap-south-1
Default output format: json
```

Then:

```bash
export AWS_PROFILE=smartjobhub-admin AWS_REGION=ap-south-1
aws sts get-caller-identity
```

✅ **You should see** a line like `"Arn": "arn:aws:iam::123456789012:user/admin"`.

## Step 5. Domain: skip for now

Nothing to do. Without a domain, the site runs on a CloudFront address. To add a domain later, see
"Later: add a domain" at the end.

---

# Stage B: GitHub (about 15 minutes)

The `gh` commands run on your EC2 machine, but they change settings on **github.com**.

## Step 6. Check GitHub has run the code once

The code is already on GitHub (you cloned it from there in step 2).

🌐 **Website:** https://github.com/Hazrat16/smart-jobhub/actions

If there are no runs yet, 💻 start them with an empty commit from a ready terminal:
`git commit --allow-empty -m "ci: first run" && git push origin main`.

✅ **You should see** 4 runs (`api`, `web`, `infra`, `codeql`) turn **green**. Some jobs show as
_skipped_; that's normal for now.

## Step 7. GitHub settings

💻 **Terminal** (a ready terminal). Copy and run each block.

**7a. Protect the `main` branch:**

```bash
gh api -X PUT repos/Hazrat16/smart-jobhub/branches/main/protection --input - <<'EOF'
{"required_status_checks": {"strict": true, "contexts": ["api-ci", "web-ci", "infra-ci", "analyze"]},
 "enforce_admins": false,
 "required_pull_request_reviews": {"required_approving_review_count": 0},
 "restrictions": null, "allow_force_pushes": false, "allow_deletions": false}
EOF
```

**7b. Let AWS recognise which GitHub workflow is calling:**

```bash
gh api -X PUT repos/Hazrat16/smart-jobhub/actions/oidc/customization/sub --input - <<'EOF'
{"use_default": false, "include_claim_keys": ["repo", "context", "job_workflow_ref"]}
EOF
```

**7c. Create the `staging` and `production` environments** (production waits for your approval):

```bash
gh api -X PUT repos/Hazrat16/smart-jobhub/environments/staging
gh api -X PUT repos/Hazrat16/smart-jobhub/environments/production --input - <<EOF
{"reviewers": [{"type": "User", "id": $(gh api users/Hazrat16 --jq .id)}],
 "deployment_branch_policy": {"protected_branches": true, "custom_branch_policies": false}}
EOF
```

✅ **You should see,** 🌐 on GitHub → your repo → **Settings**:

- **Branches:** a rule for `main`
- **Environments:** `staging`, and `production` with you as the reviewer

> From now on, change code through **pull requests**. The commands below do this for you.

---

# Stage C: AWS base setup (about 20 minutes, one time only)

This creates the storage for Terraform, the image registry, the logins GitHub uses, and a budget
alert.

## Step 8. Set the budget alert email

📝 **Edit file:** `infra/bootstrap/terraform.tfvars`

```hcl
budget_alert_emails = ["<alert-email>"]
monthly_budget_usd  = 110
```

## Step 9. Create the base setup

💻 **Terminal** (a ready terminal)

```bash
cd infra/bootstrap
terraform init
terraform plan -out bootstrap.tfplan
terraform apply bootstrap.tfplan
```

✅ **You should see** `Apply complete!` with about 25 resources added and **0 destroyed**.

Stay in this folder for steps 10 and 11.

## Step 10. Move Terraform's memory into AWS

💻 **Terminal** (still in `infra/bootstrap`)

```bash
cp backend.tf.example backend.tf
sed -i "s/<ACCOUNT_ID>/$(aws sts get-caller-identity --query Account --output text)/" backend.tf
terraform init -migrate-state
```

When it asks **"Do you want to copy existing state"**, type `yes`. Then:

```bash
rm -f terraform.tfstate terraform.tfstate.backup
terraform plan
```

✅ **You should see** `No changes.`

## Step 11. Tell GitHub about the base setup

💻 **Terminal** (still in `infra/bootstrap`)

```bash
gh variable set AWS_REGION                  --body ap-south-1
gh variable set TF_STATE_BUCKET             --body "$(terraform output -raw state_bucket)"
gh variable set AWS_INFRA_PLANNER_ROLE_ARN  --body "$(terraform output -raw infra_planner_role_arn)"
gh variable set AWS_INFRA_DEPLOYER_ROLE_ARN --body "$(terraform output -raw infra_deployer_role_arn)"
gh variable set WORKLOAD_BOUNDARY_ARN       --body "$(terraform output -raw workload_boundary_arn)"
gh variable set AWS_API_DEPLOYER_ROLE_ARN   --body "$(terraform output -json deployer_role_arns | jq -r .api)"
gh variable set AWS_WEB_DEPLOYER_ROLE_ARN   --body "$(terraform output -json deployer_role_arns | jq -r .web)"

gh api -X POST repos/Hazrat16/smart-jobhub/rulesets --input - <<'EOF'
{"name": "release tags", "target": "tag", "enforcement": "active",
 "conditions": {"ref_name": {"include": ["refs/tags/api-v*", "refs/tags/web-v*"], "exclude": []}},
 "rules": [{"type": "deletion"}, {"type": "non_fast_forward"}, {"type": "update"}]}
EOF
```

Then save the two changed files to GitHub:

```bash
cd ../..
git checkout -b setup/bootstrap
git add infra/bootstrap/backend.tf infra/bootstrap/terraform.tfvars
git commit -m "infra: bootstrap"
gh pr create --fill
gh pr checks --watch && gh pr merge --squash --delete-branch
git checkout main && git pull
```

✅ **You should see:** `gh variable list` shows **7** variables.

---

# Stage D: Email (about 15 minutes)

## Step 12. Email: get a Resend key

🌐 **Website:** https://resend.com → **API Keys → Create API key** (Sending access). Copy the key
(`re_...`) for step 17.

> Without a domain, Resend only sends email **to your own address** (the one you signed up with).
> Sign-up still works, because email verification is off. Password-reset emails, though, only reach
> you. Adding a domain later fixes this.

---

# Stage E: Staging (about 1.5 hours)

## Step 13. Fill in your settings

📝 **Edit file:** `infra/envs/staging/terraform.tfvars`. Only change the email on the first line:

```hcl
alert_emails = ["<alert-email>"]
```

📝 **Edit file:** `infra/envs/prod/terraform.tfvars`, the same way:

```hcl
alert_emails = ["<alert-email>"]
```

Leave the commented-out `zone_name` / `domain_name` lines as they are.

## Step 14. Create staging

💻 **Terminal** (a ready terminal)

```bash
git checkout -b setup/environments
git add infra/envs
git commit -m "infra: staging and prod settings"
gh pr create --fill
gh pr checks --watch && gh pr merge --squash --delete-branch
git checkout main && git pull
```

🌐 **Website:** GitHub → **Actions** → **infra** → **Run workflow** (Use workflow from: `main`, Environment: **`staging`**) → **Run workflow**

- Merging only saved the settings; nothing is applied on merge. This run's `apply-staging` creates
  staging. It takes **about 15 minutes**.
- Production isn't touched. You start it yourself in step 23.

✅ **You should see** `apply-staging` turn green.

Now get staging's address and tell GitHub about it. 💻 **Terminal** (a ready terminal):

```bash
STAGING_URL="https://$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='job-platform-staging'].DomainName" --output text)"
echo "$STAGING_URL"
gh variable set APP_URL --env staging --body "$STAGING_URL"
curl -sI "$STAGING_URL"
```

Write the printed address down. **That's your `<staging-url>`.** The `curl` gets an answer; even a
`503` is fine at this point, because nothing is running yet.

> CloudFront can take 5–10 minutes to start answering after it's created.

## Step 15. Confirm the alert email

📧 **Email:** open "AWS Notification - Subscription Confirmation" and click **Confirm subscription**.
Without this, alerts aren't delivered.

## Step 16. Create the staging database

🌐 **Website:** https://cloud.mongodb.com

1. [ ] **New Project** → name it `job-platform-staging`.
2. [ ] **Create cluster** → **M0 (Free)** → provider **AWS** → region **Mumbai (ap-south-1)** → name
       it `staging`.
3. [ ] **Database Access → Add New Database User:**
   - Username `api`, and click **Autogenerate Secure Password** (copy it)
   - **Specific Privileges → readWrite** on database **`job-platform`**
4. [ ] **Network Access → Add IP Address → Allow access from anywhere** (`0.0.0.0/0`).
5. [ ] **Connect → Drivers** → copy the connection string. Put in your password, and add
       `job-platform` after `.net/`, so it looks like this:

```
mongodb+srv://api:PASSWORD@staging.xxxxx.mongodb.net/job-platform?retryWrites=true&w=majority
```

## Step 17. Save staging's passwords and keys in AWS

**17a.** 💻 **Terminal** (a ready terminal). This creates the file and generates two random secrets:

```bash
cat > /tmp/staging-api.json <<EOF
{
  "MONGODB_URI": "PASTE_FROM_STEP_16",
  "JWT_SECRET": "$(openssl rand -hex 32)",
  "ADMIN_BOOTSTRAP_SECRET": "$(openssl rand -hex 24)",
  "RESEND_API_KEY": "PASTE_FROM_STEP_12",
  "CLOUDINARY_CLOUD_NAME": "PASTE",
  "CLOUDINARY_API_KEY": "PASTE",
  "CLOUDINARY_API_SECRET": "PASTE",
  "SSLCOMMERZ_STORE_ID": "PASTE_SANDBOX_STORE_ID",
  "SSLCOMMERZ_STORE_PASSWORD": "PASTE_SANDBOX_PASSWORD",
  "GROQ_API_KEY": "",
  "SENTRY_DSN": ""
}
EOF
nano /tmp/staging-api.json
```

(In `nano`: edit, **Ctrl+O** then **Enter** to save, **Ctrl+X** to quit.)

**17b.** 📝 **Edit file:** replace every `PASTE…` with the real value and save. Leave `GROQ_API_KEY`
and `SENTRY_DSN` as `""` if you don't use them. **Don't delete any line.**

**17c.** 💻 **Terminal:** upload it.

```bash
jq . /tmp/staging-api.json > /dev/null && echo "file OK"
aws secretsmanager put-secret-value --secret-id /job-platform/staging/api \
  --secret-string file:///tmp/staging-api.json
jq -r .ADMIN_BOOTSTRAP_SECRET /tmp/staging-api.json     # copy this into your password manager
shred -u /tmp/staging-api.json
```

✅ **You should see** `file OK`, then a reply containing `"Name": "/job-platform/staging/api"`.

## Step 18. Build version 1

🌐 **Website:** GitHub → **Actions** → **deploy-api** (left side) → **Run workflow**:

| Field             | Value           |
| ----------------- | --------------- |
| Use workflow from | `main`          |
| Environment       | `staging`       |
| Version           | _(leave empty)_ |
| Branch            | `main`          |

Click **Run workflow**. Then do the same with **deploy-web**.

✅ **You should see** both runs turn green, creating **`api-v1`** and **`web-v1`**. A yellow warning
says "0 desired tasks". That's expected: the servers stay off until step 19.

## Step 19. Switch the staging servers on

💻 **Terminal** (a ready terminal)

```bash
git checkout -b setup/staging-on
sed -i 's/^api_desired_count = 0/api_desired_count = 1/; s/^web_desired_count = 0/web_desired_count = 1/' \
  infra/envs/staging/terraform.tfvars
git commit -am "staging: turn on"
gh pr create --fill
gh pr checks --watch && gh pr merge --squash --delete-branch
git checkout main && git pull
```

🌐 **Website:** GitHub → **Actions** → **infra** → **Run workflow** (Use workflow from: `main`, Environment: **`staging`**) → **Run workflow**, and wait until
its `apply-staging` is green. Then wait 2–3 more minutes.

✅ **You should see,** 💻 in the terminal:

```bash
curl -s <staging-url>/api/health/ready | jq
```

It shows `"status": "ready"`, `"version": "api-v1"`, `"db": "up"` and `"redis": "up"`. 🌐
`<staging-url>` opens the website.

## Step 20. Mark version 1 as tested

🌐 **Website:** GitHub → Actions → **deploy-api** → **Run workflow** again, this time with
**Version `api-v1`**. Then **deploy-web** with **Version `web-v1`**.

✅ **You should see** both green. Only tested versions can go to production.

## Step 21. (Optional) Fill staging with sample data

💻 **Terminal** (a ready terminal). First replace the two `<…>` passwords.

```bash
NET=$(aws ecs describe-services --cluster job-platform-staging --services job-platform-staging-api \
  --query 'services[0].networkConfiguration' --output json)

aws ecs run-task --cluster job-platform-staging --launch-type FARGATE \
  --task-definition job-platform-staging-api --network-configuration "$NET" \
  --overrides '{"containerOverrides":[{"name":"app","command":["node","dist/scripts/seedDemo.js"],
    "environment":[{"name":"SEED_DEMO_CONFIRM","value":"yes"},
                   {"name":"DEMO_PASSWORD","value":"<password for sample users, 10+ characters>"},
                   {"name":"SEED_ADMIN_PASSWORD","value":"<different password for admin, 12+ characters>"}]}]}'
```

Wait one minute, then:

```bash
aws logs tail /ecs/job-platform-staging-api --since 5m | grep demo_seeded
```

✅ **You should see** `"users":9,"jobs":14`. You can now log in with your `DEMO_PASSWORD` as:

| Role      | Emails (all end in `@smartjobhub.test`)                       |
| --------- | ------------------------------------------------------------- |
| Jobseeker | `demo.jobseeker`, `nusrat.jahan`, `rafi.ahmed`, `sadia.islam` |
| Employer  | `demo.employer`, `farhana.rahman`, `tanvir.hasan`             |
| Admin     | `admin`, with `SEED_ADMIN_PASSWORD`                           |

## Step 22. Try staging

🌐 **Website:** `<staging-url>`

- [ ] Register a new user. You're logged in straight away.
- [ ] Create your own admin account. 💻 **Terminal:** paste in the `ADMIN_BOOTSTRAP_SECRET` from
      step 17:

```bash
curl -s -X POST <staging-url>/api/auth/bootstrap-admin \
  -H 'Content-Type: application/json' \
  -H "x-admin-bootstrap-secret: PASTE_ADMIN_BOOTSTRAP_SECRET" \
  -d '{"email":"you@example.com","password":"a-strong-password","name":"Your Name"}' | jq
```

- [ ] (Optional) Open staging's Grafana and watch your clicks show up. See
      [Monitoring](#monitoring-grafana-prometheus-loki) near the end.

---

# Stage F: Production (about 1 hour)

## Step 23. Create production

🌐 **Website:** GitHub → **Actions** → **infra** → **Run workflow** (Use workflow from: `main`, Environment: **`production`**) → **Run workflow**

1. [ ] Open the new run. When `plan-prod` is green, read the plan in its summary.
2. [ ] On `apply-prod`, click **Review deployments**, tick **production**, then **Approve and deploy**.
       Don't want it? Click **Reject** instead; nothing changes and nothing stays waiting.
3. [ ] Wait until it's green (about 15 minutes).
4. [ ] 📧 Confirm the new alert-subscription email (production has its own).
5. [ ] 💻 **Terminal:** get production's address and tell GitHub:

```bash
PROD_URL="https://$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='job-platform-prod'].DomainName" --output text)"
echo "$PROD_URL"
gh variable set APP_URL --env production --body "$PROD_URL"
```

Write it down. **That's your `<prod-url>`.**

> You'll get "ALARM" emails for a while. That's normal: production has nothing running until
> step 26.

## Step 24. Create the production database

🌐 **Website:** https://cloud.mongodb.com. The same as step 16, except:

- Project **`job-platform-prod`**, cluster tier **Flex** (it has backups), name `prod`, AWS Mumbai
- A **new** `api` user with a **new** password
- Network Access `0.0.0.0/0` again

## Step 25. Save production's passwords and keys in AWS

**25a.** 💻 **Terminal** (a ready terminal):

```bash
cat > /tmp/prod-api.json <<EOF
{
  "MONGODB_URI": "PASTE_FROM_STEP_24",
  "JWT_SECRET": "$(openssl rand -hex 32)",
  "ADMIN_BOOTSTRAP_SECRET": "$(openssl rand -hex 24)",
  "RESEND_API_KEY": "PASTE",
  "CLOUDINARY_CLOUD_NAME": "PASTE",
  "CLOUDINARY_API_KEY": "PASTE",
  "CLOUDINARY_API_SECRET": "PASTE",
  "SSLCOMMERZ_STORE_ID": "PASTE_LIVE_STORE_ID",
  "SSLCOMMERZ_STORE_PASSWORD": "PASTE_LIVE_PASSWORD",
  "GROQ_API_KEY": "",
  "SENTRY_DSN": "",
  "DEMO_PASSWORD": "PASTE_A_DEMO_PASSWORD"
}
EOF
nano /tmp/prod-api.json
```

**25b.** 📝 **Edit file:** replace the `PASTE…` values and save.

- `SSLCOMMERZ_*` are your **live** store's details. No live store yet? See "Common problems".
- `DEMO_PASSWORD` is the public demo login shown in the README. Use a password you use nowhere else.

**25c.** 💻 **Terminal:**

```bash
jq . /tmp/prod-api.json > /dev/null && echo "file OK"
aws secretsmanager put-secret-value --secret-id /job-platform/prod/api \
  --secret-string file:///tmp/prod-api.json
jq -r .ADMIN_BOOTSTRAP_SECRET /tmp/prod-api.json     # save in your password manager
shred -u /tmp/prod-api.json
```

## Step 26. Put version 1 live

🌐 **Website:** GitHub → Actions → **deploy-api** → **Run workflow**, with environment
**`production`** and Version **`api-v1`**. Then open the run → **Review deployments** → **Approve**.
Do the same with **deploy-web** and **`web-v1`**.

✅ **You should see** both green. Then 💻:

```bash
curl -s <prod-url>/api/health/ready | jq
```

It shows `"status": "ready"` and `"version": "api-v1"`. 🌐 `<prod-url>` opens, and the
alarm emails switch to **OK**.

Create your prod admin with the command from step 22, using `<prod-url>` and the **prod**
`ADMIN_BOOTSTRAP_SECRET`.

## Step 27. Create the demo accounts on production

💻 **Terminal** (a ready terminal). This also happens automatically every night at 03:00; this runs it
now.

```bash
NET=$(aws ecs describe-services --cluster job-platform-prod --services job-platform-prod-api \
  --query 'services[0].networkConfiguration' --output json)

aws ecs run-task --cluster job-platform-prod --launch-type FARGATE \
  --task-definition job-platform-prod-api --network-configuration "$NET" \
  --overrides '{"containerOverrides":[{"name":"app","command":["node","dist/scripts/seedDemo.js"],"environment":[{"name":"SEED_DEMO_CONFIRM","value":"yes"}]}]}'
```

Wait one minute, then:

```bash
aws logs tail /ecs/job-platform-prod-api --since 5m | grep demo_seeded
```

✅ **You should see** `"users":8,"jobs":14`. 🌐 Log in at `<prod-url>` as
`demo.employer@smartjobhub.test` with your `DEMO_PASSWORD`.

---

# Stage G: Finish (10 minutes)

## Step 28. Last touches

- [ ] 📝 `README.md`: replace `https://&lt;your-domain&gt;` with your `<prod-url>`, and `<DEMO_PASSWORD>` too, then save it with a pull request
      (the same commands as in step 19).
- [ ] 🌐 AWS console → **Billing → Cost allocation tags** → activate `Project` and `Environment`.
- [ ] 🌐 GitHub: archive the old repos `job-platform` and `job-platform-frontend` (Settings → Archive).
- [ ] 📅 Add a reminder every 3 months to follow `docs/restore-drill.md` (a backup check).

**You're live.** 🎉

---

# Everyday: releasing a new version

🌐 **Website:** GitHub → Actions

1. **deploy-api** → environment `staging`, version _empty_. This creates `api-v2` on staging.
2. Test it on `<staging-url>`.
3. **deploy-api** → environment `production`, version `api-v2` → approve. It's live.

The same goes for **deploy-web**. **To undo a release,** deploy the previous version (e.g. `api-v1`) to
production. More in `docs/releasing.md`.

# Monitoring: Grafana, Prometheus, Loki

Staging has its own Grafana with the API's metrics (Prometheus) and logs (Loki). It was created
together with staging in step 14, and the API connected to it at its first deploy (step 18), so
there's nothing to switch on. It has no public address: you open it through a private tunnel. Alert
emails still come from step 15; this is for looking, not for paging. Background:
`docs/observability.md`.

### One time: install the Session Manager plugin

The tunnel uses AWS Session Manager. 💻 **Terminal** (any folder):

```bash
curl -sSLo /tmp/session-manager-plugin.deb \
  "https://s3.amazonaws.com/session-manager-downloads/plugin/latest/ubuntu_64bit/session-manager-plugin.deb"
sudo dpkg -i /tmp/session-manager-plugin.deb
session-manager-plugin --version
```

### Open Grafana

The tunnel opens Grafana on the **EC2 machine**, so your laptop's browser needs a second hop to reach it.

1. 💻 **Terminal** (a ready terminal): get the password, then start the tunnel and leave it running:

   ```bash
   bash scripts/grafana-tunnel.sh --password
   bash scripts/grafana-tunnel.sh
   ```

   ✅ It prints `Grafana for staging: http://localhost:3001` and then
   `Waiting for connections...`.

2. On your **laptop**, forward the same port from the EC2 machine. Pick one:
   - **VS Code Remote-SSH** (from step 0): it usually offers to forward port 3001 by itself. If not,
     open the **Ports** tab → **Forward a Port** → `3001`.
   - **or a laptop terminal:** `ssh -N -L 3001:localhost:3001 ubuntu@<your-ec2-address>` (leave it
     running).

3. 🌐 On your laptop, open **http://localhost:3001** and log in as `admin` with the password from 1.

✅ **You should see** the **Smart JobHub API** dashboard. **API** is **UP**, and **MongoDB** and **Redis**
are **UP**. Click around `<staging-url>` for a minute: the request graphs move and your requests
appear in **API logs** at the bottom. To find one request, paste its `requestId` from a log line
into **Log search** at the top.

**Ctrl+C** in both terminals closes the tunnel. For Prometheus itself, use
`bash scripts/grafana-tunnel.sh staging prometheus` and port `9091` instead of `3001`.

### Turn it on for production (optional, costs money)

Production doesn't have it yet, because it adds about **$30/month** and the budget alert (step 8) is set to
$110 for everything. When you want it:

1. 📝 `infra/envs/prod/main.tf`: change `observability_enabled = false` to `true`.
2. 💻 Save it with a pull request (the same commands as in step 19). Then 🌐 GitHub → Actions →
   **infra** → **Run workflow** from `main`, Environment `production`, and approve `apply-prod`.
3. 🌐 GitHub → Actions → **deploy-api** → environment `production`, **Version** = the version that's
   live now (e.g. `api-v1`) → approve. This connects the API to it, and changes nothing else.
4. 💻 Open it the same way, with `prod`: `bash scripts/grafana-tunnel.sh prod --password` and
   `bash scripts/grafana-tunnel.sh prod`.

> To run the same Grafana on your own computer instead, see "Local stack" in `docs/observability.md`
> (needs Docker, no AWS).

# Stop paying

To delete **everything** this project created in AWS, run 💻 in a ready terminal:

```bash
bash scripts/destroy-everything.sh --dry-run    # shows what it would delete; changes nothing
bash scripts/destroy-everything.sh              # does it; asks you to type the account ID first
```

It switches off the GitHub workflows, then destroys prod, staging and the base setup (state bucket,
image repos, CI roles, budget), and deletes the secrets. It takes about 30–40 minutes, and it's safe to
run again if it stops halfway. At the end it lists what to delete by hand: the Atlas clusters, API keys,
the GitHub token, and your EC2 work machine.

# Later: add a domain

When you buy one (it's only $3–15 a year):

1. 💻 Put it on Route 53 (a ready terminal):
   ```bash
   aws route53 create-hosted-zone --name <your-domain> --caller-reference "setup-$(date +%s)" \
     --query 'DelegationSet.NameServers' --output text
   ```
   🌐 At your registrar, set the domain's **Nameservers** to the 4 names it prints. 💻 Wait until
   `dig NS <your-domain> +short` shows them.
2. 📝 In both `infra/envs/*/terraform.tfvars`, uncomment `zone_name` and `domain_name` and fill them
   in (e.g. `staging.<your-domain>` for staging, `<your-domain>` for prod).
3. 📝 In both `infra/envs/*/main.tf`, add inside `module "env" { ... }`:
   `email_from = "Smart JobHub <no-reply@<your-domain>>"`. 🌐 In Resend → **Domains**, add the domain
   and copy its DNS records into Route 53 (console → Route 53 → your zone → Create record). Then
   click **Verify**.
4. 💻 Save with a pull request (like step 19). Then 🌐 run **infra** from `main` with Environment
   `staging`, and again with `production` (approve `apply-prod`). This switches each
   environment from CloudFront to the domain: HTTPS certificate, DNS record, the load balancer open
   to the internet, and CloudFront removed.
5. 💻 Update the addresses:
   `gh variable set APP_URL --env staging --body "https://staging.<your-domain>"` and the same with
   `--env production`.

# Common problems

| You see                                                   | Do this                                                                                                                                 |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `Not authorized to perform sts:AssumeRoleWithWebIdentity` | Redo step 7b. Always run workflows from `main`.                                                                                         |
| GitHub infra jobs are all _skipped_                       | The variables from step 11 are missing: check `gh variable list`.                                                                       |
| `no matching Route 53 Hosted Zone`                        | A `terraform.tfvars` has `zone_name` / `domain_name` uncommented without a real domain. Comment them out again.                         |
| `403 Forbidden` from an `...elb.amazonaws.com` address    | Expected: the load balancer only answers CloudFront. Use your `<staging-url>` / `<prod-url>`.                                           |
| The CloudFront address doesn't answer yet                 | Wait 5–10 minutes after `apply-staging` / `apply-prod`.                                                                                 |
| Deploy smoke test fails right after step 14 / 23          | `APP_URL` isn't set yet: redo the `gh variable set APP_URL` line from step 14 / 23.                                                     |
| "branch is not allowed to deploy to production"           | Redo step 7a.                                                                                                                           |
| API won't start: `did not contain json key …`             | A line is missing from the step 17 / 25 file. Fix it, upload it again, then re-run the deploy with the same version.                    |
| `/api/health/ready` says `Database not connected`         | Check the step 16 / 24 connection string, the password, and Network Access `0.0.0.0/0`.                                                 |
| "has no successful staging deploy"                        | Do step 20 for that version first.                                                                                                      |
| No live SSLCommerz store yet                              | 📝 In `infra/envs/prod/main.tf`, set `sslcommerz_sandbox = true`, save it with a pull request, run **infra** for `production`, and use sandbox details in step 25. |
| Password-reset emails don't arrive                        | Without a domain they only go to your own Resend address (step 12). Add a domain to fix it.                                             |
| No alarm emails                                           | Step 15 / 23: confirm the subscription email.                                                                                           |
| `session-manager-plugin is not installed`                 | Do "One time: install the Session Manager plugin" under Monitoring.                                                                     |
| Tunnel: `no running Grafana task`                         | Wait 5 minutes after `apply-staging` / `apply-prod`. If it persists, see Troubleshooting in `docs/observability.md`.                    |
| `localhost:3001` doesn't open on your laptop              | The tunnel runs on the EC2 machine: keep it running, and forward port 3001 from your laptop (Monitoring, step 2).                       |
| Grafana shows the API as DOWN, or no API logs             | The API connects at its next deploy: re-run **deploy-api** with the version that's live now.                                            |
| Anything else                                             | `docs/runbook.md` → "Where to look"                                                                                                     |

---

_For background: `infra/BOOTSTRAP.md` (what step 9 creates), `infra/DATA.md` (database and secrets),
`docs/releasing.md`, `docs/runbook.md`, `docs/architecture.md`._
