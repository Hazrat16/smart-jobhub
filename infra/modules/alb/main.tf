# Two modes:
#   - With a domain (zone_name + domain_name): ACM certificate, HTTPS on the ALB,
#     HTTP → HTTPS redirect, Route 53 alias. The ALB is the public entry point.
#   - Without a domain: CloudFront (modules/cdn) is the public entry point with its
#     own *.cloudfront.net certificate. The ALB accepts HTTP only from CloudFront's
#     IP ranges, and only with the secret origin header; anything else gets a 403.

locals {
  use_domain = var.domain_name != null
}

data "aws_route53_zone" "this" {
  count = local.use_domain ? 1 : 0

  name         = var.zone_name
  private_zone = false
}

# ---------------------------------------------------------------------------
# TLS certificate (DNS-validated in the same zone). Domain mode only.
# ---------------------------------------------------------------------------

resource "aws_acm_certificate" "this" {
  count = local.use_domain ? 1 : 0

  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# Single-name certificate, so exactly one validation record. Its key is static
# (the domain name) so the plan never depends on apply-time certificate values.
resource "aws_route53_record" "validation" {
  for_each = local.use_domain ? toset([var.domain_name]) : toset([])

  zone_id         = data.aws_route53_zone.this[0].zone_id
  name            = one([for o in aws_acm_certificate.this[0].domain_validation_options : o.resource_record_name if o.domain_name == each.key])
  type            = one([for o in aws_acm_certificate.this[0].domain_validation_options : o.resource_record_type if o.domain_name == each.key])
  records         = [one([for o in aws_acm_certificate.this[0].domain_validation_options : o.resource_record_value if o.domain_name == each.key])]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "this" {
  count = local.use_domain ? 1 : 0

  certificate_arn         = aws_acm_certificate.this[0].arn
  validation_record_fqdns = [for r in aws_route53_record.validation : r.fqdn]
}

# ---------------------------------------------------------------------------
# Load balancer
# ---------------------------------------------------------------------------

resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = local.use_domain ? "Public HTTP/HTTPS to the ALB" : "HTTP from CloudFront only"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.name}-alb" }
}

resource "aws_vpc_security_group_ingress_rule" "alb" {
  # checkov:skip=CKV_AWS_260:Port 80 is open only to redirect to HTTPS.
  for_each = local.use_domain ? toset(["80", "443"]) : toset([])

  security_group_id = aws_security_group.alb.id
  description       = "Public port ${each.key}"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = tonumber(each.key)
  to_port           = tonumber(each.key)
}

data "aws_ec2_managed_prefix_list" "cloudfront" {
  count = local.use_domain ? 0 : 1

  name = "com.amazonaws.global.cloudfront.origin-facing"
}

resource "aws_vpc_security_group_ingress_rule" "cloudfront" {
  # checkov:skip=CKV_AWS_260:Source is CloudFront's origin-facing prefix list, not 0.0.0.0/0 (asserted in tests/alb.tftest.hcl).
  count = local.use_domain ? 0 : 1

  security_group_id = aws_security_group.alb.id
  description       = "HTTP from CloudFront edge servers only"
  prefix_list_id    = data.aws_ec2_managed_prefix_list.cloudfront[0].id
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_egress_rule" "alb_to_tasks" {
  for_each = toset([tostring(var.api_port), tostring(var.web_port)])

  security_group_id = aws_security_group.alb.id
  description       = "To tasks on port ${each.key}"
  cidr_ipv4         = data.aws_vpc.this.cidr_block
  ip_protocol       = "tcp"
  from_port         = tonumber(each.key)
  to_port           = tonumber(each.key)
}

data "aws_vpc" "this" {
  id = var.vpc_id
}

resource "aws_lb" "this" {
  # checkov:skip=CKV_AWS_91:ALB access logs need an S3 bucket and cost; CloudWatch ALB metrics cover step 8.
  # checkov:skip=CKV_AWS_150:Deletion protection is var.deletion_protection: off in staging, on in prod.
  # checkov:skip=CKV2_AWS_28:WAF (~$6+/month) is outside the cost target; revisit before real traffic.
  name                       = var.name
  load_balancer_type         = "application"
  internal                   = false
  security_groups            = [aws_security_group.alb.id]
  subnets                    = var.subnet_ids
  idle_timeout               = var.idle_timeout
  drop_invalid_header_fields = true
  enable_deletion_protection = var.deletion_protection

  lifecycle {
    precondition {
      condition     = (var.domain_name == null) == (var.zone_name == null)
      error_message = "Set both zone_name and domain_name, or neither (CloudFront mode)."
    }
    precondition {
      condition     = local.use_domain || var.origin_verify_secret != null
      error_message = "Without a domain, origin_verify_secret is required (CloudFront mode)."
    }
  }
}

resource "aws_lb_target_group" "api" {
  # checkov:skip=CKV_AWS_378:TLS terminates at the ALB; the hop to the task stays inside the VPC.
  name                 = "${var.name}-api"
  port                 = var.api_port
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 30

  health_check {
    path                = var.api_health_check_path
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  # Socket.IO's polling transport needs every request of a session on the same
  # task; the Redis adapter fans events out between tasks.
  stickiness {
    type            = "lb_cookie"
    enabled         = true
    cookie_duration = 86400
  }
}

resource "aws_lb_target_group" "web" {
  # checkov:skip=CKV_AWS_378:TLS terminates at the ALB; the hop to the task stays inside the VPC.
  name                 = "${var.name}-web"
  port                 = var.web_port
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = var.vpc_id
  deregistration_delay = 30

  health_check {
    path                = "/"
    matcher             = "200"
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

# Port 80: domain mode redirects to HTTPS. CloudFront mode refuses anything
# without the secret origin header; the rules below forward the rest.
resource "aws_lb_listener" "http" {
  # checkov:skip=CKV_AWS_2:CloudFront mode: TLS ends at CloudFront, and only CloudFront (IP ranges + secret header) can reach this listener.
  # checkov:skip=CKV_AWS_103:As above; domain mode only redirects on this port.
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = local.use_domain ? "redirect" : "fixed-response"

    dynamic "redirect" {
      for_each = local.use_domain ? [1] : []
      content {
        port        = "443"
        protocol    = "HTTPS"
        status_code = "HTTP_301"
      }
    }

    dynamic "fixed_response" {
      for_each = local.use_domain ? [] : [1]
      content {
        content_type = "text/plain"
        message_body = "Forbidden"
        status_code  = "403"
      }
    }
  }
}

resource "aws_lb_listener" "https" {
  count = local.use_domain ? 1 : 0

  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.this[0].certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

locals {
  # The listener that carries app traffic in each mode.
  app_listener_arn = local.use_domain ? aws_lb_listener.https[0].arn : aws_lb_listener.http.arn
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = local.app_listener_arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern {
      values = ["/api/*", "/socket.io/*"]
    }
  }

  dynamic "condition" {
    for_each = local.use_domain ? [] : [1]
    content {
      http_header {
        http_header_name = var.origin_verify_header
        values           = [var.origin_verify_secret]
      }
    }
  }
}

# CloudFront mode: the default action is 403, so web needs its own rule.
resource "aws_lb_listener_rule" "web" {
  count = local.use_domain ? 0 : 1

  listener_arn = aws_lb_listener.http.arn
  priority     = 20

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }

  condition {
    http_header {
      http_header_name = var.origin_verify_header
      values           = [var.origin_verify_secret]
    }
  }
}

resource "aws_route53_record" "alias" {
  count = local.use_domain ? 1 : 0

  zone_id = data.aws_route53_zone.this[0].zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}
