variable "name" {
  description = "ECR repository name."
  type        = string
}

variable "keep_tagged_images" {
  description = <<-EOT
    How many tagged images (versions) to keep; older ones are expired. Keep this well above the number
    of versions released between production deploys: if the version prod runs is expired, prod can't
    start new tasks (scale-out, restarts) until it's redeployed.
  EOT
  type        = number
  default     = 200
}

variable "untagged_expiry_days" {
  description = "Days after which untagged images (failed or partial pushes) are expired."
  type        = number
  default     = 7
}
