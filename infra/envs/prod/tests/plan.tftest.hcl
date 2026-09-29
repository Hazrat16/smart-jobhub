# Plans the prod stack against a mocked AWS provider, so it needs no
# credentials. Run with `terraform test` from infra/envs/prod.

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }

  mock_data "aws_availability_zones" {
    defaults = { names = ["ap-south-1a", "ap-south-1b", "ap-south-1c"] }
  }

  mock_data "aws_route53_zone" {
    defaults = { zone_id = "Z0000000000TEST" }
  }

  mock_data "aws_vpc" {
    defaults = { cidr_block = "10.30.0.0/16" }
  }

  mock_data "aws_region" {
    defaults = { region = "ap-south-1" }
  }

  mock_data "aws_ecr_repository" {
    defaults = { repository_url = "123456789012.dkr.ecr.ap-south-1.amazonaws.com/job-platform-app" }
  }

  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }

  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/job-platform/mock" }
  }

  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:ap-south-1:123456789012:secret:/job-platform/prod/api-AbCdEf" }
  }

  mock_resource "aws_ecs_cluster" {
    defaults = { arn = "arn:aws:ecs:ap-south-1:123456789012:cluster/job-platform-prod" }
  }

  mock_resource "aws_lb" {
    defaults = {
      arn        = "arn:aws:elasticloadbalancing:ap-south-1:123456789012:loadbalancer/app/job-platform-prod/0123456789abcdef"
      arn_suffix = "app/job-platform-prod/0123456789abcdef"
      dns_name   = "job-platform-prod-123.ap-south-1.elb.amazonaws.com"
      zone_id    = "ZP97RAFLXTNZK"
    }
  }

  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:ap-south-1:123456789012:targetgroup/mock/0123456789abcdef" }
  }

  mock_resource "aws_lb_listener" {
    defaults = { arn = "arn:aws:elasticloadbalancing:ap-south-1:123456789012:listener/app/job-platform-prod/0123456789abcdef/0123456789abcdef" }
  }

  mock_resource "aws_ecs_task_definition" {
    defaults = { arn = "arn:aws:ecs:ap-south-1:123456789012:task-definition/mock:1" }
  }

  mock_resource "aws_elasticache_replication_group" {
    defaults = {
      member_clusters          = ["job-platform-prod-001"]
      primary_endpoint_address = "master.job-platform-prod.abc123.aps1.cache.amazonaws.com"
    }
  }

  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:ap-south-1:123456789012:job-platform-prod-alerts" }
  }

  mock_resource "aws_acm_certificate" {
    defaults = {
      arn = "arn:aws:acm:ap-south-1:123456789012:certificate/mock"
      domain_validation_options = [{
        domain_name           = "prod.example.com"
        resource_record_name  = "_x.prod.example.com."
        resource_record_type  = "CNAME"
        resource_record_value = "_y.acm-validations.aws."
      }]
    }
  }
}

variables {
  alert_emails = ["alerts@example.com"]
  zone_name    = "example.com"
  domain_name  = "prod.example.com"
}

# Wiring details are asserted in modules/*/tests; this checks the whole stack
# plans and applies (against mocks) and the env-specific values.
run "prod_plan" {
  command = apply

  assert {
    condition     = output.url == "https://prod.example.com"
    error_message = "URL output is wrong."
  }

  assert {
    condition     = output.api_secret_name == "/job-platform/prod/api"
    error_message = "Secret must be /job-platform/<env>/api (PLAN.md)."
  }

  assert {
    condition     = output.redis_endpoint != ""
    error_message = "Redis must be created."
  }

  assert {
    condition     = output.services.api.task_definition_family == "job-platform-prod-api"
    error_message = "api task definition family is wrong."
  }

  assert {
    condition     = !output.settings.use_spot
    error_message = "Prod must run on-demand Fargate, not Spot."
  }

  assert {
    condition     = output.settings.api_scaling == { min = 1, max = 3 } && output.settings.web_scaling == { min = 1, max = 2 }
    error_message = "Prod autoscaling ranges changed."
  }

  assert {
    condition     = output.settings.deletion_protection && output.settings.log_retention_days >= 30
    error_message = "Prod needs ALB deletion protection and at least 30 days of logs."
  }

  assert {
    condition     = !output.settings.sslcommerz_sandbox
    error_message = "Prod must use live SSLCommerz."
  }
}
