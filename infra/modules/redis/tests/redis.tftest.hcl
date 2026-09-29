mock_provider "aws" {
  mock_resource "aws_elasticache_replication_group" {
    defaults = { primary_endpoint_address = "master.job-platform-staging.abc123.aps1.cache.amazonaws.com" }
  }

  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:ap-south-1:123456789012:secret:/job-platform/staging/redis-AbCdEf" }
  }
}

variables {
  name                   = "job-platform-staging"
  vpc_id                 = "vpc-0123456789abcdef0"
  subnet_ids             = ["subnet-a", "subnet-b"]
  client_security_groups = { api = "sg-0api0000000000000" }
  secret_name            = "/job-platform/staging/redis"
}

run "valkey" {
  command = apply

  assert {
    condition     = one(aws_elasticache_parameter_group.this.parameter).value == "noeviction"
    error_message = "BullMQ needs maxmemory-policy noeviction."
  }

  assert {
    condition     = aws_elasticache_parameter_group.this.family == "valkey8"
    error_message = "Parameter group family must match the engine major version."
  }

  assert {
    condition     = aws_elasticache_replication_group.this.transit_encryption_enabled && aws_elasticache_replication_group.this.at_rest_encryption_enabled
    error_message = "TLS and at-rest encryption must be on."
  }

  assert {
    condition     = aws_elasticache_replication_group.this.auth_token == random_password.auth.result
    error_message = "An AUTH token is required."
  }

  assert {
    condition     = keys(aws_vpc_security_group_ingress_rule.clients) == ["api"] && aws_vpc_security_group_ingress_rule.clients["api"].referenced_security_group_id == "sg-0api0000000000000"
    error_message = "Only the api tasks' security group may connect."
  }

  assert {
    condition     = startswith(jsondecode(aws_secretsmanager_secret_version.url.secret_string).REDIS_URL, "rediss://:")
    error_message = "REDIS_URL must use TLS (rediss://) with the AUTH token."
  }

  assert {
    condition     = endswith(jsondecode(aws_secretsmanager_secret_version.url.secret_string).REDIS_URL, "@master.job-platform-staging.abc123.aps1.cache.amazonaws.com:6379")
    error_message = "REDIS_URL must point at the primary endpoint."
  }
}
