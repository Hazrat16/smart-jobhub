# Infra bootstrap (one-time, manual)

`infra/bootstrap` creates the pieces every other stack and every pipeline depends on. It runs once, from
a laptop, with an admin's credentials. After that, CI does all Terraform work through OIDC roles.

| Resource | Name | Why |
|---|---|---|
| S3 bucket | `job-platform-tfstate-<ACCOUNT_ID>` | Terraform state for all stacks. Versioned, SSE-S3, public access blocked, TLS only, native lockfile. |
| OIDC provider | `token.actions.githubusercontent.com` | Lets GitHub Actions get short-lived AWS credentials. No static keys. |
| ECR repos | `job-platform-api`, `job-platform-web` | IMMUTABLE tags, scan on push, untagged images expire after 7 days, last 200 versions kept. |
| IAM policy | `/job-platform/job-platform-workload-boundary` | Permissions boundary that every role created by the env stacks must carry. |
| IAM role | `/job-platform-ci/job-platform-infra-planner` | `terraform plan` on PRs, and the saved prod plan after merge. ReadOnlyAccess + state read + lock + write to `plans/` (checked by SHA-256 before apply) + read of the Terraform-generated `/job-platform/*/redis` secrets (already in state). |
| IAM role | `/job-platform-ci/job-platform-infra-deployer` | `terraform apply` on `main`. PowerUserAccess + IAM limited to `/job-platform/` and the boundary. |
| IAM role | `/job-platform-ci/job-platform-api-deployer` | `deploy-api.yml` on `main`, in the `staging` or `production` environment. Push/pull `job-platform-api`, update the api services, pass the api task roles. |
| IAM role | `/job-platform-ci/job-platform-web-deployer` | The same for `deploy-web.yml` and the web services. |
| Budget | `job-platform-monthly` | Account-wide, $110/month by default. Emails at 80% and 100% actual, and at 100% forecast. |

The deployer roles live here rather than in the env stacks, so CI can't widen its own deploy permissions.

Expected cost: a few cents a month for S3, plus ECR storage at $0.10/GB-month (about $2/month at 200 versions). The OIDC provider and IAM are free.

## Prerequisites

- An AWS account with MFA on the root user, and an **IAM admin user (or SSO admin) with MFA**. Don't use root.
- AWS CLI **v2** (`aws --version`). The v1 CLI on this machine (1.22) is old; install v2.
- Terraform **1.11 or newer** (1.16.4 is what CI uses).
- GitHub CLI (`gh`), logged in as a repo admin of `Hazrat16/smart-jobhub`.

## 1. Check you are in the right account and region

```bash
export AWS_PROFILE=<your-admin-profile>
export AWS_REGION=ap-south-1
aws sts get-caller-identity          # the Account and Arn must be what you expect
```

## 2. Make GitHub put `job_workflow_ref` in the OIDC subject

The role trust policies match on the token's `sub` claim. By default `sub` only says which repo and
environment the job is in. Adding `job_workflow_ref` means the trust policy can say *which workflow file*
may assume a role, so `web.yml` can never assume the API's role.

```bash
gh api -X PUT repos/Hazrat16/smart-jobhub/actions/oidc/customization/sub \
  --input - <<'EOF'
{"use_default": false, "include_claim_keys": ["repo", "context", "job_workflow_ref"]}
EOF

gh api repos/Hazrat16/smart-jobhub/actions/oidc/customization/sub   # check it stuck
```

Subjects then look like:

```
repo:Hazrat16/smart-jobhub:environment:staging:job_workflow_ref:Hazrat16/smart-jobhub/.github/workflows/infra.yml@refs/heads/main
repo:Hazrat16/smart-jobhub:pull_request:job_workflow_ref:Hazrat16/smart-jobhub/.github/workflows/infra.yml@refs/pull/12/merge
```

If this step is skipped, every role assumption fails with `Not authorized to perform sts:AssumeRoleWithWebIdentity`.

## 3. Create the GitHub environments

The deployer roles trust only jobs that run in these environments.

```bash
gh api -X PUT repos/Hazrat16/smart-jobhub/environments/staging
gh api -X PUT repos/Hazrat16/smart-jobhub/environments/production \
  --input - <<EOF
{"reviewers": [{"type": "User", "id": $(gh api users/Hazrat16 --jq .id)}],
 "deployment_branch_policy": {"protected_branches": true, "custom_branch_policies": false}}
EOF
```

## 4. Apply the bootstrap stack

Set `budget_alert_emails` (and `monthly_budget_usd` if you like) in `terraform.tfvars` first.

```bash
cd infra/bootstrap
terraform init
terraform plan -out bootstrap.tfplan    # read it: about 20 resources, nothing destroyed
terraform apply bootstrap.tfplan
terraform output
```

## 5. Move the bootstrap state into the bucket

State starts out local (the bucket didn't exist yet). Move it so it isn't only on one laptop:

```bash
cp backend.tf.example backend.tf
# edit backend.tf: replace <ACCOUNT_ID> with the value from `aws sts get-caller-identity`
terraform init -migrate-state          # answer "yes"
rm -f terraform.tfstate terraform.tfstate.backup
git add backend.tf && git commit -m "infra: store bootstrap state in S3"
```

## 6. Store the outputs as GitHub repository variables

ARNs and bucket names aren't secrets, so they go in **variables**, not secrets:

```bash
gh variable set AWS_REGION                  --body ap-south-1
gh variable set TF_STATE_BUCKET             --body "$(terraform output -raw state_bucket)"
gh variable set AWS_INFRA_PLANNER_ROLE_ARN  --body "$(terraform output -raw infra_planner_role_arn)"
gh variable set AWS_INFRA_DEPLOYER_ROLE_ARN --body "$(terraform output -raw infra_deployer_role_arn)"
gh variable set WORKLOAD_BOUNDARY_ARN       --body "$(terraform output -raw workload_boundary_arn)"
gh variable set AWS_API_DEPLOYER_ROLE_ARN   --body "$(terraform output -json deployer_role_arns | jq -r .api)"
gh variable set AWS_WEB_DEPLOYER_ROLE_ARN   --body "$(terraform output -json deployer_role_arns | jq -r .web)"

# Per environment: the public URL, used by the deploy workflows' smoke tests and shown on each run.
gh variable set APP_URL --env staging    --body "https://staging.<your-domain>"
gh variable set APP_URL --env production --body "https://<your-domain>"
```

Protect release tags so a version always points at the commit that was tested. Nobody can delete or
move `api-v*` / `web-v*`:

```bash
gh api -X POST repos/Hazrat16/smart-jobhub/rulesets --input - <<'EOF'
{"name": "release tags", "target": "tag", "enforcement": "active",
 "conditions": {"ref_name": {"include": ["refs/tags/api-v*", "refs/tags/web-v*"], "exclude": []}},
 "rules": [{"type": "deletion"}, {"type": "non_fast_forward"}, {"type": "update"}]}
EOF
```

## 7. Check it worked

```bash
B=$(terraform output -raw state_bucket)
aws s3api get-bucket-versioning --bucket "$B"                        # "Status": "Enabled"
aws s3api get-public-access-block --bucket "$B"                      # all four true
aws ecr describe-repositories --query 'repositories[].[repositoryName,imageTagMutability]' --output table
aws iam list-open-id-connect-providers
aws iam get-role --role-name job-platform-infra-deployer --query 'Role.AssumeRolePolicyDocument'
```

## Rules for the env stacks (rollout step 4 onwards)

- Backend: `bucket = <TF_STATE_BUCKET>`, `key = "envs/<env>/terraform.tfstate"`, `use_lockfile = true`, `encrypt = true`.
- Every IAM role they create must use `path = "/job-platform/"` and
  `permissions_boundary = <WORKLOAD_BOUNDARY_ARN>`. Otherwise `infra-deployer` is denied `iam:CreateRole`.
  That is on purpose.
- Customer-managed policies go under `path = "/job-platform/"`.

## Changing or removing the bootstrap

- Changes: edit, then `terraform plan` / `apply` from a laptop with admin credentials. CI never applies
  this stack; `infra-deployer` is denied changes to the boundary and to the state bucket's policy,
  versioning and lifecycle.
- The state bucket has `prevent_destroy`. Tearing everything down means destroying the env stacks
  first, then removing that lifecycle block on purpose. Expect to delete all object versions by hand.
