# Public HTTPS entry point when there's no domain: https://<id>.cloudfront.net
# with CloudFront's own certificate. Everything is passed through uncached
# (API, pages, cookies, Socket.IO/WebSockets) except Next.js's hashed static
# files, which never change.

locals {
  origin_id = "alb"

  # AWS managed policies (fixed IDs, the same in every account).
  caching_disabled  = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  caching_optimized = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  all_viewer        = "216adef6-5c7f-47e4-b989-5492eafa07d3" # Managed-AllViewer (all headers, cookies, query strings)
}

resource "aws_cloudfront_distribution" "this" {
  # checkov:skip=CKV_AWS_68:WAF (~$6+/month) is outside the cost target; revisit before real traffic.
  # checkov:skip=CKV_AWS_86:Access logs need an S3 bucket and cost; ALB metrics and app logs cover it.
  # checkov:skip=CKV_AWS_174:The default *.cloudfront.net certificate can't set a minimum TLS version; add a domain + ACM cert to pin TLS 1.2.
  # checkov:skip=CKV_AWS_310:A single ALB origin; there's nothing to fail over to.
  # checkov:skip=CKV_AWS_374:Users are in Bangladesh and abroad; no geo restriction wanted.
  # checkov:skip=CKV2_AWS_32:The app sets its own security headers (helmet).
  # checkov:skip=CKV2_AWS_42:No domain yet, so no custom certificate (that's what this mode is for).
  # checkov:skip=CKV2_AWS_47:WAF not used (see CKV_AWS_68).
  # checkov:skip=CKV_AWS_305:Not an S3 site: Next.js serves "/" itself.
  comment         = var.name
  enabled         = true
  is_ipv6_enabled = true
  http_version    = "http2and3"
  price_class     = var.price_class

  origin {
    origin_id   = local.origin_id
    domain_name = var.alb_dns_name

    custom_origin_config {
      http_port                = 80
      https_port               = 443
      origin_protocol_policy   = "http-only" # the ALB has no certificate without a domain
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 60
    }

    custom_header {
      name  = var.origin_verify_header
      value = var.origin_verify_secret
    }
  }

  default_cache_behavior {
    target_origin_id         = local.origin_id
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = local.caching_disabled
    origin_request_policy_id = local.all_viewer
    compress                 = true
  }

  # Content-hashed build files: safe to cache at the edge for as long as CloudFront likes.
  ordered_cache_behavior {
    path_pattern           = "/_next/static/*"
    target_origin_id       = local.origin_id
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = local.caching_optimized
    compress               = true
  }

  # Don't let CloudFront remember an error (e.g. mid-deploy) for its default 10 seconds.
  dynamic "custom_error_response" {
    for_each = [500, 502, 503, 504]
    content {
      error_code            = custom_error_response.value
      error_caching_min_ttl = 0
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    cloudfront_default_certificate = true
  }
}
