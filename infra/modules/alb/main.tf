data "aws_route53_zone" "this" {
  name         = var.zone_name
  private_zone = false
}

# ---------------------------------------------------------------------------
# TLS certificate (DNS-validated in the same zone)
# ---------------------------------------------------------------------------

resource "aws_acm_certificate" "this" {
  domain_name       = var.domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

# Single-name certificate, so exactly one validation record. Its key is static
# (the domain name) so the plan never depends on apply-time certificate values.
resource "aws_route53_record" "validation" {
  for_each = toset([var.domain_name])

  zone_id         = data.aws_route53_zone.this.zone_id
  name            = one([for o in aws_acm_certificate.this.domain_validation_options : o.resource_record_name if o.domain_name == each.key])
  type            = one([for o in aws_acm_certificate.this.domain_validation_options : o.resource_record_type if o.domain_name == each.key])
  records         = [one([for o in aws_acm_certificate.this.domain_validation_options : o.resource_record_value if o.domain_name == each.key])]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "this" {
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = [for r in aws_route53_record.validation : r.fqdn]
}

# ---------------------------------------------------------------------------
# Load balancer
# ---------------------------------------------------------------------------

resource "aws_security_group" "alb" {
  name        = "${var.name}-alb"
  description = "Public HTTP/HTTPS to the ALB"
  vpc_id      = var.vpc_id

  tags = { Name = "${var.name}-alb" }
}

resource "aws_vpc_security_group_ingress_rule" "alb" {
  # checkov:skip=CKV_AWS_260:Port 80 is open only to redirect to HTTPS.
  for_each = toset(["80", "443"])

  security_group_id = aws_security_group.alb.id
  description       = "Public port ${each.key}"
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "tcp"
  from_port         = tonumber(each.key)
  to_port           = tonumber(each.key)
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

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.this.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.web.arn
  }
}

resource "aws_lb_listener_rule" "api" {
  listener_arn = aws_lb_listener.https.arn
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
}

resource "aws_route53_record" "alias" {
  zone_id = data.aws_route53_zone.this.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}
