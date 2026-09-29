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
  description = "Host name of production, e.g. example.com or app.example.com."
  type        = string
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
