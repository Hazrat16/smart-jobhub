output "security_group_id" {
  description = "ALB security group; task security groups allow ingress only from it."
  value       = aws_security_group.alb.id
}

output "api_target_group_arn" {
  description = "Target group for the api service."
  value       = aws_lb_target_group.api.arn
}

output "web_target_group_arn" {
  description = "Target group for the web service."
  value       = aws_lb_target_group.web.arn
}

output "listener_arn" {
  description = "Listener that carries app traffic (HTTPS with a domain, HTTP from CloudFront without)."
  value       = local.app_listener_arn
}

output "arn_suffix" {
  description = "ALB ARN suffix, for CloudWatch metrics."
  value       = aws_lb.this.arn_suffix
}

output "dns_name" {
  description = "ALB DNS name."
  value       = aws_lb.this.dns_name
}

output "url" {
  description = "Public URL with a domain; null in CloudFront mode (the CloudFront URL is public then)."
  value       = local.use_domain ? "https://${var.domain_name}" : null
}

output "api_target_group_arn_suffix" {
  description = "api target group ARN suffix, for CloudWatch metrics."
  value       = aws_lb_target_group.api.arn_suffix
}

output "web_target_group_arn_suffix" {
  description = "web target group ARN suffix, for CloudWatch metrics."
  value       = aws_lb_target_group.web.arn_suffix
}
