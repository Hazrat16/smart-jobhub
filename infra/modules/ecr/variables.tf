variable "name" {
  description = "ECR repository name."
  type        = string
}

variable "keep_tagged_images" {
  description = "How many tagged images to keep. Older ones are expired by the lifecycle policy."
  type        = number
  default     = 50
}

variable "untagged_expiry_days" {
  description = "Days after which untagged images (failed or partial pushes) are expired."
  type        = number
  default     = 7
}
