variable "name" {
  description = "Name prefix, e.g. job-platform-staging."
  type        = string
}

variable "cidr_block" {
  description = "VPC CIDR. Use a different one per environment so they could be peered later."
  type        = string
}

variable "az_count" {
  description = "Number of availability zones (the ALB needs at least 2)."
  type        = number
  default     = 2

  validation {
    condition     = var.az_count >= 2
    error_message = "An ALB needs subnets in at least two availability zones."
  }
}
