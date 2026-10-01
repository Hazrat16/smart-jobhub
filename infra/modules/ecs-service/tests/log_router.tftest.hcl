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

  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:ap-south-1:123456789012:log-group:/ecs/job-platform-staging-api" }
  }
}

variables {
  name                     = "job-platform-staging-api"
  cluster_arn              = "arn:aws:ecs:ap-south-1:123456789012:cluster/job-platform-staging"
  vpc_id                   = "vpc-mock"
  subnet_ids               = ["subnet-a", "subnet-b"]
  alb_security_group_id    = "sg-alb"
  target_group_arn         = "arn:aws:elasticloadbalancing:ap-south-1:123456789012:targetgroup/api/0123456789abcdef"
  image                    = "123456789012.dkr.ecr.ap-south-1.amazonaws.com/job-platform-api:initial"
  container_port           = 5000
  permissions_boundary_arn = "arn:aws:iam::123456789012:policy/job-platform/job-platform-workload-boundary"
}

run "without_log_router" {
  command = apply

  assert {
    condition = (
      length(jsondecode(aws_ecs_task_definition.this.container_definitions)) == 1
      && jsondecode(aws_ecs_task_definition.this.container_definitions)[0].logConfiguration.logDriver == "awslogs"
    )
    error_message = "Without a log router the task is unchanged: one container, awslogs."
  }

  assert {
    condition     = length(aws_ecs_service.this.service_registries) == 0 && length(aws_iam_role_policy.log_router) == 0
    error_message = "No Cloud Map registration or log router permissions unless asked for."
  }
}

run "with_log_router" {
  command = apply

  variables {
    service_registry_arn = "arn:aws:servicediscovery:ap-south-1:123456789012:service/srv-api"
    log_router = {
      config_bucket_arn = "arn:aws:s3:::obs-bucket"
      config_object_arn = "arn:aws:s3:::obs-bucket/config/fluent-bit/api.conf"
      config_hash       = "abc123"
    }
  }

  assert {
    # CD replaces the image of the container named "app" (.github/actions/ecs-deploy).
    condition     = jsondecode(aws_ecs_task_definition.this.container_definitions)[0].name == "app"
    error_message = "The app container keeps its name, so CD still finds it."
  }

  assert {
    condition = (
      jsondecode(aws_ecs_task_definition.this.container_definitions)[0].logConfiguration.logDriver == "awsfirelens"
      && jsondecode(aws_ecs_task_definition.this.container_definitions)[0].logConfiguration.options.Name == "cloudwatch_logs"
      && jsondecode(aws_ecs_task_definition.this.container_definitions)[0].logConfiguration.options.log_group_name == "/ecs/job-platform-staging-api"
      && jsondecode(aws_ecs_task_definition.this.container_definitions)[0].logConfiguration.options.log_key == "log"
    )
    error_message = "App logs still land in the same CloudWatch group, as the raw line."
  }

  assert {
    condition = (
      jsondecode(aws_ecs_task_definition.this.container_definitions)[1].name == "log-router"
      && jsondecode(aws_ecs_task_definition.this.container_definitions)[1].firelensConfiguration.type == "fluentbit"
      && jsondecode(aws_ecs_task_definition.this.container_definitions)[1].logConfiguration.logDriver == "awslogs"
    )
    error_message = "A Fluent Bit FireLens sidecar, logging its own output with awslogs."
  }

  assert {
    condition = anytrue([
      for e in jsondecode(aws_ecs_task_definition.this.container_definitions)[1].environment :
      e.name == "aws_fluent_bit_init_s3_1" && e.value == "arn:aws:s3:::obs-bucket/config/fluent-bit/api.conf"
    ])
    error_message = "The init image must load the extra (Loki) config from S3."
  }

  assert {
    condition     = length(aws_iam_role_policy.log_router) == 1 && aws_iam_role_policy.log_router[0].role == aws_iam_role.task.id
    error_message = "The task role (which Fluent Bit runs as) gets the log and config permissions."
  }

  assert {
    condition     = aws_ecs_service.this.service_registries[0].registry_arn == "arn:aws:servicediscovery:ap-south-1:123456789012:service/srv-api"
    error_message = "The api registers in Cloud Map so Prometheus finds every task."
  }
}
