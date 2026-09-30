variable "name" {
  description = "Name prefix, e.g. job-platform-staging (shown as the distribution's comment)."
  type        = string
}

variable "alb_dns_name" {
  description = "The ALB's DNS name (the origin)."
  type        = string
}

variable "origin_verify_header" {
  description = "Header added to every origin request; the ALB refuses requests without it."
  type        = string
  default     = "X-Origin-Verify"
}

variable "origin_verify_secret" {
  description = "Value of origin_verify_header."
  type        = string
  sensitive   = true
}

variable "price_class" {
  description = "Edge locations to use. PriceClass_200 includes India and the rest of Asia."
  type        = string
  default     = "PriceClass_200"
}
