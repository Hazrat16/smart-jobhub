variable "region" {
  description = "AWS region for everything in this project."
  type        = string
  default     = "ap-south-1"
}

variable "project" {
  description = "Name prefix for resources."
  type        = string
  default     = "job-platform"
}

variable "github_repo" {
  description = "GitHub repository (OWNER/NAME) whose workflows may assume the CI roles."
  type        = string
  default     = "Hazrat16/smart-jobhub"
}

variable "apps" {
  description = "Apps that get an ECR repository, named <project>-<app>."
  type        = set(string)
  default     = ["api", "web"]
}
