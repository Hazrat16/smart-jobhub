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
  source = "../../modules/network"

  name       = local.name
  cidr_block = var.vpc_cidr
}

module "alb" {
  source = "../../modules/alb"

  name        = local.name
  vpc_id      = module.network.vpc_id
  subnet_ids  = module.network.public_subnet_ids
  zone_name   = var.zone_name
  domain_name = var.domain_name
}

module "api_secret" {
  source = "../../modules/secrets"

  name        = "/${var.project}/${var.environment}/api"
  description = "Runtime secrets for the ${var.environment} api (JSON object, one key per env var)."
}

module "redis" {
  source = "../../modules/redis"

  name                   = local.name
  vpc_id                 = module.network.vpc_id
  subnet_ids             = module.network.public_subnet_ids
  client_security_groups = { api = module.api.security_group_id }
  secret_name            = "/${var.project}/${var.environment}/redis"
}

resource "aws_ecs_cluster" "this" {
  # checkov:skip=CKV_AWS_65:Container Insights is billed per metric; the ALB and service metrics are enough for staging.
  name = local.name

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]
}

module "api" {
  source = "../../modules/ecs-service"

  name                     = "${local.name}-api"
  cluster_arn              = aws_ecs_cluster.this.arn
  vpc_id                   = module.network.vpc_id
  subnet_ids               = module.network.public_subnet_ids
  alb_security_group_id    = module.alb.security_group_id
  target_group_arn         = module.alb.api_target_group_arn
  image                    = "${data.aws_ecr_repository.app["api"].repository_url}:${var.image_tag}"
  container_port           = 5000
  desired_count            = var.api_desired_count
  use_spot                 = true
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
  }

  secrets = merge(
    { for k in var.api_secret_keys : k => { arn = module.api_secret.arn, key = k } },
    { REDIS_URL = { arn = module.redis.secret_arn, key = "REDIS_URL" } },
  )

  depends_on = [aws_ecs_cluster_capacity_providers.this]
}

module "web" {
  source = "../../modules/ecs-service"

  name                     = "${local.name}-web"
  cluster_arn              = aws_ecs_cluster.this.arn
  vpc_id                   = module.network.vpc_id
  subnet_ids               = module.network.public_subnet_ids
  alb_security_group_id    = module.alb.security_group_id
  target_group_arn         = module.alb.web_target_group_arn
  image                    = "${data.aws_ecr_repository.app["web"].repository_url}:${var.image_tag}"
  container_port           = 3000
  desired_count            = var.web_desired_count
  use_spot                 = true
  permissions_boundary_arn = local.workload_boundary_arn

  depends_on = [aws_ecs_cluster_capacity_providers.this]
}

locals {
  services = {
    api = module.api
    web = module.web
  }
}
