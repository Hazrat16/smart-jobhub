#!/usr/bin/env bash
# Registers a new revision of the service's task definition family with IMAGE
# and waits for ECS to finish (or roll back) the deployment.
#
# The new revision is based on the family's latest revision, so env, secret and
# size changes applied by Terraform ship with the next deploy.
# Env: CLUSTER, SERVICE, IMAGE, TIMEOUT_SECONDS (default 1200).
set -euo pipefail

timeout="${TIMEOUT_SECONDS:-1200}"

read -r current desired < <(aws ecs describe-services --cluster "${CLUSTER}" --services "${SERVICE}" \
  --query 'services[0].[taskDefinition, desiredCount]' --output text)
[[ "${current}" == arn:* ]] || { echo "::error::Service ${SERVICE} not found in ${CLUSTER}."; exit 1; }
family=$(aws ecs describe-task-definition --task-definition "${current}" \
  --query 'taskDefinition.family' --output text)

# Latest ACTIVE revision of the family (Terraform may have registered one
# since the last deploy), with only the app container's image swapped.
aws ecs describe-task-definition --task-definition "${family}" --query taskDefinition --output json |
  jq --arg image "${IMAGE}" '
    .containerDefinitions |= map(if .name == "app" then .image = $image else . end)
    | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities,
          .registeredAt, .registeredBy, .deregisteredAt)' > taskdef.json

jq -e --arg image "${IMAGE}" 'any(.containerDefinitions[]; .name == "app" and .image == $image)' taskdef.json >/dev/null ||
  { echo "::error::No container named 'app' in ${family}."; exit 1; }

new_arn=$(aws ecs register-task-definition --cli-input-json file://taskdef.json \
  --query 'taskDefinition.taskDefinitionArn' --output text)
rm -f taskdef.json
echo "Registered ${new_arn}"

aws ecs update-service --cluster "${CLUSTER}" --service "${SERVICE}" \
  --task-definition "${new_arn}" --query 'service.serviceName' --output text >/dev/null

# The circuit breaker rolls a failed deployment back. After a rollback the
# service is "stable" again, but on the old revision, so watch this
# deployment's own rolloutState instead of waiting for services-stable.
deadline=$(( $(date +%s) + timeout ))
while :; do
  state=$(aws ecs describe-services --cluster "${CLUSTER}" --services "${SERVICE}" \
    --query "services[0].deployments[?taskDefinition=='${new_arn}'] | [0].rolloutState" --output text)
  case "${state}" in
    COMPLETED) echo "Deployment completed."; break ;;
    FAILED)    echo "::error::Deployment failed; ECS rolled back to the previous revision."; exit 1 ;;
    None | "") echo "::error::Deployment disappeared (replaced or rolled back)."; exit 1 ;;
  esac
  (( $(date +%s) < deadline )) || { echo "::error::Timed out after ${timeout}s (state: ${state})."; exit 1; }
  echo "Rollout: ${state}"
  sleep "${POLL_SECONDS:-15}"
done

if [[ "${desired}" == "0" ]]; then
  echo "::warning::${SERVICE} has 0 desired tasks, so nothing was started or tested. Raise its desired count in Terraform; it will start on this revision. Then redeploy this version to test it."
fi

{
  echo "task_definition_arn=${new_arn}"
  echo "desired_count=${desired}"
} >> "${GITHUB_OUTPUT}"
