variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-south-1"
}

variable "zone_name" {
  description = "Existing Route 53 public hosted zone, e.g. example.com."
  type        = string
}

variable "domain_name" {
  description = "Host name of staging, e.g. staging.example.com."
  type        = string
}

variable "api_desired_count" {
  description = "api tasks (fixed size). Keep 0 until the secret has values; see README.md."
  type        = number
  default     = 0
}

variable "web_desired_count" {
  description = "web tasks (fixed size). Keep 0 until a version is deployed; see README.md."
  type        = number
  default     = 0
}
