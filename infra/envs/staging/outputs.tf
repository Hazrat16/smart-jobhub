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
  description = "Fill this secret by hand (see README.md)."
  value       = module.api_secret.name
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
