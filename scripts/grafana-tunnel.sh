#!/usr/bin/env bash
# Opens Grafana (or Prometheus) of an AWS environment on localhost, through an
# SSM port forward into the Grafana task. Nothing is exposed to the internet.
#
#   bash scripts/grafana-tunnel.sh                     # staging Grafana  -> http://localhost:3001
#   bash scripts/grafana-tunnel.sh prod                # prod Grafana
#   bash scripts/grafana-tunnel.sh staging prometheus  # staging Prometheus -> http://localhost:9091
#   bash scripts/grafana-tunnel.sh --password          # print the Grafana admin password
#
# Needs: aws CLI v2 and the Session Manager plugin
# (https://docs.aws.amazon.com/systems-manager/latest/userguide/session-manager-working-with-install-plugin.html).
# Uses AWS_PROFILE / AWS_REGION (defaults: smartjobhub-admin, ap-south-1).
# Ctrl+C closes the tunnel.
set -euo pipefail

PROJECT="job-platform"
export AWS_PROFILE="${AWS_PROFILE:-smartjobhub-admin}"
export AWS_REGION="${AWS_REGION:-ap-south-1}"

ENV="staging"
TARGET="grafana"
SHOW_PASSWORD=false
for arg in "$@"; do
  case "$arg" in
    staging | prod) ENV="$arg" ;;
    grafana | prometheus) TARGET="$arg" ;;
    --password) SHOW_PASSWORD=true ;;
    -h | --help) sed -n '2,13p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done

die() { printf '\033[31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

NAME="${PROJECT}-${ENV}"

if $SHOW_PASSWORD; then
  aws secretsmanager get-secret-value --secret-id "/${PROJECT}/${ENV}/grafana" \
    --query SecretString --output text |
    python3 -c 'import json,sys; print(json.load(sys.stdin)["GF_SECURITY_ADMIN_PASSWORD"])'
  exit 0
fi

command -v session-manager-plugin >/dev/null ||
  die "the AWS Session Manager plugin is not installed (see the link at the top of this script)."

# The Grafana task is the way in for both: ECS Exec is enabled only there, and
# its security group may reach Prometheus.
TASK_ARN=$(aws ecs list-tasks --cluster "$NAME" --service-name "${NAME}-grafana" \
  --desired-status RUNNING --query 'taskArns[0]' --output text)
[[ -n "$TASK_ARN" && "$TASK_ARN" != "None" ]] ||
  die "no running Grafana task in $NAME (is observability_enabled on, and has the service started?)"
TASK_ID="${TASK_ARN##*/}"

RUNTIME_ID=$(aws ecs describe-tasks --cluster "$NAME" --tasks "$TASK_ARN" \
  --query "tasks[0].containers[?name=='app'].runtimeId | [0]" --output text)
[[ -n "$RUNTIME_ID" && "$RUNTIME_ID" != "None" ]] || die "the Grafana container has no runtime ID yet; try again in a minute."

SSM_TARGET="ecs:${NAME}_${TASK_ID}_${RUNTIME_ID}"

if [[ "$TARGET" == "grafana" ]]; then
  LOCAL_PORT=3001
  echo "Grafana for $ENV: http://localhost:${LOCAL_PORT}  (user admin; password: bash $0 $ENV --password)"
  aws ssm start-session --target "$SSM_TARGET" \
    --document-name AWS-StartPortForwardingSession \
    --parameters "portNumber=3000,localPortNumber=${LOCAL_PORT}"
else
  LOCAL_PORT=9091
  echo "Prometheus for $ENV: http://localhost:${LOCAL_PORT}"
  aws ssm start-session --target "$SSM_TARGET" \
    --document-name AWS-StartPortForwardingSessionToRemoteHost \
    --parameters "host=prometheus.${NAME}.internal,portNumber=9090,localPortNumber=${LOCAL_PORT}"
fi
