variable "name" {
  description = "Name prefix, e.g. job-platform-staging."
  type        = string
}

variable "environment" {
  description = "Environment name (staging or prod); becomes the env label on metrics and logs."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID."
  type        = string
}

variable "subnet_ids" {
  description = "Subnets for the tasks and the EFS mount targets."
  type        = list(string)
}

variable "cluster_arn" {
  description = "ECS cluster the services run in."
  type        = string
}

variable "use_spot" {
  description = "Run the services on FARGATE_SPOT."
  type        = bool
  default     = false
}

variable "api_security_group_id" {
  description = "The api tasks' security group: Prometheus gets ingress to the metrics port, and the api's log router reaches Loki."
  type        = string
}

variable "api_port" {
  description = "Port the api serves /metrics on."
  type        = number
  default     = 5000
}

variable "grafana_secret_name" {
  description = "Secrets Manager name for the generated Grafana admin password."
  type        = string
}

variable "alert_rules_file" {
  description = "Prometheus alert rules (the same file the local stack uses)."
  type        = string
}

variable "dashboards_dir" {
  description = "Directory of Grafana dashboard JSON files (the same ones the local stack uses)."
  type        = string
}

variable "metrics_retention_days" {
  description = "How long Prometheus keeps metrics."
  type        = number
  default     = 15
}

variable "logs_retention_days" {
  description = "How long Loki keeps logs. CloudWatch keeps its own copy for log_retention_days."
  type        = number
  default     = 7
}

variable "log_retention_days" {
  description = "CloudWatch retention for the observability services' own logs."
  type        = number
  default     = 14
}

variable "permissions_boundary_arn" {
  description = "Permissions boundary for the roles (required by the infra deployer)."
  type        = string
}

variable "images" {
  description = "Pinned images. Keep them in step with apps/api/docker-compose.observability.yml."
  type = object({
    prometheus = string
    loki       = string
    grafana    = string
  })
  default = {
    prometheus = "prom/prometheus:v3.5.0"
    loki       = "grafana/loki:3.5.3"
    grafana    = "grafana/grafana:12.1.1"
  }
}
