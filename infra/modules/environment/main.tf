data "aws_caller_identity" "current" {}

locals {
  name       = "${var.project}-${var.environment}"
  account_id = data.aws_caller_identity.current.account_id
  public_url = "https://${var.domain_name}"

  # Created by infra/bootstrap.
  workload_boundary_arn = "arn:aws:iam::${local.account_id}:policy/${var.project}/${var.project}-workload-boundary"
}

data "aws_ecr_repository" "app" {
  for_each = toset(["api", "web"])

  name = "${var.project}-${each.key}"
}

module "network" {
  source = "../network"

  name       = local.name
  cidr_block = var.vpc_cidr
}

module "alb" {
  source = "../alb"

  name                = local.name
  vpc_id              = module.network.vpc_id
  subnet_ids          = module.network.public_subnet_ids
  zone_name           = var.zone_name
  domain_name         = var.domain_name
  deletion_protection = var.deletion_protection
}

module "api_secret" {
  source = "../secrets"

  name        = "/${var.project}/${var.environment}/api"
  description = "Runtime secrets for the ${var.environment} api (JSON object, one key per env var)."
}

module "redis" {
  source = "../redis"

  name                    = local.name
  vpc_id                  = module.network.vpc_id
  subnet_ids              = module.network.public_subnet_ids
  client_security_groups  = { api = module.api.security_group_id }
  secret_name             = "/${var.project}/${var.environment}/redis"
  snapshot_retention_days = var.redis_snapshot_retention_days
  node_type               = var.redis_node_type
}

resource "aws_ecs_cluster" "this" {
  # checkov:skip=CKV_AWS_65:Off by default (billed per metric); prod turns it on with var.container_insights.
  name = local.name

  setting {
    name  = "containerInsights"
    value = var.container_insights ? "enabled" : "disabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
}

module "api" {
  source = "../ecs-service"

  name                     = "${local.name}-api"
  cluster_arn              = aws_ecs_cluster.this.arn
  vpc_id                   = module.network.vpc_id
  subnet_ids               = module.network.public_subnet_ids
  alb_security_group_id    = module.alb.security_group_id
  target_group_arn         = module.alb.api_target_group_arn
  image                    = "${data.aws_ecr_repository.app["api"].repository_url}:${var.image_tag}"
  container_port           = 5000
  cpu                      = var.api.cpu
  memory                   = var.api.memory
  min_count                = var.api.min_count
  max_count                = var.api.max_count
  use_spot                 = var.use_spot
  log_retention_days       = var.log_retention_days
  permissions_boundary_arn = local.workload_boundary_arn

  environment = {
    NODE_ENV              = "production"
    PORT                  = "5000"
    HOST                  = "0.0.0.0"
    TRUST_PROXY_HOPS      = "1"
    FRONTEND_URL          = local.public_url
    API_PUBLIC_BASE_URL   = local.public_url
    CORS_ALLOWED_ORIGINS  = local.public_url
    SSLCOMMERZ_IS_SANDBOX = tostring(var.sslcommerz_sandbox)
    # NODE_ENV is "production" everywhere; this tells Sentry which env it is.
    SENTRY_ENVIRONMENT = var.environment == "prod" ? "production" : var.environment
  }

  secrets = merge(
    { for k in var.api_secret_keys : k => { arn = module.api_secret.arn, key = k } },
    { REDIS_URL = { arn = module.redis.secret_arn, key = "REDIS_URL" } },
  )

  depends_on = [aws_ecs_cluster_capacity_providers.this]
}

module "web" {
  source = "../ecs-service"

  name                     = "${local.name}-web"
  cluster_arn              = aws_ecs_cluster.this.arn
  vpc_id                   = module.network.vpc_id
  subnet_ids               = module.network.public_subnet_ids
  alb_security_group_id    = module.alb.security_group_id
  target_group_arn         = module.alb.web_target_group_arn
  image                    = "${data.aws_ecr_repository.app["web"].repository_url}:${var.image_tag}"
  container_port           = 3000
  cpu                      = var.web.cpu
  memory                   = var.web.memory
  min_count                = var.web.min_count
  max_count                = var.web.max_count
  use_spot                 = var.use_spot
  log_retention_days       = var.log_retention_days
  permissions_boundary_arn = local.workload_boundary_arn

  depends_on = [aws_ecs_cluster_capacity_providers.this]
}

locals {
  services = {
    api = module.api
    web = module.web
  }
}

module "monitoring" {
  source = "../monitoring"

  name                   = local.name
  alert_emails           = var.alert_emails
  alb_arn_suffix         = module.alb.arn_suffix
  cluster_name           = aws_ecs_cluster.this.name
  redis_cache_cluster_id = module.redis.cache_cluster_id

  services = {
    api = {
      service_name            = module.api.service_name
      target_group_arn_suffix = module.alb.api_target_group_arn_suffix
      expected_running        = var.api.min_count >= 1
    }
    web = {
      service_name            = module.web.service_name
      target_group_arn_suffix = module.alb.web_target_group_arn_suffix
      expected_running        = var.web.min_count >= 1
    }
  }
}
