# Plans the staging stack against a mocked AWS provider, so it needs no
# credentials. Run with `terraform test` from infra/envs/staging.

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
    defaults = { cidr_block = "10.20.0.0/16" }
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
    defaults = { arn = "arn:aws:secretsmanager:ap-south-1:123456789012:secret:/job-platform/staging/api-AbCdEf" }
  }

  mock_resource "aws_ecs_cluster" {
    defaults = { arn = "arn:aws:ecs:ap-south-1:123456789012:cluster/job-platform-staging" }
  }

  mock_resource "aws_lb" {
    defaults = {
      arn        = "arn:aws:elasticloadbalancing:ap-south-1:123456789012:loadbalancer/app/job-platform-staging/0123456789abcdef"
      arn_suffix = "app/job-platform-staging/0123456789abcdef"
      dns_name   = "job-platform-staging-123.ap-south-1.elb.amazonaws.com"
      zone_id    = "ZP97RAFLXTNZK"
    }
  }

  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:ap-south-1:123456789012:targetgroup/mock/0123456789abcdef" }
  }

  mock_resource "aws_lb_listener" {
    defaults = { arn = "arn:aws:elasticloadbalancing:ap-south-1:123456789012:listener/app/job-platform-staging/0123456789abcdef/0123456789abcdef" }
  }

  mock_resource "aws_ecs_task_definition" {
    defaults = { arn = "arn:aws:ecs:ap-south-1:123456789012:task-definition/mock:1" }
  }

  mock_resource "aws_acm_certificate" {
    defaults = {
      arn = "arn:aws:acm:ap-south-1:123456789012:certificate/mock"
      domain_validation_options = [{
        domain_name           = "staging.example.com"
        resource_record_name  = "_x.staging.example.com."
        resource_record_type  = "CNAME"
        resource_record_value = "_y.acm-validations.aws."
      }]
    }
  }
}

variables {
  zone_name   = "example.com"
  domain_name = "staging.example.com"
}

# Wiring details are asserted in modules/*/tests; this checks the whole stack
# plans and applies (against mocks) and the env-specific values.
run "staging_plan" {
  command = apply

  assert {
    condition     = output.url == "https://staging.example.com"
    error_message = "URL output is wrong."
  }

  assert {
    condition     = output.api_secret_name == "/job-platform/staging/api"
    error_message = "Secret must be /job-platform/<env>/api (PLAN.md)."
  }

  assert {
    condition     = contains(keys(module.api), "security_group_id") && output.redis_endpoint != ""
    error_message = "Redis must be created and wired to the api."
  }

  assert {
    condition     = output.services.api.task_definition_family == "job-platform-staging-api"
    error_message = "api task definition family is wrong."
  }
}
