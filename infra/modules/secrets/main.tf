# Only the secret container is managed here. Values are filled in by hand
# (see the env README), so they never appear in Terraform state or CI.
resource "aws_secretsmanager_secret" "this" {
  # checkov:skip=CKV_AWS_149:The AWS managed key is enough; only the ECS execution role can read the value.
  # checkov:skip=CKV2_AWS_57:Third-party API keys can't be rotated automatically by Secrets Manager.
  name                    = var.name
  description             = var.description
  recovery_window_in_days = var.recovery_window_in_days
}
