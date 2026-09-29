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

variable "monthly_budget_usd" {
  description = "Monthly cost budget for the whole account (PLAN.md target: $70–110)."
  type        = number
  default     = 110
}

variable "budget_alert_emails" {
  description = "Who gets budget emails (a shared alias beats a personal inbox)."
  type        = list(string)

  validation {
    condition     = length(var.budget_alert_emails) > 0
    error_message = "Set at least one budget alert email."
  }
}
