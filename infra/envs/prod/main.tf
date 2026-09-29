# Production: on-demand tasks, CPU autoscaling, longer logs, deletion protection.
# Applied only from a saved plan after approval (infra.yml, `production` environment).
module "env" {
  source = "../../modules/environment"

  environment  = "prod"
  vpc_cidr     = "10.30.0.0/16"
  zone_name    = var.zone_name
  domain_name  = var.domain_name
  alert_emails = var.alert_emails

  use_spot = false
  api      = { cpu = 256, memory = 512, min_count = var.api_min_count, max_count = 3 }
  web      = { cpu = 256, memory = 512, min_count = var.web_min_count, max_count = 2 }

  sslcommerz_sandbox  = false
  deletion_protection = true
  log_retention_days  = 30
}
