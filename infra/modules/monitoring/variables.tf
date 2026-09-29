variable "name" {
  description = "Name prefix, e.g. job-platform-prod."
  type        = string
}

variable "alert_emails" {
  description = "Email addresses subscribed to alerts. Each must confirm the subscription email from AWS."
  type        = list(string)
}

variable "alb_arn_suffix" {
  description = "ALB ARN suffix (CloudWatch LoadBalancer dimension)."
  type        = string
}

variable "cluster_name" {
  description = "ECS cluster name."
  type        = string
}

variable "services" {
  description = <<-EOT
    Per app: ECS service name, target group ARN suffix, and whether it's expected to be running
    (min_count >= 1). "No healthy targets" is only armed for services expected to run.
  EOT
  type = map(object({
    service_name            = string
    target_group_arn_suffix = string
    expected_running        = bool
  }))
}

variable "redis_cache_cluster_id" {
  description = "Valkey node ID (CloudWatch CacheClusterId dimension)."
  type        = string
}

variable "api_p95_latency_seconds" {
  description = "Alarm when the api's p95 response time stays above this."
  type        = number
  default     = 2
}

variable "error_count_threshold" {
  description = "Alarm when 5xx responses in 5 minutes reach this."
  type        = number
  default     = 10
}
