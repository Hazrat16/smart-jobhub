mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }

  mock_data "aws_iam_policy_document" {
    defaults = { json = "{\"Version\":\"2012-10-17\",\"Statement\":[]}" }
  }

  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:ap-south-1:123456789012:job-platform-staging-alerts" }
  }
}

variables {
  name                   = "job-platform-staging"
  alert_emails           = ["alerts@example.com"]
  alb_arn_suffix         = "app/job-platform-staging/0123456789abcdef"
  cluster_name           = "job-platform-staging"
  redis_cache_cluster_id = "job-platform-staging-001"
  services = {
    api = { service_name = "job-platform-staging-api", target_group_arn_suffix = "targetgroup/api/1", expected_running = true }
    web = { service_name = "job-platform-staging-web", target_group_arn_suffix = "targetgroup/web/2", expected_running = false }
  }
}

run "alarms" {
  command = apply

  assert {
    condition     = keys(aws_cloudwatch_metric_alarm.no_healthy_targets) == ["api"]
    error_message = "'No healthy targets' must only be armed for services expected to run (web is at 0)."
  }

  assert {
    condition     = aws_cloudwatch_metric_alarm.no_healthy_targets["api"].treat_missing_data == "breaching"
    error_message = "Missing HealthyHostCount data must count as down."
  }

  assert {
    condition     = toset(keys(aws_cloudwatch_metric_alarm.ecs)) == toset(["api-cpu", "api-memory", "web-cpu", "web-memory"])
    error_message = "CPU and memory alarms for both services."
  }

  assert {
    condition = alltrue([
      for a in concat(
        [aws_cloudwatch_metric_alarm.alb_5xx, aws_cloudwatch_metric_alarm.api_latency, aws_cloudwatch_metric_alarm.redis_memory],
        values(aws_cloudwatch_metric_alarm.target_5xx), values(aws_cloudwatch_metric_alarm.ecs), values(aws_cloudwatch_metric_alarm.no_healthy_targets),
      ) : a.alarm_actions == toset([aws_sns_topic.alerts.arn]) && a.ok_actions == toset([aws_sns_topic.alerts.arn])
    ])
    error_message = "Every alarm must notify the topic on ALARM and OK."
  }

  assert {
    condition     = alltrue([for a in values(aws_cloudwatch_metric_alarm.target_5xx) : a.dimensions.LoadBalancer == var.alb_arn_suffix])
    error_message = "Target group metrics need the LoadBalancer dimension too."
  }

  assert {
    condition     = jsondecode(aws_cloudwatch_event_rule.deployment_failed.event_pattern).detail.eventName == ["SERVICE_DEPLOYMENT_FAILED"]
    error_message = "Failed ECS deployments must be forwarded."
  }

  assert {
    condition     = length(jsondecode(aws_cloudwatch_event_rule.deployment_failed.event_pattern).resources) == 2
    error_message = "The deployment rule must cover both services."
  }

  assert {
    condition     = keys(aws_sns_topic_subscription.email) == ["alerts@example.com"]
    error_message = "Each alert email gets a subscription."
  }
}
