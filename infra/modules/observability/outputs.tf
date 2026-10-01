output "namespace" {
  description = "Private DNS namespace; services are <name>.<namespace>."
  value       = aws_service_discovery_private_dns_namespace.this.name
}

output "api_service_registry_arn" {
  description = "Cloud Map service the api tasks register in, so Prometheus finds every task."
  value       = aws_service_discovery_service.this["api"].arn
}

output "api_log_router" {
  description = "FireLens settings for the api task: the extra Fluent Bit config (Loki output) in S3."
  value = {
    config_bucket_arn = aws_s3_bucket.this.arn
    config_object_arn = "${aws_s3_bucket.this.arn}/${aws_s3_object.config["fluent-bit/api.conf"].key}"
    config_hash       = local.config_hash["fluent-bit"]
  }
}

output "bucket_name" {
  description = "Bucket holding Loki's data and the rendered configs."
  value       = aws_s3_bucket.this.id
}

output "grafana_service_name" {
  description = "Grafana ECS service (the tunnel script finds its task through it)."
  value       = module.grafana.service_name
}

output "grafana_secret_arn" {
  description = "Secret with the Grafana admin password."
  value       = aws_secretsmanager_secret.grafana.arn
}

output "service_names" {
  description = "ECS services of the stack, for the monitoring alarms."
  value = {
    prometheus = module.prometheus.service_name
    loki       = module.loki.service_name
    grafana    = module.grafana.service_name
  }
}
