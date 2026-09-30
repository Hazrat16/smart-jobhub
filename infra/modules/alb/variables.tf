variable "name" {
  description = "Name prefix, e.g. job-platform-staging. Must keep ALB/target group names within 32 characters."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID."
  type        = string
}

variable "subnet_ids" {
  description = "Public subnets for the ALB (at least two AZs)."
  type        = list(string)
}

variable "zone_name" {
  description = "Existing Route 53 public hosted zone, e.g. example.com. null = no domain (CloudFront mode)."
  type        = string
  default     = null
}

variable "domain_name" {
  description = "Host name served by this ALB, e.g. staging.example.com (must be in zone_name). null = no domain (CloudFront mode)."
  type        = string
  default     = null
}

variable "origin_verify_header" {
  description = "Header CloudFront adds to every request to the ALB (CloudFront mode)."
  type        = string
  default     = "X-Origin-Verify"
}

variable "origin_verify_secret" {
  description = "Value of origin_verify_header. Requests without it get a 403 (CloudFront mode)."
  type        = string
  default     = null
  sensitive   = true
}

variable "api_port" {
  description = "Container port of the api service."
  type        = number
  default     = 5000
}

variable "web_port" {
  description = "Container port of the web service."
  type        = number
  default     = 3000
}

variable "api_health_check_path" {
  description = "Readiness endpoint of the api."
  type        = string
  default     = "/api/health/ready"
}

variable "deletion_protection" {
  description = "Protect the ALB from deletion (true for prod)."
  type        = bool
  default     = false
}

variable "idle_timeout" {
  description = "Seconds an idle connection stays open. Socket.IO pings every 25s, so 60 is enough."
  type        = number
  default     = 60
}
