mock_provider "aws" {
  mock_data "aws_region" {
    defaults = { region = "ap-south-1" }
  }

  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }

  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/job-platform/mock" }
  }

  mock_resource "aws_ecs_task_definition" {
    defaults = { arn = "arn:aws:ecs:ap-south-1:123456789012:task-definition/mock:1" }
  }
}

variables {
  name                     = "job-platform-staging-api"
  cluster_arn              = "arn:aws:ecs:ap-south-1:123456789012:cluster/job-platform-staging"
  vpc_id                   = "vpc-0123456789abcdef0"
  subnet_ids               = ["subnet-a", "subnet-b"]
  alb_security_group_id    = "sg-0123456789abcdef0"
  target_group_arn         = "arn:aws:elasticloadbalancing:ap-south-1:123456789012:targetgroup/t/0123456789abcdef"
  image                    = "123456789012.dkr.ecr.ap-south-1.amazonaws.com/job-platform-api:abc123"
  container_port           = 5000
  permissions_boundary_arn = "arn:aws:iam::123456789012:policy/job-platform/job-platform-workload-boundary"
  environment              = { NODE_ENV = "production", TRUST_PROXY_HOPS = "1" }
  secret_arn               = "arn:aws:secretsmanager:ap-south-1:123456789012:secret:/job-platform/staging/api-AbCdEf"
  secret_keys              = ["MONGODB_URI", "JWT_SECRET"]
  use_spot                 = true
}

run "with_secrets" {
  command = apply

  assert {
    condition     = aws_iam_role.execution.permissions_boundary == var.permissions_boundary_arn && aws_iam_role.task.permissions_boundary == var.permissions_boundary_arn
    error_message = "Both roles must carry the permissions boundary, or infra-deployer can't create them."
  }

  assert {
    condition     = aws_iam_role.execution.path == "/job-platform/"
    error_message = "Roles must live under /job-platform/."
  }

  assert {
    condition = (
      jsondecode(aws_ecs_task_definition.this.container_definitions)[0].secrets
      == [for k in var.secret_keys : { name = k, valueFrom = "${var.secret_arn}:${k}::" }]
    )
    error_message = "Each secret key must be injected from its JSON key in Secrets Manager."
  }

  assert {
    condition     = !contains([for e in jsondecode(aws_ecs_task_definition.this.container_definitions)[0].environment : e.name], "JWT_SECRET")
    error_message = "Secrets must never be plain environment variables."
  }

  assert {
    condition     = length(aws_iam_role_policy.read_secret) == 1
    error_message = "The execution role needs to read the secret."
  }

  assert {
    condition     = one(aws_ecs_service.this.deployment_circuit_breaker).rollback
    error_message = "Circuit breaker rollback must be on."
  }

  assert {
    condition     = one(aws_ecs_service.this.capacity_provider_strategy).capacity_provider == "FARGATE_SPOT"
    error_message = "use_spot must select FARGATE_SPOT."
  }

  assert {
    condition     = one(aws_ecs_service.this.network_configuration).assign_public_ip
    error_message = "No NAT: tasks need a public IP for outbound traffic."
  }
}

run "without_secrets" {
  command = apply

  variables {
    name        = "job-platform-staging-web"
    secret_arn  = null
    secret_keys = []
    use_spot    = false
  }

  assert {
    condition     = length(aws_iam_role_policy.read_secret) == 0
    error_message = "No secret, no secret policy."
  }

  assert {
    condition     = one(aws_ecs_service.this.capacity_provider_strategy).capacity_provider == "FARGATE"
    error_message = "use_spot = false must select FARGATE."
  }
}
