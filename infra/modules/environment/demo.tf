# Nightly reset of the shared demo logins: a one-off Fargate task from the
# api's latest task definition, running the seed script instead of the server.

locals {
  demo_enabled = var.demo_reset_schedule != null
}

data "aws_iam_policy_document" "scheduler_trust" {
  count = local.demo_enabled ? 1 : 0

  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["scheduler.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_iam_role" "demo_reset" {
  count = local.demo_enabled ? 1 : 0

  name                 = "${local.name}-demo-reset"
  path                 = "/${var.project}/"
  assume_role_policy   = data.aws_iam_policy_document.scheduler_trust[0].json
  permissions_boundary = local.workload_boundary_arn
}

data "aws_iam_policy_document" "demo_reset" {
  count = local.demo_enabled ? 1 : 0

  statement {
    actions   = ["ecs:RunTask"]
    resources = ["${module.api.task_definition_arn_without_revision}:*"]

    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [aws_ecs_cluster.this.arn]
    }
  }

  statement {
    actions   = ["iam:PassRole"]
    resources = [module.api.execution_role_arn, module.api.task_role_arn]

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role_policy" "demo_reset" {
  count = local.demo_enabled ? 1 : 0

  name   = "run-demo-reset"
  role   = aws_iam_role.demo_reset[0].id
  policy = data.aws_iam_policy_document.demo_reset[0].json
}

resource "aws_scheduler_schedule" "demo_reset" {
  # checkov:skip=CKV_AWS_297:The schedule holds no secrets (the password comes from Secrets Manager at task start); a CMK adds cost.
  count = local.demo_enabled ? 1 : 0

  name                         = "${local.name}-demo-reset"
  description                  = "Reset the public demo accounts (seedDemo.ts)."
  schedule_expression          = var.demo_reset_schedule
  schedule_expression_timezone = "Asia/Dhaka"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = aws_ecs_cluster.this.arn
    role_arn = aws_iam_role.demo_reset[0].arn

    ecs_parameters {
      task_definition_arn = module.api.task_definition_arn_without_revision
      launch_type         = "FARGATE"
      task_count          = 1

      network_configuration {
        subnets          = module.network.public_subnet_ids
        security_groups  = [module.api.security_group_id]
        assign_public_ip = true
      }
    }

    input = jsonencode({
      containerOverrides = [{
        name        = "app"
        command     = ["node", "dist/scripts/seedDemo.js"]
        environment = [{ name = "SEED_DEMO_CONFIRM", value = "yes" }]
      }]
    })

    retry_policy {
      maximum_retry_attempts = 2
    }
  }
}
