variable "name" {
  description = "Secret name, e.g. /job-platform/staging/api."
  type        = string
}

variable "description" {
  description = "What the secret holds."
  type        = string
}

variable "recovery_window_in_days" {
  description = "Days a deleted secret can still be restored."
  type        = number
  default     = 7
}
