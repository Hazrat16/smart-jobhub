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
}

variables {
  name                     = "job-platform-staging-prometheus"
  cluster_arn              = "arn:aws:ecs:ap-south-1:123456789012:cluster/job-platform-staging"
  vpc_id                   = "vpc-mock"
  subnet_ids               = ["subnet-a", "subnet-b"]
  image                    = "prom/prometheus:v3.5.0"
  container_port           = 9090
  permissions_boundary_arn = "arn:aws:iam::123456789012:policy/job-platform/job-platform-workload-boundary"
  config = {
    bucket     = "obs-bucket"
    bucket_arn = "arn:aws:s3:::obs-bucket"
    prefix     = "config/prometheus"
    mount_path = "/etc/prometheus/config"
    hash       = "abc123"
  }
}

run "config_init_container" {
  command = apply

  assert {
    condition = (
      jsondecode(aws_ecs_task_definition.this.container_definitions)[0].name == "config"
      && jsondecode(aws_ecs_task_definition.this.container_definitions)[0].essential == false
      && contains(jsondecode(aws_ecs_task_definition.this.container_definitions)[0].command, "s3://obs-bucket/config/prometheus/")
    )
    error_message = "A non-essential init container must sync the service's S3 prefix."
  }

  assert {
    condition = (
      jsondecode(aws_ecs_task_definition.this.container_definitions)[1].dependsOn[0].containerName == "config"
      && jsondecode(aws_ecs_task_definition.this.container_definitions)[1].dependsOn[0].condition == "SUCCESS"
    )
    error_message = "The app must wait until the config has been copied successfully."
  }

  assert {
    condition = anytrue([
      for m in jsondecode(aws_ecs_task_definition.this.container_definitions)[1].mountPoints :
      m.containerPath == "/etc/prometheus/config" && m.readOnly
    ])
    error_message = "The app mounts the config read-only."
  }

  assert {
    condition     = length(aws_ecs_service.this.service_registries) == 0 && aws_ecs_service.this.enable_execute_command == false
    error_message = "No Cloud Map name and no ECS Exec unless asked for."
  }

  assert {
    condition     = aws_ecs_service.this.deployment_minimum_healthy_percent == 100
    error_message = "Default deploys keep the old task running until the new one is up."
  }

  assert {
    condition     = length(aws_iam_role_policy.task_extra) == 0 && aws_vpc_security_group_egress_rule.all.cidr_ipv4 == "0.0.0.0/0"
    error_message = "No extra task policies by default; only egress here, ingress is added by the caller."
  }
}

run "persistent_single_instance" {
  command = apply

  variables {
    efs = {
      file_system_id  = "fs-mock"
      file_system_arn = "arn:aws:elasticfilesystem:ap-south-1:123456789012:file-system/fs-mock"
      access_point_id = "fsap-mock"
      container_path  = "/prometheus"
    }
    service_registry_arn   = "arn:aws:servicediscovery:ap-south-1:123456789012:service/srv-mock"
    single_instance        = true
    enable_execute_command = true
  }

  assert {
    condition = (
      aws_ecs_service.this.deployment_minimum_healthy_percent == 0
      && aws_ecs_service.this.deployment_maximum_percent == 100
    )
    error_message = "single_instance must stop the old task before starting a new one (one writer on EFS)."
  }

  assert {
    condition = anytrue([
      for v in aws_ecs_task_definition.this.volume :
      v.name == "data" && v.efs_volume_configuration[0].transit_encryption == "ENABLED"
      && v.efs_volume_configuration[0].authorization_config[0].iam == "ENABLED"
    ])
    error_message = "EFS must use TLS and IAM authorization through the access point."
  }

  assert {
    condition     = aws_ecs_service.this.service_registries[0].registry_arn == "arn:aws:servicediscovery:ap-south-1:123456789012:service/srv-mock"
    error_message = "Tasks must register in Cloud Map when a registry is given."
  }

  assert {
    condition     = aws_ecs_service.this.enable_execute_command
    error_message = "ECS Exec is enabled when asked for (Grafana's port forward)."
  }
}
