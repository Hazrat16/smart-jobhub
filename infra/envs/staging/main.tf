# Staging: cheap and disposable. Spot tasks, fixed size, short log retention.
module "env" {
  source = "../../modules/environment"

  environment = "staging"
  vpc_cidr    = "10.20.0.0/16"
  zone_name   = var.zone_name
  domain_name = var.domain_name

  use_spot = true
  api      = { cpu = 256, memory = 512, min_count = var.api_desired_count, max_count = var.api_desired_count }
  web      = { cpu = 256, memory = 512, min_count = var.web_desired_count, max_count = var.web_desired_count }

  sslcommerz_sandbox  = true
  deletion_protection = false
  log_retention_days  = 14
}

# The stack used to be written inline here; these keep an already-applied
# staging in place instead of destroying and recreating it.
moved {
  from = module.network
  to   = module.env.module.network
}

moved {
  from = module.alb
  to   = module.env.module.alb
}

moved {
  from = module.api_secret
  to   = module.env.module.api_secret
}

moved {
  from = module.redis
  to   = module.env.module.redis
}

moved {
  from = aws_ecs_cluster.this
  to   = module.env.aws_ecs_cluster.this
}

moved {
  from = aws_ecs_cluster_capacity_providers.this
  to   = module.env.aws_ecs_cluster_capacity_providers.this
}

moved {
  from = module.api
  to   = module.env.module.api
}

moved {
  from = module.web
  to   = module.env.module.web
}
