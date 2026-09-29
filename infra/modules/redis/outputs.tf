output "secret_arn" {
  description = "Secret holding {\"REDIS_URL\": ...}."
  value       = aws_secretsmanager_secret.url.arn
}

output "primary_endpoint" {
  description = "Valkey primary endpoint."
  value       = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "security_group_id" {
  description = "Valkey security group."
  value       = aws_security_group.this.id
}

output "cache_cluster_id" {
  description = "The Valkey node's ID (CloudWatch CacheClusterId dimension)."
  value       = one(aws_elasticache_replication_group.this.member_clusters)
}
