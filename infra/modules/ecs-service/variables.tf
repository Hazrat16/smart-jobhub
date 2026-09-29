variable "name" {
  description = "Service name, e.g. job-platform-staging-api. Also the task definition family."
  type        = string
}

variable "cluster_arn" {
  description = "ECS cluster ARN."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID."
  type        = string
}

variable "subnet_ids" {
  description = "Subnets for the tasks (public, with a public IP: no NAT)."
  type        = list(string)
}

variable "alb_security_group_id" {
  description = "Only this security group may reach the container port."
  type        = string
}

variable "target_group_arn" {
  description = "ALB target group the service registers into."
  type        = string
}

variable "image" {
  description = "Initial image (repo URL + tag). After the first apply, CD registers new task definition revisions; Terraform ignores those."
  type        = string
}

variable "container_port" {
  description = "Port the container listens on."
  type        = number
}

variable "cpu" {
  description = "Task CPU units (256 = 0.25 vCPU)."
  type        = number
  default     = 256
}

variable "memory" {
  description = "Task memory in MiB."
  type        = number
  default     = 512
}

variable "min_count" {
  description = "Minimum running tasks (0 keeps the service defined but stopped)."
  type        = number
  default     = 1
}

variable "max_count" {
  description = "Maximum running tasks. Equal to min_count means a fixed size with no scaling policy."
  type        = number
  default     = 1

  validation {
    condition     = var.max_count >= 0
    error_message = "max_count can't be negative."
  }
}

variable "cpu_target_percent" {
  description = "Target average CPU for scaling between min_count and max_count."
  type        = number
  default     = 60
}

variable "environment" {
  description = "Plain environment variables."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = <<-EOT
    Env vars injected from Secrets Manager: env var name => { arn, key }, where key is a JSON key
    inside that secret. Every key must exist in its secret, or the task fails to start.
  EOT
  type = map(object({
    arn = string
    key = string
  }))
  default = {}
}

variable "use_spot" {
  description = "Run on FARGATE_SPOT (about 70% cheaper, can be interrupted). Fine for staging, not for prod."
  type        = bool
  default     = false
}

variable "health_check_grace_period_seconds" {
  description = "Seconds the ALB health check is ignored after a task starts."
  type        = number
  default     = 60
}

variable "log_retention_days" {
  description = "CloudWatch log retention."
  type        = number
  default     = 14
}

variable "permissions_boundary_arn" {
  description = "Boundary required on every role created by the infra pipeline (bootstrap output workload_boundary_arn)."
  type        = string
}

variable "iam_path" {
  description = "IAM path for the task roles. infra-deployer may only manage roles under it."
  type        = string
  default     = "/job-platform/"
}
