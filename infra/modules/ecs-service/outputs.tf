output "service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.this.name
}

output "task_definition_family" {
  description = "Task definition family; CD registers new revisions in it."
  value       = aws_ecs_task_definition.this.family
}

output "execution_role_arn" {
  description = "Execution role; CD needs iam:PassRole on it."
  value       = aws_iam_role.execution.arn
}

output "task_role_arn" {
  description = "Task role; CD needs iam:PassRole on it."
  value       = aws_iam_role.task.arn
}

output "log_group_name" {
  description = "CloudWatch log group."
  value       = aws_cloudwatch_log_group.this.name
}

output "security_group_id" {
  description = "Task security group."
  value       = aws_security_group.task.id
}

output "task_definition_arn_without_revision" {
  description = "Family ARN without a revision: RunTask then uses the latest ACTIVE revision (the deployed one)."
  value       = aws_ecs_task_definition.this.arn_without_revision
}
