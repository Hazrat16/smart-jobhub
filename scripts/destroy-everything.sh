#!/usr/bin/env bash
# Destroys everything this project created in AWS: prod, staging, then the
# bootstrap (state bucket, ECR repos, CI roles, OIDC provider, budget), and
# removes the app secrets. Also switches off the GitHub workflows so nothing
# gets re-created. Atlas, Resend, Cloudinary etc. are listed at the end to do
# by hand.
#
#   bash scripts/destroy-everything.sh --dry-run   # show what it would do
#   bash scripts/destroy-everything.sh             # do it (asks for confirmation)
#
# Needs: aws, terraform, jq (and gh, optional, to switch off the workflows).
# Uses AWS_PROFILE / AWS_REGION (defaults: smartjobhub-admin, ap-south-1).
# Safe to re-run: environments that are already gone are skipped.
set -euo pipefail

PROJECT="job-platform"
REPO="Hazrat16/smart-jobhub"
export AWS_PROFILE="${AWS_PROFILE:-smartjobhub-admin}"
export AWS_REGION="${AWS_REGION:-ap-south-1}"

DRY_RUN=false
ASSUME_YES=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=true ;;
    --yes) ASSUME_YES=true ;;
    -h | --help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INFRA="$ROOT/infra"

bold() { printf '\n\033[1m== %s\033[0m\n' "$*"; }
info() { printf '   %s\n' "$*"; }
warn() { printf '\033[33m   ! %s\033[0m\n' "$*"; }
die() { printf '\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# Runs a command, or only prints it with --dry-run.
run() {
  if $DRY_RUN; then
    printf '   [dry-run] %s\n' "$*" >&2
  else
    "$@"
  fi
}

# --- preflight ---------------------------------------------------------------

for tool in aws terraform jq; do
  command -v "$tool" >/dev/null || die "'$tool' is not installed."
done
HAVE_GH=true
command -v gh >/dev/null || HAVE_GH=false

bold "Checking the AWS account"
ACCOUNT=$(aws sts get-caller-identity --query Account --output text) ||
  die "Can't reach AWS with profile '$AWS_PROFILE'. Run: export AWS_PROFILE=smartjobhub-admin"
CALLER=$(aws sts get-caller-identity --query Arn --output text)
BUCKET="${PROJECT}-tfstate-${ACCOUNT}"
info "Account: $ACCOUNT"
info "As:      $CALLER"
info "Region:  $AWS_REGION"
info "State:   s3://$BUCKET"

aws s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1 && BUCKET_EXISTS=true || BUCKET_EXISTS=false
$BUCKET_EXISTS || warn "The state bucket doesn't exist. Environments and bootstrap look already destroyed."

cat <<EOF

This PERMANENTLY deletes, in account $ACCOUNT:
  - production and staging (ECS, load balancers, CloudFront, Valkey, VPCs, alarms, ...)
  - the bootstrap: Terraform state bucket (all state history), ECR repos (all images),
    CI roles, the GitHub OIDC provider, the budget
  - the secrets /${PROJECT}/{staging,prod}/{api,redis,grafana}
It does NOT touch MongoDB Atlas (delete those clusters by hand; steps at the end).
EOF
if $DRY_RUN; then
  info "Dry run: nothing will be changed."
elif ! $ASSUME_YES; then
  printf '\nType the account ID (%s) to continue: ' "$ACCOUNT"
  read -r answer
  [[ "$answer" == "$ACCOUNT" ]] || die "Cancelled (that wasn't $ACCOUNT)."
fi

# --- 1. GitHub: stop anything from re-creating resources ---------------------

bold "1/5 Switching off the GitHub workflows"
if $HAVE_GH && gh auth status >/dev/null 2>&1; then
  for wf in infra.yml deploy-api.yml deploy-web.yml; do
    for id in $(gh run list -R "$REPO" --workflow "$wf" --json databaseId,status \
      -q '.[] | select(.status != "completed") | .databaseId' 2>/dev/null); do
      run gh run cancel -R "$REPO" "$id" || true
    done
    run gh workflow disable -R "$REPO" "$wf" || true
  done
else
  warn "gh isn't logged in: switch off infra, deploy-api and deploy-web by hand (GitHub → Actions → ⋯ → Disable)."
fi

# --- 2 & 3. Environments -----------------------------------------------------

destroy_env() {
  local env="$1" dir="$INFRA/envs/$1"
  bold "Destroying $env"
  if ! $BUCKET_EXISTS; then
    info "No state bucket, so nothing to destroy."
    return
  fi
  (
    cd "$dir"
    terraform init -input=false -reconfigure -backend-config="bucket=$BUCKET" >/dev/null
    if [[ -z "$(terraform state list 2>/dev/null)" ]]; then
      info "Nothing in $env's state, so skipping."
      exit 0
    fi
    info "$(terraform state list | wc -l | tr -d ' ') resources in state."

    # Prod's load balancer has deletion protection; Terraform can't delete it while that's on.
    local alb
    alb=$(aws elbv2 describe-load-balancers --names "${PROJECT}-${env}" \
      --query 'LoadBalancers[0].LoadBalancerArn' --output text 2>/dev/null || true)
    if [[ -n "$alb" && "$alb" != "None" ]]; then
      run aws elbv2 modify-load-balancer-attributes --load-balancer-arn "$alb" \
        --attributes Key=deletion_protection.enabled,Value=false >/dev/null
    fi

    if $DRY_RUN; then
      terraform plan -destroy -input=false -no-color | grep -E '^Plan:|No changes' || true
    else
      terraform destroy -auto-approve -input=false
    fi
  )
}

destroy_env prod
destroy_env staging

# --- 4. Bootstrap --------------------------------------------------------------
#
# Protected on purpose: the state bucket has prevent_destroy, holds the
# bootstrap's own state, and must be emptied (all versions); ECR repos refuse
# deletion while they hold images. So work on a temporary copy: move the state
# to a local file there, lift the protections, apply them, then destroy.
# The repo itself is never edited.

bold "4/5 Destroying the bootstrap"
if ! $BUCKET_EXISTS; then
  info "State bucket already gone, so nothing to destroy."
else
  WORK=$(mktemp -d)
  keep_work=false
  trap '$keep_work && warn "Bootstrap state is kept in $WORK/infra/bootstrap/terraform.tfstate. Re-run the script, or cd there and run terraform destroy."' EXIT
  cp -r "$INFRA" "$WORK/infra"
  rm -rf "$WORK"/infra/bootstrap/.terraform "$WORK"/infra/envs/*/.terraform
  B="$WORK/infra/bootstrap"

  cat > "$B/backend.tf" <<EOF
terraform {
  backend "s3" {
    bucket       = "$BUCKET"
    key          = "bootstrap/terraform.tfstate"
    region       = "$AWS_REGION"
    encrypt      = true
    use_lockfile = true
  }
}
EOF
  (cd "$B" && terraform init -input=false >/dev/null)

  if [[ -z "$(cd "$B" && terraform state list 2>/dev/null)" ]]; then
    warn "The bootstrap state is empty. If the bucket still exists, delete it by hand in the S3 console."
  else
    keep_work=true
    # Move the state out of the bucket we're about to delete.
    rm "$B/backend.tf"
    (cd "$B" && terraform init -input=false -migrate-state -force-copy >/dev/null)
    [[ -s "$B/terraform.tfstate" ]] || die "State didn't move to $B/terraform.tfstate. Stopping."

    # Lift the protections (in the copy only).
    perl -0pi -e 's/\n  lifecycle \{\n    prevent_destroy = true\n  \}\n//' "$B/main.tf"
    perl -pi -e 's/^  bucket = local\.state_bucket$/  bucket        = local.state_bucket\n  force_destroy = true/' "$B/main.tf"
    perl -pi -e 's/force_delete(\s+)= false/force_delete$1= true/' "$WORK/infra/modules/ecr/main.tf"
    grep -q 'prevent_destroy' "$B/main.tf" && die "Couldn't remove prevent_destroy in the copy."
    grep -q 'force_destroy = true' "$B/main.tf" || die "Couldn't set force_destroy in the copy."
    grep -q 'force_delete *= true' "$WORK/infra/modules/ecr/main.tf" || die "Couldn't set force_delete in the copy."

    (
      cd "$B"
      if $DRY_RUN; then
        terraform plan -destroy -input=false -no-color | grep -E '^Plan:' || true
      else
        # Only the bucket and ECR flags change here; nothing is destroyed yet.
        terraform apply -auto-approve -input=false \
          -target=aws_s3_bucket.tfstate -target='module.ecr["api"].aws_ecr_repository.this' \
          -target='module.ecr["web"].aws_ecr_repository.this'
        terraform destroy -auto-approve -input=false
      fi
    )
    $DRY_RUN || keep_work=false
  fi
  $keep_work || rm -rf "$WORK"
fi

# --- 5. Secrets and leftovers ------------------------------------------------

bold "5/5 Deleting secrets now (skipping the 7-day recovery window)"
for env in staging prod; do
  for name in api redis grafana; do
    id="/${PROJECT}/${env}/${name}"
    if aws secretsmanager describe-secret --secret-id "$id" >/dev/null 2>&1; then
      if run aws secretsmanager delete-secret --secret-id "$id" --force-delete-without-recovery >/dev/null; then
        $DRY_RUN || info "deleted $id"
      else
        warn "couldn't delete $id now (it will still be removed when its 7-day window ends)"
      fi
    fi
  done
done

bold "Checking for anything left (tagged Project=${PROJECT})"
left=0
for region in "$AWS_REGION" us-east-1; do
  arns=$(aws resourcegroupstaggingapi get-resources --region "$region" \
    --tag-filters "Key=Project,Values=${PROJECT}" \
    --query 'ResourceTagMappingList[].ResourceARN' --output text 2>/dev/null || true)
  if [[ -n "$arns" ]]; then
    left=1
    warn "$region still has:"
    tr '\t' '\n' <<<"$arns" | sed 's/^/     /'
  fi
done
if [[ $left -eq 0 ]]; then
  info "Nothing left."
elif $DRY_RUN; then
  info "(Expected in a dry run: nothing was deleted.)"
else
  warn "Some resources are still listed. The tag index can lag a few minutes; if they're still there later, re-run this script."
fi

cat <<'EOF'

Done in AWS. Still to do by hand:
  [ ] Atlas: terminate the staging/prod clusters, then delete the projects (cloud.mongodb.com)
  [ ] GitHub: delete the "smart-jobhub setup" fine-grained token (Settings → Developer settings)
  [ ] Resend / Cloudinary: delete the API keys you created
  [ ] AWS IAM: delete the admin user's access key (or the user) if you don't need it any more
  [ ] Your EC2 work machine: terminate it if you only used it for this project
  [ ] In a day or two: Billing → Bills, to confirm charges have stopped
EOF
