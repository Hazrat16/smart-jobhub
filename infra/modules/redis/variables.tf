variable "name" {
  description = "Name prefix, e.g. job-platform-staging."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID."
  type        = string
}

variable "subnet_ids" {
  description = "Subnets for the cache subnet group. ElastiCache never gets a public IP, even in public subnets."
  type        = list(string)
}

variable "client_security_groups" {
  description = "Security groups allowed to connect, as static label => SG ID (e.g. { api = ... }). A map so for_each keys are known at plan time."
  type        = map(string)
}

variable "node_type" {
  description = "Cache node type."
  type        = string
  default     = "cache.t4g.micro"
}

variable "engine_version" {
  description = "Valkey major.minor version."
  type        = string
  default     = "8.0"
}

variable "snapshot_retention_days" {
  description = "Daily snapshots to keep (0 = none). Redis holds cache, rate limits and short-lived queue jobs only."
  type        = number
  default     = 0
}

variable "secret_name" {
  description = "Secrets Manager secret that receives {\"REDIS_URL\": \"rediss://...\"}."
  type        = string
}
