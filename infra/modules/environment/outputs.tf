output "url" {
  description = "Public URL."
  value       = module.alb.url
}

output "alb_dns_name" {
  description = "ALB DNS name (the Route 53 alias points here)."
  value       = module.alb.dns_name
}

output "cluster_name" {
  description = "ECS cluster."
  value       = aws_ecs_cluster.this.name
}

output "api_secret_name" {
  description = "Fill this secret by hand (see infra/DATA.md)."
  value       = module.api_secret.name
}

output "redis_endpoint" {
  description = "Valkey primary endpoint (TLS, AUTH token in the redis secret)."
  value       = module.redis.primary_endpoint
}

output "services" {
  description = "Per-app values the CD workflows need."
  value = {
    for app, svc in local.services : app => {
      service_name           = svc.service_name
      task_definition_family = svc.task_definition_family
      execution_role_arn     = svc.execution_role_arn
      task_role_arn          = svc.task_role_arn
      log_group_name         = svc.log_group_name
    }
  }
}

output "settings" {
  description = "What this environment is configured with (for review and tests)."
  value = {
    use_spot            = var.use_spot
    api_scaling         = { min = var.api.min_count, max = var.api.max_count }
    web_scaling         = { min = var.web.min_count, max = var.web.max_count }
    deletion_protection = var.deletion_protection
    log_retention_days  = var.log_retention_days
    sslcommerz_sandbox  = var.sslcommerz_sandbox
  }
}
