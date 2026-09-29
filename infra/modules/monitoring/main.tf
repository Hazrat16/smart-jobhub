data "aws_caller_identity" "current" {}

# ---------------------------------------------------------------------------
# Where alerts go
# ---------------------------------------------------------------------------

resource "aws_sns_topic" "alerts" {
  # checkov:skip=CKV_AWS_26:CloudWatch and EventBridge can't publish to a topic encrypted with the AWS managed SNS key; a CMK costs more than the rest of monitoring. Alerts carry no secrets.
  name = "${var.name}-alerts"
}

data "aws_iam_policy_document" "alerts" {
  statement {
    sid     = "AlarmsAndEvents"
    actions = ["sns:Publish"]

    principals {
      type        = "Service"
      identifiers = ["cloudwatch.amazonaws.com", "events.amazonaws.com"]
    }

    resources = [aws_sns_topic.alerts.arn]

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sns_topic_policy" "alerts" {
  arn    = aws_sns_topic.alerts.arn
  policy = data.aws_iam_policy_document.alerts.json
}

resource "aws_sns_topic_subscription" "email" {
  for_each = toset(var.alert_emails)

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

locals {
  actions = [aws_sns_topic.alerts.arn]
}

# ---------------------------------------------------------------------------
# Load balancer: errors users see, latency, and "nothing is serving"
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${var.name}-alb-5xx"
  alarm_description   = "The load balancer itself returned 5xx (usually: no healthy target). Runbook: docs/runbook.md#alb-5xx"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_ELB_5XX_Count"
  dimensions          = { LoadBalancer = var.alb_arn_suffix }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.error_count_threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

resource "aws_cloudwatch_metric_alarm" "target_5xx" {
  for_each = var.services

  alarm_name          = "${var.name}-${each.key}-5xx"
  alarm_description   = "${each.key} returned 5xx responses. Runbook: docs/runbook.md#app-5xx"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  dimensions          = { LoadBalancer = var.alb_arn_suffix, TargetGroup = each.value.target_group_arn_suffix }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.error_count_threshold
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

resource "aws_cloudwatch_metric_alarm" "api_latency" {
  alarm_name          = "${var.name}-api-latency-p95"
  alarm_description   = "api p95 response time above ${var.api_p95_latency_seconds}s for 10 minutes. Runbook: docs/runbook.md#latency"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  dimensions          = { LoadBalancer = var.alb_arn_suffix, TargetGroup = var.services["api"].target_group_arn_suffix }
  extended_statistic  = "p95"
  period              = 300
  evaluation_periods  = 2
  threshold           = var.api_p95_latency_seconds
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

resource "aws_cloudwatch_metric_alarm" "no_healthy_targets" {
  for_each = { for app, s in var.services : app => s if s.expected_running }

  alarm_name          = "${var.name}-${each.key}-no-healthy-targets"
  alarm_description   = "${each.key} has no healthy task behind the load balancer: the app is down. Runbook: docs/runbook.md#no-healthy-targets"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HealthyHostCount"
  dimensions          = { LoadBalancer = var.alb_arn_suffix, TargetGroup = each.value.target_group_arn_suffix }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

# ---------------------------------------------------------------------------
# ECS: sustained CPU / memory pressure (autoscaling should handle spikes)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "ecs" {
  for_each = {
    for pair in setproduct(keys(var.services), ["CPUUtilization", "MemoryUtilization"]) :
    "${pair[0]}-${pair[1] == "CPUUtilization" ? "cpu" : "memory"}" => { app = pair[0], metric = pair[1] }
  }

  alarm_name          = "${var.name}-${each.key}-high"
  alarm_description   = "${each.value.app} ${each.value.metric} above 85% for 15 minutes. Runbook: docs/runbook.md#cpu-or-memory-high"
  namespace           = "AWS/ECS"
  metric_name         = each.value.metric
  dimensions          = { ClusterName = var.cluster_name, ServiceName = var.services[each.value.app].service_name }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 85
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

# ---------------------------------------------------------------------------
# Valkey: noeviction means a full node rejects writes (queues, rate limits)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  alarm_name          = "${var.name}-redis-memory"
  alarm_description   = "Valkey memory above 80%. At 100% (noeviction) writes fail. Runbook: docs/runbook.md#redis-memory"
  namespace           = "AWS/ElastiCache"
  metric_name         = "DatabaseMemoryUsagePercentage"
  dimensions          = { CacheClusterId = var.redis_cache_cluster_id }
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.actions
  ok_actions          = local.actions
}

# ---------------------------------------------------------------------------
# Failed deployments (circuit breaker rolled back) straight from ECS events
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "deployment_failed" {
  name        = "${var.name}-ecs-deployment-failed"
  description = "ECS rolled back a deployment in ${var.cluster_name}."

  event_pattern = jsonencode({
    source        = ["aws.ecs"]
    "detail-type" = ["ECS Deployment State Change"]
    resources     = [for s in values(var.services) : "arn:aws:ecs:*:${data.aws_caller_identity.current.account_id}:service/${var.cluster_name}/${s.service_name}"]
    detail        = { eventName = ["SERVICE_DEPLOYMENT_FAILED"] }
  })
}

resource "aws_cloudwatch_event_target" "deployment_failed" {
  rule = aws_cloudwatch_event_rule.deployment_failed.name
  arn  = aws_sns_topic.alerts.arn
}
