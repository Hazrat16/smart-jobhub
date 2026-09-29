#!/usr/bin/env bash
# Decides what a deploy-<app>.yml run does. Writes version, sha and build
# (true = cut and build a new version) to $GITHUB_OUTPUT.
#
# Env: APP (api|web), ENVIRONMENT (staging|production), VERSION (optional),
#      BRANCH (staging new-version only), GITHUB_REF, GITHUB_REPOSITORY, GH_TOKEN.
# Needs a checkout with full history and tags (fetch-depth: 0).
set -euo pipefail

die() { echo "::error::$*"; exit 1; }

prefix="${APP}-v"

# The deployer roles trust only the workflow file on main. Fail with a clear
# message instead of an AWS "not authorized" later.
[[ "${GITHUB_REF}" == "refs/heads/main" ]] ||
  die "Run this workflow from main (\"Use workflow from\"). Choose what to build with the Branch input."

case "${ENVIRONMENT}" in
  staging | production) ;;
  *) die "Unknown environment '${ENVIRONMENT}'." ;;
esac

if [[ -n "${VERSION}" && ! "${VERSION}" =~ ^${prefix}[1-9][0-9]*$ ]]; then
  die "Version must look like ${prefix}12 (got '${VERSION}')."
fi

# Prints the tag's commit, or fails. The message is printed by the caller:
# inside $(...) it would be captured instead of shown.
tag_commit() {
  git rev-parse --verify --quiet "refs/tags/$1^{commit}"
}

missing_version() {
  die "Version $1 doesn't exist. Latest: $(git tag -l "${prefix}*" | sort -V | tail -5 | tr '\n' ' ')"
}

build=false
if [[ "${ENVIRONMENT}" == "staging" && -z "${VERSION}" ]]; then
  git check-ref-format --branch "${BRANCH}" >/dev/null 2>&1 || die "Invalid branch name '${BRANCH}'."
  sha=$(git rev-parse --verify --quiet "refs/remotes/origin/${BRANCH}^{commit}") ||
    die "Branch '${BRANCH}' not found on origin."
  last=$(git tag -l "${prefix}*" | sed "s/^${prefix}//" | grep -E '^[0-9]+$' | sort -n | tail -1 || true)
  version="${prefix}$(( ${last:-0} + 1 ))"
  build=true
  echo "New version ${version} from ${BRANCH} (${sha})."
elif [[ "${ENVIRONMENT}" == "staging" ]]; then
  version="${VERSION}"
  sha=$(tag_commit "${version}") || missing_version "${version}"
  echo "Redeploying existing ${version} (${sha}) to staging."
else
  [[ -n "${VERSION}" ]] || die "Production needs a Version that has passed staging, e.g. ${prefix}12."
  version="${VERSION}"
  sha=$(tag_commit "${version}") || missing_version "${version}"
  # Staging runs record a commit status "deploy/staging/<version>" on success.
  passed=$(gh api --paginate "repos/${GITHUB_REPOSITORY}/commits/${sha}/statuses" \
    --jq ".[] | select(.context == \"deploy/staging/${version}\" and .state == \"success\") | .id" | head -n1)
  [[ -n "${passed}" ]] ||
    die "${version} has no successful staging deploy. Deploy it to staging first."
  echo "Promoting ${version} (${sha}) to production; it passed staging."
fi

{
  echo "version=${version}"
  echo "sha=${sha}"
  echo "build=${build}"
} >> "${GITHUB_OUTPUT}"
