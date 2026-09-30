output "domain_name" {
  description = "The distribution's address, e.g. d1abc234xyz.cloudfront.net."
  value       = aws_cloudfront_distribution.this.domain_name
}

output "distribution_id" {
  description = "Distribution ID (for invalidations and metrics)."
  value       = aws_cloudfront_distribution.this.id
}
