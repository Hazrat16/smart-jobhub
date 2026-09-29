# One GitHub OIDC provider per AWS account. AWS validates GitHub's tokens against
# its own trusted CA list, so no thumbprint is pinned here.
resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

# ---------------------------------------------------------------------------
# Permissions boundary for every role that infra-deployer creates (ECS task
# roles, execution roles, and later the api/web deployer roles). It stops a
# compromised infra pipeline from minting itself an unbounded admin role.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "workload_boundary" {
  # A permissions boundary is a ceiling, not a grant: effective access is the role's own
  # policies intersected with this, minus the denies below. "*" is the intended shape.
  # checkov:skip=CKV_AWS_1:Permissions boundary, not a grant (see above).
  # checkov:skip=CKV_AWS_49:Permissions boundary, not a grant (see above).
  # checkov:skip=CKV_AWS_107:Permissions boundary, not a grant (see above).
  # checkov:skip=CKV_AWS_108:Permissions boundary, not a grant (see above).
  # checkov:skip=CKV_AWS_109:Permissions boundary, not a grant (see above).
  # checkov:skip=CKV_AWS_110:Permissions boundary, not a grant (see above).
  # checkov:skip=CKV_AWS_111:Permissions boundary, not a grant (see above).
  # checkov:skip=CKV_AWS_356:Permissions boundary, not a grant (see above).
  # checkov:skip=CKV2_AWS_40:Permissions boundary, not a grant (see above).
  statement {
    sid       = "AllowWorkloadServices"
    effect    = "Allow"
    actions   = ["*"]
    resources = ["*"]
  }

  # IAM writes only: reads and iam:PassRole stay allowed, because the api/web
  # deployer roles must pass task roles when registering ECS task definitions.
  statement {
    sid    = "DenyIdentityAndAccountAdmin"
    effect = "Deny"
    actions = [
      "iam:Add*",
      "iam:Attach*",
      "iam:Change*",
      "iam:Create*",
      "iam:Deactivate*",
      "iam:Delete*",
      "iam:Detach*",
      "iam:Enable*",
      "iam:Put*",
      "iam:Remove*",
      "iam:Reset*",
      "iam:Set*",
      "iam:Tag*",
      "iam:Untag*",
      "iam:Update*",
      "iam:Upload*",
      "organizations:*",
      "account:*",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "DenyTouchingState"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.tfstate.arn, "${aws_s3_bucket.tfstate.arn}/*"]
  }
}

resource "aws_iam_policy" "workload_boundary" {
  name        = "${var.project}-workload-boundary"
  path        = "/${var.project}/"
  description = "Permissions boundary required on every role created by the infra pipeline."
  policy      = data.aws_iam_policy_document.workload_boundary.json
}

# ---------------------------------------------------------------------------
# infra-planner: read-only, assumed by `terraform plan` on pull requests.
# A PR can edit the workflow it runs, so PRs never get write access.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "planner_state" {
  statement {
    sid       = "ListState"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.tfstate.arn]
  }

  statement {
    sid       = "ReadState"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.tfstate.arn}/*"]
  }

  # `plan` takes the S3 native lock, which is a .tflock object next to the state.
  statement {
    sid       = "Lock"
    actions   = ["s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.tfstate.arn}/*.tflock"]
  }
}

module "infra_planner" {
  source = "../modules/github-oidc"

  name              = "${var.project}-infra-planner"
  oidc_provider_arn = aws_iam_openid_connect_provider.github.arn
  subjects          = ["repo:${var.github_repo}:pull_request:job_workflow_ref:${local.infra_wf}@refs/pull/*/merge"]

  managed_policy_arns = ["arn:aws:iam::aws:policy/ReadOnlyAccess"]
  inline_policies     = { state = data.aws_iam_policy_document.planner_state.json }
}

# ---------------------------------------------------------------------------
# infra-deployer: `terraform apply` from infra.yml on main, per GitHub environment.
# PowerUserAccess covers everything except IAM; IAM is granted only for roles
# and policies under /<project>/, and new roles must carry the boundary above.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "deployer_iam" {
  # checkov:skip=CKV_AWS_356:IAM Get/List on "*" is needed for plan/refresh; CreateServiceLinkedRole is limited by iam:AWSServiceName.
  statement {
    sid = "ReadIam"
    actions = [
      "iam:Get*",
      "iam:List*",
    ]
    resources = ["*"]
  }

  statement {
    sid       = "CreateBoundedRoles"
    actions   = ["iam:CreateRole", "iam:PutRolePermissionsBoundary"]
    resources = ["arn:aws:iam::${local.account_id}:role/${var.project}/*"]

    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [aws_iam_policy.workload_boundary.arn]
    }
  }

  statement {
    sid = "ManageProjectRoles"
    actions = [
      "iam:DeleteRole",
      "iam:UpdateRole",
      "iam:UpdateRoleDescription",
      "iam:UpdateAssumeRolePolicy",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:AttachRolePolicy",
      "iam:DetachRolePolicy",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
    ]
    resources = ["arn:aws:iam::${local.account_id}:role/${var.project}/*"]
  }

  statement {
    sid = "ManageProjectPolicies"
    actions = [
      "iam:CreatePolicy",
      "iam:CreatePolicyVersion",
      "iam:DeletePolicy",
      "iam:DeletePolicyVersion",
      "iam:TagPolicy",
      "iam:UntagPolicy",
    ]
    resources = ["arn:aws:iam::${local.account_id}:policy/${var.project}/*"]
  }

  statement {
    sid       = "PassProjectRoles"
    actions   = ["iam:PassRole"]
    resources = ["arn:aws:iam::${local.account_id}:role/${var.project}/*"]
  }

  statement {
    sid       = "ServiceLinkedRoles"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["*"]

    condition {
      test     = "StringLike"
      variable = "iam:AWSServiceName"
      values = [
        "ecs.amazonaws.com",
        "elasticloadbalancing.amazonaws.com",
        "ecs.application-autoscaling.amazonaws.com",
      ]
    }
  }

  # Explicit denies win over the allows above.
  statement {
    sid    = "ProtectBoundaryAndBootstrap"
    effect = "Deny"
    actions = [
      "iam:CreatePolicyVersion",
      "iam:DeletePolicy",
      "iam:DeletePolicyVersion",
      "iam:SetDefaultPolicyVersion",
    ]
    resources = [aws_iam_policy.workload_boundary.arn]
  }

  statement {
    sid       = "KeepBoundaryOnRoles"
    effect    = "Deny"
    actions   = ["iam:DeleteRolePermissionsBoundary"]
    resources = ["*"]
  }

  statement {
    sid       = "ProtectStateBucket"
    effect    = "Deny"
    actions   = ["s3:DeleteBucket", "s3:PutBucketPolicy", "s3:DeleteBucketPolicy", "s3:PutBucketVersioning", "s3:PutLifecycleConfiguration"]
    resources = [aws_s3_bucket.tfstate.arn]
  }
}

module "infra_deployer" {
  source = "../modules/github-oidc"

  name              = "${var.project}-infra-deployer"
  oidc_provider_arn = aws_iam_openid_connect_provider.github.arn
  subjects = [
    for env in ["staging", "production"] :
    "repo:${var.github_repo}:environment:${env}:job_workflow_ref:${local.infra_wf}@refs/heads/main"
  ]

  managed_policy_arns = ["arn:aws:iam::aws:policy/PowerUserAccess"]
  inline_policies     = { iam = data.aws_iam_policy_document.deployer_iam.json }
}
