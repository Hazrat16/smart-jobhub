output "url" {
  description = "Public URL."
  value       = module.env.url
}

output "cluster_name" {
  description = "ECS cluster."
  value       = module.env.cluster_name
}

output "api_secret_name" {
  description = "Fill this secret by hand (see infra/DATA.md)."
  value       = module.env.api_secret_name
}

output "redis_endpoint" {
  description = "Valkey primary endpoint."
  value       = module.env.redis_endpoint
}

output "services" {
  description = "Per-app ECS names and roles."
  value       = module.env.services
}

output "settings" {
  description = "Capacity, scaling and protection settings of this environment."
  value       = module.env.settings
}

output "observability" {
  description = "Prometheus/Loki/Grafana stack (null when off). Open Grafana with scripts/grafana-tunnel.sh."
  value       = module.env.observability
}
