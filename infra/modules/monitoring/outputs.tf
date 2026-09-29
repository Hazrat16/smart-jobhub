output "topic_arn" {
  description = "SNS topic for alerts."
  value       = aws_sns_topic.alerts.arn
}

output "alarm_names" {
  description = "All alarm names."
  value = concat(
    [aws_cloudwatch_metric_alarm.alb_5xx.alarm_name, aws_cloudwatch_metric_alarm.api_latency.alarm_name, aws_cloudwatch_metric_alarm.redis_memory.alarm_name],
    [for a in aws_cloudwatch_metric_alarm.target_5xx : a.alarm_name],
    [for a in aws_cloudwatch_metric_alarm.no_healthy_targets : a.alarm_name],
    [for a in aws_cloudwatch_metric_alarm.ecs : a.alarm_name],
  )
}
