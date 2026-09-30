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

variable "github_repo_ids" {
  description = <<-EOT
    The repo's immutable OIDC identity, OWNER@OWNER_ID/NAME@REPO_ID, when GitHub uses immutable
    subjects (repos created since 2026 do by default). Copy it from `sub_claim_prefix` in
    `gh api repos/OWNER/NAME/actions/oidc/customization/sub`, without the leading "repo:".
    null = classic subjects (repo:OWNER/NAME:...).
  EOT
  type        = string
  default     = null

  validation {
    condition     = var.github_repo_ids == null || can(regex("^[^/@:]+@[0-9]+/[^/@:]+@[0-9]+$", var.github_repo_ids))
    error_message = "github_repo_ids looks like Hazrat16@54895423/smart-jobhub@1393997882 (no \"repo:\" prefix)."
  }
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
