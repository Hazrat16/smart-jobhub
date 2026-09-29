# ---------------------------------------------------------------------------
# api-deployer / web-deployer: used by .github/workflows/deploy-<app>.yml,
# which is started by hand (workflow_dispatch). Each role trusts only its own
# workflow file on main, and only in the staging or production GitHub
# environment (production has required reviewers). They live here, not in the
# env stacks, so CI can never widen its own deploy permissions.
# ---------------------------------------------------------------------------

locals {
  # GitHub environment name => env stack name (cluster job-platform-<stack>).
  deploy_envs = {
    staging    = "staging"
    production = "prod"
  }
}

data "aws_iam_policy_document" "deployer" {
  for_each = var.apps

  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  # Push is only used by staging runs (new versions); production only reads.
  statement {
    sid = "EcrPushPull"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:CompleteLayerUpload",
      "ecr:DescribeImages",
      "ecr:GetDownloadUrlForLayer",
      "ecr:InitiateLayerUpload",
      "ecr:PutImage",
      "ecr:UploadLayerPart",
    ]
    resources = [module.ecr[each.key].repository_arn]
  }

  # Task definitions can't be scoped by family in IAM.
  statement {
    sid = "TaskDefinitions"
    actions = [
      "ecs:DescribeTaskDefinition",
      "ecs:RegisterTaskDefinition",
    ]
    resources = ["*"]
  }

  statement {
    sid     = "OwnServicesOnly"
    actions = ["ecs:DescribeServices", "ecs:UpdateService"]
    resources = [
      for stack in values(local.deploy_envs) :
      "arn:aws:ecs:${var.region}:${local.account_id}:service/${var.project}-${stack}/${var.project}-${stack}-${each.key}"
    ]
  }

  statement {
    sid     = "PassOwnTaskRoles"
    actions = ["iam:PassRole"]
    resources = flatten([
      for stack in values(local.deploy_envs) : [
        "arn:aws:iam::${local.account_id}:role/${var.project}/${var.project}-${stack}-${each.key}-execution",
        "arn:aws:iam::${local.account_id}:role/${var.project}/${var.project}-${stack}-${each.key}-task",
      ]
    ])

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
}

module "deployer" {
  source   = "../modules/github-oidc"
  for_each = var.apps

  name              = "${var.project}-${each.key}-deployer"
  oidc_provider_arn = aws_iam_openid_connect_provider.github.arn
  subjects = [
    for gh_env in keys(local.deploy_envs) :
    "repo:${var.github_repo}:environment:${gh_env}:job_workflow_ref:${var.github_repo}/.github/workflows/deploy-${each.key}.yml@refs/heads/main"
  ]

  inline_policies = { deploy = data.aws_iam_policy_document.deployer[each.key].json }
}
