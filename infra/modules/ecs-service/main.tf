data "aws_region" "current" {}

locals {
  # Decided from the static key list, not the ARN: the ARN is unknown until
  # the secret exists, and count must be known at plan time.
  has_secret = length(var.secret_keys) > 0
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
    resources = [var.secret_arn]
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

# ---------------------------------------------------------------------------
# Task definition
# ---------------------------------------------------------------------------

resource "aws_ecs_task_definition" "this" {
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

  container_definitions = jsonencode([
    {
      name      = "app"
      image     = var.image
      essential = true

      portMappings = [{ containerPort = var.container_port, protocol = "tcp" }]

      environment = [for k, v in var.environment : { name = k, value = v }]
      secrets     = [for k in var.secret_keys : { name = k, valueFrom = "${var.secret_arn}:${k}::" }]

      readonlyRootFilesystem = false
      linuxParameters        = { initProcessEnabled = true }
      stopTimeout            = 30

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.this.name
          awslogs-region        = data.aws_region.current.region
          awslogs-stream-prefix = "app"
        }
      }
    }
  ])

  lifecycle {
    precondition {
      condition     = length(var.secret_keys) == 0 || var.secret_arn != null
      error_message = "secret_keys needs secret_arn."
    }
  }
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
  name                              = var.name
  cluster                           = var.cluster_arn
  task_definition                   = aws_ecs_task_definition.this.arn
  desired_count                     = var.desired_count
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
    ignore_changes = [task_definition]
  }
}
