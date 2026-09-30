mock_provider "aws" {
  mock_data "aws_route53_zone" {
    defaults = { zone_id = "Z0000000000TEST" }
  }

  mock_data "aws_vpc" {
    defaults = { cidr_block = "10.20.0.0/16" }
  }

  mock_resource "aws_lb" {
    defaults = {
      arn      = "arn:aws:elasticloadbalancing:ap-south-1:123456789012:loadbalancer/app/t/0123456789abcdef"
      dns_name = "t-123.ap-south-1.elb.amazonaws.com"
      zone_id  = "ZP97RAFLXTNZK"
    }
  }

  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:ap-south-1:123456789012:targetgroup/t/0123456789abcdef" }
  }

  mock_resource "aws_lb_listener" {
    defaults = { arn = "arn:aws:elasticloadbalancing:ap-south-1:123456789012:listener/app/t/0123456789abcdef/0123456789abcdef" }
  }

  mock_data "aws_ec2_managed_prefix_list" {
    defaults = { id = "pl-3b927c52" }
  }

  mock_resource "aws_acm_certificate" {
    defaults = {
      arn = "arn:aws:acm:ap-south-1:123456789012:certificate/mock"
      domain_validation_options = [{
        domain_name           = "staging.example.com"
        resource_record_name  = "_x.staging.example.com."
        resource_record_type  = "CNAME"
        resource_record_value = "_y.acm-validations.aws."
      }]
    }
  }
}

variables {
  name        = "job-platform-staging"
  vpc_id      = "vpc-0123456789abcdef0"
  subnet_ids  = ["subnet-a", "subnet-b"]
  zone_name   = "example.com"
  domain_name = "staging.example.com"
}

run "routing" {
  command = apply

  assert {
    condition     = toset(one(one(aws_lb_listener_rule.api.condition).path_pattern).values) == toset(["/api/*", "/socket.io/*"])
    error_message = "/api/* and /socket.io/* must route to the api target group."
  }

  assert {
    condition     = one(aws_lb_listener_rule.api.action).target_group_arn == aws_lb_target_group.api.arn
    error_message = "The path rule must forward to the api target group."
  }

  assert {
    condition     = one(aws_lb_listener.https[0].default_action).target_group_arn == aws_lb_target_group.web.arn
    error_message = "Everything else must go to web."
  }

  assert {
    condition     = one(aws_lb_listener.http.default_action).type == "redirect"
    error_message = "Port 80 must only redirect to HTTPS."
  }

  assert {
    condition     = one(aws_lb_target_group.api.stickiness).enabled && one(aws_lb_target_group.api.stickiness).type == "lb_cookie"
    error_message = "api target group needs sticky sessions for Socket.IO polling."
  }

  assert {
    condition     = one(aws_lb_target_group.api.health_check).path == "/api/health/ready"
    error_message = "api health check must hit /api/health/ready."
  }

  assert {
    condition     = aws_lb.this.drop_invalid_header_fields
    error_message = "Invalid header fields must be dropped."
  }

  assert {
    condition     = aws_route53_record.validation["staging.example.com"].name == "_x.staging.example.com."
    error_message = "ACM validation record must come from the certificate's validation options."
  }
}

run "cloudfront_mode" {
  command = apply

  variables {
    zone_name            = null
    domain_name          = null
    origin_verify_secret = "s3cret-header-value"
  }

  assert {
    condition     = length(aws_acm_certificate.this) == 0 && length(aws_route53_record.alias) == 0 && length(aws_lb_listener.https) == 0
    error_message = "No certificate, DNS record or HTTPS listener without a domain."
  }

  assert {
    condition     = length(aws_vpc_security_group_ingress_rule.alb) == 0 && aws_vpc_security_group_ingress_rule.cloudfront[0].prefix_list_id == "pl-3b927c52"
    error_message = "Without a domain, only CloudFront's prefix list may reach the ALB (no 0.0.0.0/0)."
  }

  assert {
    condition     = one(aws_lb_listener.http.default_action).type == "fixed-response" && one(one(aws_lb_listener.http.default_action).fixed_response).status_code == "403"
    error_message = "Requests without the secret header must get a 403."
  }

  assert {
    condition = alltrue([
      for r in [aws_lb_listener_rule.api, aws_lb_listener_rule.web[0]] :
      anytrue([for c in r.condition : length(c.http_header) > 0 && one(c.http_header).values == toset(["s3cret-header-value"])])
    ])
    error_message = "Both forwarding rules must require the secret origin header."
  }

  assert {
    condition     = aws_lb_listener_rule.api.listener_arn == aws_lb_listener.http.arn
    error_message = "App traffic comes in on the HTTP listener from CloudFront."
  }

  assert {
    condition     = one(aws_lb_target_group.api.stickiness).enabled
    error_message = "Sticky sessions still needed behind CloudFront."
  }
}
