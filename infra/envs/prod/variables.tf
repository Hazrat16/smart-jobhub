variable "region" {
  description = "AWS region."
  type        = string
  default     = "ap-south-1"
}

variable "alert_emails" {
  description = "Who gets alarm emails (each confirms once). A shared alias beats a personal inbox."
  type        = list(string)
}

variable "zone_name" {
  description = "Existing Route 53 public hosted zone, e.g. example.com. Leave unset for no domain (CloudFront URL)."
  type        = string
  default     = null
}

variable "domain_name" {
  description = "Host name of production, e.g. example.com or app.example.com. Leave unset for no domain (CloudFront URL)."
  type        = string
  default     = null
}

variable "api_min_count" {
  description = "Minimum api tasks. 1 is cheapest; 2 survives a task or AZ failure without downtime."
  type        = number
  default     = 1
}

variable "web_min_count" {
  description = "Minimum web tasks. 1 is cheapest; 2 survives a task or AZ failure without downtime."
  type        = number
  default     = 1
}
