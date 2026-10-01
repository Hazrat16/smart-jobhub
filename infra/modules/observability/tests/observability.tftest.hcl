mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }

  mock_data "aws_region" {
    defaults = { region = "ap-south-1" }
  }

  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }

  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/job-platform/mock" }
  }

  mock_resource "aws_service_discovery_private_dns_namespace" {
    defaults = { id = "ns-mock" }
  }

  mock_resource "aws_service_discovery_service" {
    defaults = { arn = "arn:aws:servicediscovery:ap-south-1:123456789012:service/srv-mock" }
  }

  mock_resource "aws_s3_bucket" {
    defaults = {
      id  = "job-platform-staging-observability-123456789012"
      arn = "arn:aws:s3:::job-platform-staging-observability-123456789012"
    }
  }

  mock_resource "aws_efs_file_system" {
    defaults = { arn = "arn:aws:elasticfilesystem:ap-south-1:123456789012:file-system/fs-mock" }
  }

  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:ap-south-1:123456789012:secret:/job-platform/staging/grafana-AbCdEf" }
  }

  mock_resource "aws_security_group" {
    defaults = { id = "sg-mock" }
  }

  mock_resource "aws_ecs_task_definition" {
    defaults = { arn = "arn:aws:ecs:ap-south-1:123456789012:task-definition/mock:1" }
  }
}

mock_provider "random" {}

variables {
  name                     = "job-platform-staging"
  environment              = "staging"
  vpc_id                   = "vpc-mock"
  subnet_ids               = ["subnet-a", "subnet-b", "subnet-c"]
  cluster_arn              = "arn:aws:ecs:ap-south-1:123456789012:cluster/job-platform-staging"
  api_security_group_id    = "sg-api"
  grafana_secret_name      = "/job-platform/staging/grafana"
  permissions_boundary_arn = "arn:aws:iam::123456789012:policy/job-platform/job-platform-workload-boundary"
  alert_rules_file         = "../../../apps/api/observability/prometheus/alerts.yml"
  dashboards_dir           = "../../../apps/api/observability/grafana/dashboards"
}

run "stack" {
  command = apply

  assert {
    condition     = output.namespace == "job-platform-staging.internal"
    error_message = "Services are named under <name>.internal."
  }

  assert {
    condition = (
      aws_vpc_security_group_ingress_rule.api_from_prometheus.security_group_id == "sg-api"
      && aws_vpc_security_group_ingress_rule.api_from_prometheus.from_port == 5000
      && aws_vpc_security_group_ingress_rule.api_from_prometheus.to_port == 5000
    )
    error_message = "Prometheus may reach the api's metrics port, and only that port."
  }

  assert {
    condition     = toset(keys(aws_vpc_security_group_ingress_rule.loki)) == toset(["api", "grafana", "prometheus"])
    error_message = "Loki accepts the api's log router, Grafana and Prometheus, nothing else."
  }

  assert {
    condition     = aws_vpc_security_group_ingress_rule.loki["api"].referenced_security_group_id == "sg-api"
    error_message = "The api's log router reaches Loki through the api security group."
  }

  assert {
    condition     = alltrue([for r in values(aws_vpc_security_group_ingress_rule.loki) : r.cidr_ipv4 == null])
    error_message = "No CIDR-based ingress: security groups only."
  }

  assert {
    condition     = length(aws_efs_mount_target.prometheus) == 3
    error_message = "One EFS mount target per subnet, so Prometheus can start in any AZ."
  }

  assert {
    condition     = aws_efs_access_point.prometheus.posix_user[0].uid == 65534
    error_message = "Prometheus runs as nobody (65534); the access point must write as that user."
  }

  assert {
    condition     = aws_efs_file_system.prometheus.encrypted
    error_message = "EFS must be encrypted at rest."
  }

  assert {
    condition = (
      aws_s3_bucket_public_access_block.this.block_public_acls
      && aws_s3_bucket_public_access_block.this.block_public_policy
      && aws_s3_bucket_public_access_block.this.restrict_public_buckets
    )
    error_message = "The bucket must block all public access."
  }

  assert {
    condition     = contains(keys(aws_s3_object.config), "grafana/dashboards/api-overview.json")
    error_message = "The repo's dashboards must be uploaded for Grafana."
  }

  assert {
    condition     = strcontains(aws_s3_object.config["prometheus/prometheus.yml"].content, "api.job-platform-staging.internal")
    error_message = "Prometheus must discover the api tasks through Cloud Map."
  }

  assert {
    condition     = strcontains(aws_s3_object.config["fluent-bit/api.conf"].content, "Host             loki.job-platform-staging.internal")
    error_message = "The api's log router must send to Loki's Cloud Map name."
  }

  assert {
    condition     = strcontains(aws_s3_object.config["loki/loki.yml"].content, "bucketnames: job-platform-staging-observability-123456789012")
    error_message = "Loki must store in this stack's bucket."
  }

  assert {
    condition     = strcontains(aws_s3_object.config["loki/loki.yml"].content, "retention_period: 168h")
    error_message = "Loki keeps logs_retention_days (7 days by default)."
  }

  assert {
    condition     = output.api_log_router.config_object_arn == "arn:aws:s3:::job-platform-staging-observability-123456789012/config/fluent-bit/api.conf"
    error_message = "The log router's S3 ARN must point at the uploaded Fluent Bit config."
  }

  assert {
    condition     = aws_secretsmanager_secret.grafana.name == "/job-platform/staging/grafana"
    error_message = "Grafana's password secret follows /job-platform/<env>/<name>."
  }
}
