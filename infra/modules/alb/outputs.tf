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

output "https_listener_arn" {
  description = "HTTPS listener ARN."
  value       = aws_lb_listener.https.arn
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
  description = "Public URL of the environment."
  value       = "https://${var.domain_name}"
}
