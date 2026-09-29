variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-south-1"
}

variable "project" {
  description = "Name prefix, shared with the bootstrap stack."
  type        = string
  default     = "job-platform"
}

variable "environment" {
  description = "Environment name."
  type        = string
  default     = "staging"
}

variable "vpc_cidr" {
  description = "VPC CIDR for this environment."
  type        = string
  default     = "10.20.0.0/16"
}

variable "zone_name" {
  description = "Existing Route 53 public hosted zone, e.g. example.com."
  type        = string
}

variable "domain_name" {
  description = "Host name of this environment, e.g. staging.example.com."
  type        = string
}

variable "image_tag" {
  description = "Image tag for the initial task definitions (a git SHA already pushed to ECR). CD takes over after the first apply."
  type        = string
  default     = "initial"
}

variable "api_desired_count" {
  description = "api tasks. Keep 0 until the secret has values (step 5) and an image is pushed."
  type        = number
  default     = 0
}

variable "web_desired_count" {
  description = "web tasks. Keep 0 until an image is pushed."
  type        = number
  default     = 0
}

variable "api_secret_keys" {
  description = "Keys of /job-platform/<env>/api that ECS injects. Each key must exist in the secret (an empty string is fine for optional ones)."
  type        = list(string)
  default = [
    "MONGODB_URI",
    "REDIS_URL",
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
  default     = true
}
