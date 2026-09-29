variable "name" {
  description = "IAM role name."
  type        = string
}

variable "path" {
  description = "IAM path for the role. CI roles live under their own path so they cannot edit each other through path-scoped IAM permissions."
  type        = string
  default     = "/job-platform-ci/"
}

variable "oidc_provider_arn" {
  description = "ARN of the account's GitHub Actions OIDC provider."
  type        = string
}

variable "subjects" {
  description = <<-EOT
    Allowed OIDC `sub` values (StringLike, so `*` works). The repo's subject template must include
    job_workflow_ref (see infra/BOOTSTRAP.md), giving values like
    repo:OWNER/REPO:environment:staging:job_workflow_ref:OWNER/REPO/.github/workflows/api.yml@refs/heads/main
  EOT
  type        = list(string)

  validation {
    condition     = length(var.subjects) > 0 && alltrue([for s in var.subjects : can(regex(":job_workflow_ref:", s))])
    error_message = "Every subject must pin job_workflow_ref so one workflow cannot assume another's role."
  }
}

variable "managed_policy_arns" {
  description = "AWS or customer managed policies to attach."
  type        = list(string)
  default     = []
}

variable "inline_policies" {
  description = "Inline policies as name => JSON document."
  type        = map(string)
  default     = {}
}

variable "max_session_duration" {
  description = "Maximum session length in seconds."
  type        = number
  default     = 3600
}
