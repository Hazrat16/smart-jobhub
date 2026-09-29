variable "project" {
  description = "Name prefix, shared with the bootstrap stack."
  type        = string
  default     = "job-platform"
}

variable "environment" {
  description = "Stack name: staging or prod. Names become <project>-<environment>-*."
  type        = string

  validation {
    condition     = contains(["staging", "prod"], var.environment)
    error_message = "environment must be staging or prod (the deploy roles are scoped to these names)."
  }
}

variable "vpc_cidr" {
  description = "VPC CIDR. Different per environment."
  type        = string
}

variable "zone_name" {
  description = "Existing Route 53 public hosted zone, e.g. example.com."
  type        = string
}

variable "domain_name" {
  description = "Host name of this environment, e.g. staging.example.com or example.com."
  type        = string
}

variable "image_tag" {
  description = "Image tag for the initial task definitions only. The deploy workflows take over after that."
  type        = string
  default     = "initial"
}

variable "api" {
  description = "api task size and scaling range. min_count = max_count means a fixed size."
  type = object({
    cpu       = number
    memory    = number
    min_count = number
    max_count = number
  })
}

variable "web" {
  description = "web task size and scaling range. min_count = max_count means a fixed size."
  type = object({
    cpu       = number
    memory    = number
    min_count = number
    max_count = number
  })
}

variable "use_spot" {
  description = "Run tasks on FARGATE_SPOT (cheaper, can be interrupted)."
  type        = bool
}

variable "api_secret_keys" {
  description = "Keys of /<project>/<env>/api (filled by hand) that ECS injects. Each key must exist in the secret (\"\" is fine for optional ones). REDIS_URL comes from the Terraform-managed redis secret."
  type        = list(string)
  default = [
    "MONGODB_URI",
    "JWT_SECRET",
    "ADMIN_BOOTSTRAP_SECRET",
    "RESEND_API_KEY",
    "CLOUDINARY_CLOUD_NAME",
    "CLOUDINARY_API_KEY",
    "CLOUDINARY_API_SECRET",
    "SSLCOMMERZ_STORE_ID",
    "SSLCOMMERZ_STORE_PASSWORD",
    "GROQ_API_KEY",
    "SENTRY_DSN",
  ]
}

variable "sslcommerz_sandbox" {
  description = "Use the SSLCommerz sandbox."
  type        = bool
}

variable "deletion_protection" {
  description = "Protect the ALB from deletion."
  type        = bool
}

variable "log_retention_days" {
  description = "CloudWatch log retention for the services."
  type        = number
}

variable "container_insights" {
  description = "Enable ECS Container Insights (billed per metric)."
  type        = bool
  default     = false
}

variable "redis_snapshot_retention_days" {
  description = "Daily Valkey snapshots to keep (0 = none; Redis holds nothing that can't be rebuilt)."
  type        = number
  default     = 0
}

variable "alert_emails" {
  description = "Who gets alarm emails. Each address must click the AWS confirmation link once."
  type        = list(string)

  validation {
    condition     = length(var.alert_emails) > 0
    error_message = "Set at least one alert email."
  }
}

variable "redis_node_type" {
  description = "Valkey node type. Move to cache.t4g.small if memory stays high (docs/runbook.md#redis-memory)."
  type        = string
  default     = "cache.t4g.micro"
}
