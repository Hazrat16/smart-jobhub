# Single-node Valkey (Redis-compatible) for the Socket.IO adapter, rate limiting,
# cache and the BullMQ email queue. TLS in transit plus an AUTH token; reachable
# only from the client security groups.

resource "random_password" "auth" {
  length  = 64
  special = false # AUTH tokens reject some specials (@, ", /); alphanumeric keeps the URL simple too.
}

resource "aws_security_group" "this" {
  name        = "${var.name}-redis"
  description = "${var.name} Valkey: ingress from the api tasks only"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.name}-redis" }
}

resource "aws_vpc_security_group_ingress_rule" "clients" {
  for_each = var.client_security_groups

  security_group_id            = aws_security_group.this.id
  description                  = "Valkey from ${each.key}"
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 6379
  to_port                      = 6379
}

resource "aws_elasticache_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.subnet_ids
}

resource "aws_elasticache_parameter_group" "this" {
  name   = "${var.name}-valkey${split(".", var.engine_version)[0]}"
  family = "valkey${split(".", var.engine_version)[0]}"

  # BullMQ requires noeviction: an evicted job key silently loses the job.
  parameter {
    name  = "maxmemory-policy"
    value = "noeviction"
  }
}

resource "aws_elasticache_replication_group" "this" {
  # checkov:skip=CKV_AWS_191:The AWS managed key is enough for cache and queue data; a CMK adds cost.
  # checkov:skip=CKV2_AWS_50:Single node on purpose (cost); losing the node drops cache and pending emails, not user data.
  replication_group_id = var.name
  description          = "${var.name} Valkey"
  engine               = "valkey"
  engine_version       = var.engine_version
  node_type            = var.node_type
  num_cache_clusters   = 1
  port                 = 6379
  parameter_group_name = aws_elasticache_parameter_group.this.name
  subnet_group_name    = aws_elasticache_subnet_group.this.name
  security_group_ids   = [aws_security_group.this.id]

  automatic_failover_enabled = false
  multi_az_enabled           = false
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                 = random_password.auth.result
  auth_token_update_strategy = "ROTATE"

  snapshot_retention_limit   = var.snapshot_retention_days
  auto_minor_version_upgrade = true
  maintenance_window         = "sun:20:00-sun:21:00" # 01:30–02:30 in Dhaka
  apply_immediately          = false
}

# Terraform owns this credential end to end, so it also writes the connection
# string. ECS injects it as REDIS_URL; nobody has to copy the token by hand.
resource "aws_secretsmanager_secret" "url" {
  # checkov:skip=CKV_AWS_149:The AWS managed key is enough; only the api execution role can read it.
  # checkov:skip=CKV2_AWS_57:Rotate by tainting random_password.auth (auth_token_update_strategy = ROTATE).
  name                    = var.secret_name
  description             = "REDIS_URL for ${var.name} (managed by Terraform)."
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret_version" "url" {
  secret_id = aws_secretsmanager_secret.url.id
  secret_string = jsonencode({
    REDIS_URL = "rediss://:${random_password.auth.result}@${aws_elasticache_replication_group.this.primary_endpoint_address}:6379"
  })
}
