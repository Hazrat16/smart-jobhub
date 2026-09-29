output "role_arn" {
  description = "Role ARN, used as `role-to-assume` in aws-actions/configure-aws-credentials."
  value       = aws_iam_role.this.arn
}

output "role_name" {
  description = "Role name."
  value       = aws_iam_role.this.name
}
