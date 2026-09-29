output "state_bucket" {
  description = "S3 bucket for every stack's Terraform state."
  value       = aws_s3_bucket.tfstate.bucket
}

output "oidc_provider_arn" {
  description = "GitHub Actions OIDC provider ARN."
  value       = aws_iam_openid_connect_provider.github.arn
}

output "workload_boundary_arn" {
  description = "Permissions boundary that every role created by the env stacks must set."
  value       = aws_iam_policy.workload_boundary.arn
}

output "ecr_repository_urls" {
  description = "ECR repository URL per app."
  value       = { for app, repo in module.ecr : app => repo.repository_url }
}

output "infra_planner_role_arn" {
  description = "Role for `terraform plan` on pull requests (GitHub variable AWS_INFRA_PLANNER_ROLE_ARN)."
  value       = module.infra_planner.role_arn
}

output "infra_deployer_role_arn" {
  description = "Role for `terraform apply` on main (GitHub variable AWS_INFRA_DEPLOYER_ROLE_ARN)."
  value       = module.infra_deployer.role_arn
}
