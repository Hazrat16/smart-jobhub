# Prometheus, Loki and Grafana for one environment, on Fargate. See
# docs/observability.md for the picture and how to open Grafana.
#
#   api tasks ── /metrics ──> Prometheus (EFS) ──┐
#   api tasks ── FireLens ──> Loki (S3) ─────────┼──> Grafana (private, SSM port forward)
#             └─ FireLens ──> CloudWatch Logs    │
#
# Tasks find each other through a private Cloud Map namespace, <name>.internal.
# Nothing here is reachable from the internet.

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  # Known at plan time (unlike the namespace resource's attributes), so the
  # rendered configs and their hashes are too.
  namespace = "${var.name}.internal"

  dashboards = fileset(var.dashboards_dir, "*.json")

  # Key = path under config/ in the bucket.
  config_files = merge(
    {
      "prometheus/prometheus.yml" = templatefile("${path.module}/templates/prometheus.yml.tftpl", {
        namespace   = local.namespace
        environment = var.environment
      })
      "prometheus/alerts.yml" = file(var.alert_rules_file)

      "loki/loki.yml" = templatefile("${path.module}/templates/loki.yml.tftpl", {
        region          = data.aws_region.current.region
        bucket          = local.bucket_name
        retention_hours = var.logs_retention_days * 24
      })

      "grafana/provisioning/datasources/datasources.yml" = templatefile("${path.module}/templates/datasources.yml.tftpl", {
        namespace = local.namespace
      })
      "grafana/provisioning/dashboards/dashboards.yml" = file("${path.module}/templates/dashboards.yml")

      "fluent-bit/api.conf" = templatefile("${path.module}/templates/fluent-bit-api.conf.tftpl", {
        namespace   = local.namespace
        environment = var.environment
      })
    },
    { for f in local.dashboards : "grafana/dashboards/${f}" => file("${var.dashboards_dir}/${f}") },
  )

  # One hash per service: a changed file rolls only the service that reads it.
  config_hash = {
    for svc in ["prometheus", "loki", "grafana", "fluent-bit"] :
    svc => sha256(join("\n", [for k in sort(keys(local.config_files)) : "${k}\n${local.config_files[k]}" if startswith(k, "${svc}/")]))
  }

  bucket_name = "${var.name}-observability-${data.aws_caller_identity.current.account_id}"
}

# ---------------------------------------------------------------------------
# Service discovery: <service>.<name>.internal resolves to the running tasks
# ---------------------------------------------------------------------------

resource "aws_service_discovery_private_dns_namespace" "this" {
  name        = local.namespace
  description = "${var.name}: names for tasks that talk to each other inside the VPC"
  vpc         = var.vpc_id
}

resource "aws_service_discovery_service" "this" {
  for_each = toset(["api", "loki", "prometheus"])

  name          = each.key
  force_destroy = true

  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.this.id
    routing_policy = "MULTIVALUE"

    dns_records {
      ttl  = 10
      type = "A"
    }
  }
}

# ---------------------------------------------------------------------------
# S3: Loki's chunks and index, plus every service's config files (config/)
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "this" {
  # checkov:skip=CKV_AWS_144:Cross-region replication is out of scope for the cost target; the logs are also in CloudWatch.
  # checkov:skip=CKV_AWS_18:Access logging would need a second bucket; CloudTrail covers management access.
  # checkov:skip=CKV2_AWS_62:No consumers for S3 event notifications.
  # checkov:skip=CKV_AWS_145:SSE-S3 is enough; access is controlled by IAM, and a CMK adds cost.
  # checkov:skip=CKV_AWS_21:Versioning would keep every chunk Loki's retention deletes; the configs come from the repo.
  bucket = local.bucket_name

  # Logs and rendered configs only: nothing here that can't be regenerated or isn't also in CloudWatch.
  force_destroy = true
}

resource "aws_s3_bucket_ownership_controls" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  # Loki's compactor enforces retention itself; this only cleans up failed uploads.
  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

data "aws_iam_policy_document" "bucket" {
  statement {
    sid       = "DenyInsecureTransport"
    effect    = "Deny"
    actions   = ["s3:*"]
    resources = [aws_s3_bucket.this.arn, "${aws_s3_bucket.this.arn}/*"]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "this" {
  bucket = aws_s3_bucket.this.id
  policy = data.aws_iam_policy_document.bucket.json

  depends_on = [aws_s3_bucket_public_access_block.this]
}

resource "aws_s3_object" "config" {
  for_each = local.config_files

  bucket  = aws_s3_bucket.this.id
  key     = "config/${each.key}"
  content = each.value
  content_type = (
    endswith(each.key, ".json") ? "application/json" :
    endswith(each.key, ".conf") ? "text/plain" : "application/yaml"
  )
}

# ---------------------------------------------------------------------------
# EFS for Prometheus' data, so a new task keeps the history
# ---------------------------------------------------------------------------

resource "aws_efs_file_system" "prometheus" {
  # checkov:skip=CKV_AWS_184:The AWS managed key is enough for metrics; a CMK adds cost.
  # checkov:skip=CKV2_AWS_18:Metrics are disposable and rebuilt from the running services; no backup plan.
  creation_token = "${var.name}-prometheus"
  encrypted      = true

  tags = { Name = "${var.name}-prometheus" }
}

resource "aws_security_group" "efs" {
  name        = "${var.name}-prometheus-efs"
  description = "${var.name} Prometheus EFS: NFS from the Prometheus tasks only"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.name}-prometheus-efs" }
}

resource "aws_vpc_security_group_ingress_rule" "efs_from_prometheus" {
  security_group_id            = aws_security_group.efs.id
  description                  = "NFS from Prometheus"
  referenced_security_group_id = module.prometheus.security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 2049
  to_port                      = 2049
}

resource "aws_efs_mount_target" "prometheus" {
  count = length(var.subnet_ids)

  file_system_id  = aws_efs_file_system.prometheus.id
  subnet_id       = var.subnet_ids[count.index]
  security_groups = [aws_security_group.efs.id]
}

# Prometheus runs as nobody (65534); the access point makes every write that user.
resource "aws_efs_access_point" "prometheus" {
  file_system_id = aws_efs_file_system.prometheus.id

  posix_user {
    uid = 65534
    gid = 65534
  }

  root_directory {
    path = "/prometheus"

    creation_info {
      owner_uid   = 65534
      owner_gid   = 65534
      permissions = "0755"
    }
  }

  tags = { Name = "${var.name}-prometheus" }
}

# ---------------------------------------------------------------------------
# Grafana admin password (generated; read it with the command in the docs)
# ---------------------------------------------------------------------------

resource "random_password" "grafana_admin" {
  length  = 32
  special = false
}

resource "aws_secretsmanager_secret" "grafana" {
  # checkov:skip=CKV_AWS_149:The AWS managed key is enough; only the Grafana execution role and admins can read it.
  # checkov:skip=CKV2_AWS_57:Rotating means changing Grafana's stored password too; regenerate with terraform apply -replace instead.
  name        = var.grafana_secret_name
  description = "Grafana admin password for ${var.name} (generated by Terraform)."
  # Regenerated on every create, so there's nothing to recover. 0 also lets a
  # destroyed environment be recreated without a name clash.
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "grafana" {
  secret_id     = aws_secretsmanager_secret.grafana.id
  secret_string = jsonencode({ GF_SECURITY_ADMIN_PASSWORD = random_password.grafana_admin.result })
}

# ---------------------------------------------------------------------------
# Services
# ---------------------------------------------------------------------------

locals {
  common = {
    cluster_arn              = var.cluster_arn
    vpc_id                   = var.vpc_id
    subnet_ids               = var.subnet_ids
    use_spot                 = var.use_spot
    log_retention_days       = var.log_retention_days
    permissions_boundary_arn = var.permissions_boundary_arn
  }

  config_base = {
    bucket     = aws_s3_bucket.this.id
    bucket_arn = aws_s3_bucket.this.arn
  }
}

module "prometheus" {
  source = "../internal-service"

  name                     = "${var.name}-prometheus"
  cluster_arn              = local.common.cluster_arn
  vpc_id                   = local.common.vpc_id
  subnet_ids               = local.common.subnet_ids
  use_spot                 = local.common.use_spot
  log_retention_days       = local.common.log_retention_days
  permissions_boundary_arn = local.common.permissions_boundary_arn

  image          = var.images.prometheus
  container_port = 9090
  cpu            = 256
  memory         = 512
  command = [
    "--config.file=/etc/prometheus/config/prometheus.yml",
    "--storage.tsdb.path=/prometheus",
    "--storage.tsdb.retention.time=${var.metrics_retention_days}d",
    "--storage.tsdb.retention.size=4GB",
    # A lock file left by a stopped task would block the next one on EFS;
    # single_instance already guarantees one writer.
    "--storage.tsdb.no-lockfile",
  ]

  config = merge(local.config_base, {
    prefix     = "config/prometheus"
    mount_path = "/etc/prometheus/config"
    hash       = local.config_hash["prometheus"]
  })

  efs = {
    file_system_id  = aws_efs_file_system.prometheus.id
    file_system_arn = aws_efs_file_system.prometheus.arn
    access_point_id = aws_efs_access_point.prometheus.id
    container_path  = "/prometheus"
  }

  service_registry_arn = aws_service_discovery_service.this["prometheus"].arn
  single_instance      = true

  depends_on = [aws_s3_object.config, aws_efs_mount_target.prometheus]
}

data "aws_iam_policy_document" "loki_storage" {
  statement {
    sid       = "ListBucket"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.this.arn]
  }

  statement {
    sid       = "ReadWriteChunks"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.this.arn}/*"]
  }
}

module "loki" {
  source = "../internal-service"

  name                     = "${var.name}-loki"
  cluster_arn              = local.common.cluster_arn
  vpc_id                   = local.common.vpc_id
  subnet_ids               = local.common.subnet_ids
  use_spot                 = local.common.use_spot
  log_retention_days       = local.common.log_retention_days
  permissions_boundary_arn = local.common.permissions_boundary_arn

  image          = var.images.loki
  container_port = 3100
  cpu            = 256
  memory         = 1024
  command        = ["-config.file=/etc/loki/config/loki.yml"]

  config = merge(local.config_base, {
    prefix     = "config/loki"
    mount_path = "/etc/loki/config"
    hash       = local.config_hash["loki"]
  })

  service_registry_arn = aws_service_discovery_service.this["loki"].arn
  single_instance      = true
  task_policies        = { storage = data.aws_iam_policy_document.loki_storage.json }

  depends_on = [aws_s3_object.config]
}

module "grafana" {
  source = "../internal-service"

  name                     = "${var.name}-grafana"
  cluster_arn              = local.common.cluster_arn
  vpc_id                   = local.common.vpc_id
  subnet_ids               = local.common.subnet_ids
  use_spot                 = local.common.use_spot
  log_retention_days       = local.common.log_retention_days
  permissions_boundary_arn = local.common.permissions_boundary_arn

  image          = var.images.grafana
  container_port = 3000
  cpu            = 256
  memory         = 512

  # Stateless: users, data sources and dashboards all come from config, so the
  # SQLite database on the task's disk can be lost with every restart.
  environment = {
    GF_PATHS_PROVISIONING                     = "/etc/grafana/config/provisioning"
    GF_DASHBOARDS_DEFAULT_HOME_DASHBOARD_PATH = "/etc/grafana/config/dashboards/api-overview.json"
    GF_SECURITY_ADMIN_USER                    = "admin"
    GF_USERS_ALLOW_SIGN_UP                    = "false"
    GF_AUTH_ANONYMOUS_ENABLED                 = "false"
    GF_ANALYTICS_REPORTING_ENABLED            = "false"
    GF_ANALYTICS_CHECK_FOR_UPDATES            = "false"
  }
  secrets = {
    GF_SECURITY_ADMIN_PASSWORD = { arn = aws_secretsmanager_secret.grafana.arn, key = "GF_SECURITY_ADMIN_PASSWORD" }
  }

  config = merge(local.config_base, {
    prefix     = "config/grafana"
    mount_path = "/etc/grafana/config"
    hash       = local.config_hash["grafana"]
  })

  # Opened only through an SSM port forward (scripts/grafana-tunnel.sh).
  enable_execute_command = true

  depends_on = [aws_s3_object.config, aws_secretsmanager_secret_version.grafana]
}

# ---------------------------------------------------------------------------
# Who may talk to whom (everything else is closed)
# ---------------------------------------------------------------------------

resource "aws_vpc_security_group_ingress_rule" "api_from_prometheus" {
  security_group_id            = var.api_security_group_id
  description                  = "Prometheus scrapes /metrics"
  referenced_security_group_id = module.prometheus.security_group_id
  ip_protocol                  = "tcp"
  from_port                    = var.api_port
  to_port                      = var.api_port
}

resource "aws_vpc_security_group_ingress_rule" "loki" {
  for_each = {
    api        = var.api_security_group_id
    grafana    = module.grafana.security_group_id
    prometheus = module.prometheus.security_group_id
  }

  security_group_id            = module.loki.security_group_id
  description                  = "Loki from ${each.key}"
  referenced_security_group_id = each.value
  ip_protocol                  = "tcp"
  from_port                    = 3100
  to_port                      = 3100
}

resource "aws_vpc_security_group_ingress_rule" "prometheus_from_grafana" {
  security_group_id            = module.prometheus.security_group_id
  description                  = "Grafana queries Prometheus"
  referenced_security_group_id = module.grafana.security_group_id
  ip_protocol                  = "tcp"
  from_port                    = 9090
  to_port                      = 9090
}
