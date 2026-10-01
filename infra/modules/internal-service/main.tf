# An ECS service reachable only inside the VPC: no load balancer, optional
# Cloud Map name, optional EFS volume. Used by the observability stack
# (Prometheus, Loki, Grafana). Config files come from S3 via an init container,
# so stock images can be used and nothing has to be baked into a custom image.

data "aws_region" "current" {}

locals {
  has_secret = length(var.secrets) > 0
}

resource "aws_cloudwatch_log_group" "this" {
  # checkov:skip=CKV_AWS_158:The default CloudWatch encryption is enough for app logs; a CMK adds cost.
  # checkov:skip=CKV_AWS_338:14 days is enough for staging; prod sets its own retention.
  name              = "/ecs/${var.name}"
  retention_in_days = var.log_retention_days
}

# ---------------------------------------------------------------------------
# IAM
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "ecs_tasks_trust" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name                 = "${var.name}-execution"
  path                 = var.iam_path
  assume_role_policy   = data.aws_iam_policy_document.ecs_tasks_trust.json
  permissions_boundary = var.permissions_boundary_arn
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

data "aws_iam_policy_document" "read_secret" {
  count = local.has_secret ? 1 : 0

  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = distinct([for s in values(var.secrets) : s.arn])
  }
}

resource "aws_iam_role_policy" "read_secret" {
  count = local.has_secret ? 1 : 0

  name   = "read-secret"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.read_secret[0].json
}

resource "aws_iam_role" "task" {
  name                 = "${var.name}-task"
  path                 = var.iam_path
  assume_role_policy   = data.aws_iam_policy_document.ecs_tasks_trust.json
  permissions_boundary = var.permissions_boundary_arn
}

data "aws_iam_policy_document" "task" {
  # checkov:skip=CKV_AWS_111:The ssmmessages actions for ECS Exec have no resource-level permissions.
  # checkov:skip=CKV_AWS_356:The ssmmessages actions for ECS Exec have no resource-level permissions.
  statement {
    sid       = "ReadConfig"
    actions   = ["s3:GetObject"]
    resources = ["${var.config.bucket_arn}/${var.config.prefix}/*"]
  }

  statement {
    sid       = "ListConfig"
    actions   = ["s3:ListBucket"]
    resources = [var.config.bucket_arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["${var.config.prefix}/*"]
    }
  }

  dynamic "statement" {
    for_each = var.efs == null ? [] : [1]
    content {
      sid       = "MountEfs"
      actions   = ["elasticfilesystem:ClientMount", "elasticfilesystem:ClientWrite"]
      resources = [var.efs.file_system_arn]
    }
  }

  dynamic "statement" {
    for_each = var.enable_execute_command ? [1] : []
    content {
      sid = "EcsExec"
      actions = [
        "ssmmessages:CreateControlChannel",
        "ssmmessages:CreateDataChannel",
        "ssmmessages:OpenControlChannel",
        "ssmmessages:OpenDataChannel",
      ]
      resources = ["*"]
    }
  }
}

resource "aws_iam_role_policy" "task" {
  name   = "task"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.task.json
}

resource "aws_iam_role_policy" "task_extra" {
  for_each = var.task_policies

  name   = each.key
  role   = aws_iam_role.task.id
  policy = each.value
}

# ---------------------------------------------------------------------------
# Task definition
# ---------------------------------------------------------------------------

locals {
  log_configuration = {
    logDriver = "awslogs"
    options = {
      awslogs-group         = aws_cloudwatch_log_group.this.name
      awslogs-region        = data.aws_region.current.region
      awslogs-stream-prefix = "app"
    }
  }
}

resource "aws_ecs_task_definition" "this" {
  # checkov:skip=CKV_AWS_336:The init container writes the config volume, and the apps write scratch data in their image paths.
  family                   = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.cpu
  memory                   = var.memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  # Task-local scratch volume shared by the two containers.
  volume {
    name = "config"
  }

  dynamic "volume" {
    for_each = var.efs == null ? [] : [var.efs]
    content {
      name = "data"

      efs_volume_configuration {
        file_system_id     = volume.value.file_system_id
        transit_encryption = "ENABLED"

        authorization_config {
          access_point_id = volume.value.access_point_id
          iam             = "ENABLED"
        }
      }
    }
  }

  container_definitions = jsonencode([
    {
      name      = "config"
      image     = var.config_sync_image
      essential = false
      command   = ["s3", "sync", "s3://${var.config.bucket}/${var.config.prefix}/", "/config/", "--delete", "--only-show-errors"]
      environment = [
        { name = "AWS_REGION", value = data.aws_region.current.region },
        # Not read by anything; changing it makes a new revision when a file changes.
        { name = "CONFIG_HASH", value = var.config.hash },
      ]
      mountPoints      = [{ sourceVolume = "config", containerPath = "/config", readOnly = false }]
      logConfiguration = local.log_configuration
    },
    {
      name      = "app"
      image     = var.image
      essential = true
      command   = length(var.command) > 0 ? var.command : null

      dependsOn = [{ containerName = "config", condition = "SUCCESS" }]

      portMappings = [{ containerPort = var.container_port, protocol = "tcp" }]
      environment  = [for k, v in var.environment : { name = k, value = v }]
      secrets      = [for name, s in var.secrets : { name = name, valueFrom = "${s.arn}:${s.key}::" }]

      mountPoints = concat(
        [{ sourceVolume = "config", containerPath = var.config.mount_path, readOnly = true }],
        var.efs == null ? [] : [{ sourceVolume = "data", containerPath = var.efs.container_path, readOnly = false }],
      )

      readonlyRootFilesystem = false
      linuxParameters        = { initProcessEnabled = true }
      stopTimeout            = 30
      logConfiguration       = local.log_configuration
    }
  ])
}

# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

resource "aws_security_group" "task" {
  name        = "${var.name}-task"
  description = "${var.name} tasks: ingress added per caller"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.name}-task" }
}

resource "aws_vpc_security_group_egress_rule" "all" {
  # checkov:skip=CKV_AWS_382:Tasks pull images and call S3, EFS and SSM over the internet (no NAT, no VPC endpoints).
  security_group_id = aws_security_group.task.id
  description       = "Outbound to the internet"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_ecs_service" "this" {
  # checkov:skip=CKV_AWS_333:Public IP instead of a NAT gateway (PLAN.md cost decision); no ingress from the internet.
  name                   = var.name
  cluster                = var.cluster_arn
  task_definition        = aws_ecs_task_definition.this.arn
  desired_count          = 1
  enable_execute_command = var.enable_execute_command
  propagate_tags         = "SERVICE"
  wait_for_steady_state  = false

  capacity_provider_strategy {
    capacity_provider = var.use_spot ? "FARGATE_SPOT" : "FARGATE"
    weight            = 1
  }

  network_configuration {
    subnets          = var.subnet_ids
    security_groups  = [aws_security_group.task.id]
    assign_public_ip = true
  }

  dynamic "service_registries" {
    for_each = var.service_registry_arn == null ? [] : [var.service_registry_arn]
    content {
      registry_arn = service_registries.value
    }
  }

  # Stop the old task before starting the new one when the app locks its data.
  deployment_minimum_healthy_percent = var.single_instance ? 0 : 100
  deployment_maximum_percent         = var.single_instance ? 100 : 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
}
