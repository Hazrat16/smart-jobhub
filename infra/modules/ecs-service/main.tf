data "aws_region" "current" {}

locals {
  # Decided from the map's keys, not the ARNs: ARNs are unknown until the
  # secrets exist, and count must be known at plan time.
  has_secret = length(var.secrets) > 0
}

# ---------------------------------------------------------------------------
# Logs
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_log_group" "this" {
  # checkov:skip=CKV_AWS_158:The default CloudWatch encryption is enough for app logs; a CMK adds cost.
  # checkov:skip=CKV_AWS_338:14 days is enough for staging; prod sets its own retention.
  name              = "/ecs/${var.name}"
  retention_in_days = var.log_retention_days
}

# ---------------------------------------------------------------------------
# IAM: execution role (ECS agent: pull image, write logs, read the secret)
# and task role (the app itself; no AWS permissions needed yet)
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

# The log router runs with the task role: it writes the app's logs to
# CloudWatch itself (instead of the awslogs driver) and reads its extra config.
data "aws_iam_policy_document" "log_router" {
  count = var.log_router == null ? 0 : 1

  statement {
    sid       = "WriteAppLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogStreams"]
    resources = ["${aws_cloudwatch_log_group.this.arn}:*"]
  }

  statement {
    sid       = "ReadLogRouterConfig"
    actions   = ["s3:GetObject"]
    resources = [var.log_router.config_object_arn]
  }

  statement {
    sid       = "LocateConfigBucket"
    actions   = ["s3:GetBucketLocation"]
    resources = [var.log_router.config_bucket_arn]
  }
}

resource "aws_iam_role_policy" "log_router" {
  count = var.log_router == null ? 0 : 1

  name   = "log-router"
  role   = aws_iam_role.task.id
  policy = data.aws_iam_policy_document.log_router[0].json
}

# ---------------------------------------------------------------------------
# Task definition
# ---------------------------------------------------------------------------

locals {
  awslogs = {
    logDriver = "awslogs"
    options = {
      awslogs-group         = aws_cloudwatch_log_group.this.name
      awslogs-region        = data.aws_region.current.region
      awslogs-stream-prefix = "app"
    }
  }
}

resource "aws_ecs_task_definition" "this" {
  # checkov:skip=CKV_AWS_336:Follow-up: read-only rootfs needs writable volumes for /tmp and .next/cache; verify their ownership on Fargate for the non-root user first.
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

  container_definitions = jsonencode(concat([
    {
      name      = "app"
      image     = var.image
      essential = true

      portMappings = [{ containerPort = var.container_port, protocol = "tcp" }]

      environment = [for k, v in var.environment : { name = k, value = v }]
      secrets     = [for name, s in var.secrets : { name = name, valueFrom = "${s.arn}:${s.key}::" }]

      readonlyRootFilesystem = false
      linuxParameters        = { initProcessEnabled = true }
      stopTimeout            = 30

      logConfiguration = var.log_router == null ? local.awslogs : {
        # Same log group as with awslogs, and the raw line (log_key), so
        # CloudWatch looks exactly as before; the extra config adds Loki.
        logDriver = "awsfirelens"
        options = {
          Name              = "cloudwatch_logs"
          region            = data.aws_region.current.region
          log_group_name    = aws_cloudwatch_log_group.this.name
          log_stream_prefix = "app/"
          auto_create_group = "false"
          log_key           = "log"
          retry_limit       = "2"
        }
      }
    }
    ], var.log_router == null ? [] : [
    {
      name      = "log-router"
      image     = var.log_router_image
      essential = true
      # ECS sets this on every FireLens container anyway; leaving it out makes
      # each plan replace the task definition.
      user = "0"
      # Shares the task's memory; Fluent Bit needs little.
      memoryReservation = 50

      firelensConfiguration = {
        type = "fluentbit"
        # Only the app's own line; the Loki output drops what's left.
        options = { enable-ecs-log-metadata = "false" }
      }

      environment = [
        { name = "aws_fluent_bit_init_s3_1", value = var.log_router.config_object_arn },
        # Not read by anything; changing it makes a new revision when the file changes.
        { name = "CONFIG_HASH", value = var.log_router.config_hash },
      ]

      # The router's own logs can't go through itself.
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.this.name
          awslogs-region        = data.aws_region.current.region
          awslogs-stream-prefix = "log-router"
        }
      }
    }
  ]))
}

# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

resource "aws_security_group" "task" {
  name        = "${var.name}-task"
  description = "${var.name} tasks: ingress from the ALB only"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.name}-task" }
}

resource "aws_vpc_security_group_ingress_rule" "from_alb" {
  security_group_id            = aws_security_group.task.id
  description                  = "From the ALB"
  referenced_security_group_id = var.alb_security_group_id
  ip_protocol                  = "tcp"
  from_port                    = var.container_port
  to_port                      = var.container_port
}

resource "aws_vpc_security_group_egress_rule" "all" {
  # checkov:skip=CKV_AWS_382:Tasks call Atlas, ECR, Secrets Manager and third-party APIs over the internet (no NAT, no VPC endpoints).
  security_group_id = aws_security_group.task.id
  description       = "Outbound to the internet"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

resource "aws_ecs_service" "this" {
  # checkov:skip=CKV_AWS_333:Public IP instead of a NAT gateway (PLAN.md cost decision); ingress is ALB-only.
  name            = var.name
  cluster         = var.cluster_arn
  task_definition = aws_ecs_task_definition.this.arn
  # Initial size only. Application Auto Scaling owns it afterwards (see below).
  desired_count                     = var.min_count
  health_check_grace_period_seconds = var.health_check_grace_period_seconds
  enable_execute_command            = false
  propagate_tags                    = "SERVICE"
  wait_for_steady_state             = false

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

  load_balancer {
    target_group_arn = var.target_group_arn
    container_name   = "app"
    container_port   = var.container_port
  }

  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    # CD owns the running revision: it registers a new revision (based on the
    # latest one, so Terraform env/secret changes are picked up) with a new image.
    # Application Auto Scaling owns desired_count.
    ignore_changes = [task_definition, desired_count]

    precondition {
      condition     = var.max_count >= var.min_count
      error_message = "max_count must be >= min_count."
    }
  }
}

# ---------------------------------------------------------------------------
# Scaling. Always registered, so changing min_count also resizes a fixed-size
# service (Application Auto Scaling moves the service to within min..max).
# ---------------------------------------------------------------------------

resource "aws_appautoscaling_target" "this" {
  service_namespace  = "ecs"
  scalable_dimension = "ecs:service:DesiredCount"
  resource_id        = "service/${element(split("/", var.cluster_arn), 1)}/${aws_ecs_service.this.name}"
  min_capacity       = var.min_count
  max_capacity       = var.max_count
}

resource "aws_appautoscaling_policy" "cpu" {
  count = var.max_count > var.min_count ? 1 : 0

  name               = "${var.name}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this.service_namespace
  scalable_dimension = aws_appautoscaling_target.this.scalable_dimension
  resource_id        = aws_appautoscaling_target.this.resource_id

  target_tracking_scaling_policy_configuration {
    target_value       = var.cpu_target_percent
    scale_out_cooldown = 60
    scale_in_cooldown  = 300

    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}
