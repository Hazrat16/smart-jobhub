mock_provider "aws" {}

variables {
  name                 = "job-platform-staging"
  alb_dns_name         = "job-platform-staging-123.ap-south-1.elb.amazonaws.com"
  origin_verify_secret = "s3cret-header-value"
}

run "distribution" {
  command = apply

  assert {
    condition     = one(one(aws_cloudfront_distribution.this.origin).custom_header).value == "s3cret-header-value"
    error_message = "Every origin request must carry the secret header the ALB checks."
  }

  assert {
    condition     = one(one(aws_cloudfront_distribution.this.origin).custom_origin_config).origin_protocol_policy == "http-only"
    error_message = "The ALB has no certificate without a domain, so the origin is HTTP."
  }

  assert {
    condition     = one(aws_cloudfront_distribution.this.default_cache_behavior).viewer_protocol_policy == "redirect-to-https"
    error_message = "Browsers must always use HTTPS."
  }

  assert {
    condition     = one(aws_cloudfront_distribution.this.default_cache_behavior).cache_policy_id == "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    error_message = "API and pages must not be cached (CachingDisabled)."
  }

  assert {
    condition     = one(aws_cloudfront_distribution.this.default_cache_behavior).origin_request_policy_id == "216adef6-5c7f-47e4-b989-5492eafa07d3"
    error_message = "All headers and cookies must reach the app (AllViewer): auth, stickiness, WebSockets."
  }

  assert {
    condition     = contains(one(aws_cloudfront_distribution.this.default_cache_behavior).allowed_methods, "POST")
    error_message = "The API needs POST/PUT/PATCH/DELETE."
  }

  assert {
    condition     = one(aws_cloudfront_distribution.this.ordered_cache_behavior).path_pattern == "/_next/static/*"
    error_message = "Only Next.js's hashed static files are cached."
  }

  assert {
    condition     = alltrue([for e in aws_cloudfront_distribution.this.custom_error_response : e.error_caching_min_ttl == 0])
    error_message = "Errors must not be cached."
  }
}
