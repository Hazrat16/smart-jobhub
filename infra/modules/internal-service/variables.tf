variable "name" {
  description = "Service name, e.g. job-platform-staging-loki. Also the task definition family."
  type        = string
}

variable "cluster_arn" {
  description = "ECS cluster ARN."
  type        = string
}

variable "vpc_id" {
  description = "VPC ID."
  type        = string
}

variable "subnet_ids" {
  description = "Subnets for the tasks (public, with a public IP: no NAT)."
  type        = list(string)
}

variable "image" {
  description = "Container image, pinned to a version."
  type        = string
}

variable "command" {
  description = "Container command (arguments to the image's entrypoint)."
  type        = list(string)
  default     = []
}

variable "container_port" {
  description = "Port the container listens on. Ingress to it is added by the caller."
  type        = number
}

variable "cpu" {
  description = "Task CPU units."
  type        = number
  default     = 256
}

variable "memory" {
  description = "Task memory (MiB)."
  type        = number
  default     = 512
}

variable "use_spot" {
  description = "Run on FARGATE_SPOT."
  type        = bool
  default     = false
}

variable "environment" {
  description = "Plain environment variables."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = "Env var name => { arn, key } of a JSON secret."
  type        = map(object({ arn = string, key = string }))
  default     = {}
}

variable "config" {
  description = <<-EOT
    Config files synced from S3 into the task before the app starts: an init
    container copies s3://<bucket>/<prefix>/ to a shared volume, mounted
    read-only in the app container at mount_path. `hash` changes the task
    definition when a file changes, so the service redeploys with the new files.
  EOT
  type = object({
    bucket     = string
    bucket_arn = string
    prefix     = string
    mount_path = string
    hash       = string
  })
}

variable "efs" {
  description = "Optional EFS access point mounted read-write at container_path (persistent data)."
  type = object({
    file_system_id  = string
    file_system_arn = string
    access_point_id = string
    container_path  = string
  })
  default = null
}

variable "service_registry_arn" {
  description = "Cloud Map service the tasks register in (A records), so others can reach them by name."
  type        = string
  default     = null
}

variable "enable_execute_command" {
  description = "Allow ECS Exec / SSM sessions into the task (used for port forwarding)."
  type        = bool
  default     = false
}

variable "single_instance" {
  description = "Never run two tasks at once during a deploy (for apps that lock their data directory)."
  type        = bool
  default     = false
}

variable "task_policies" {
  description = "Extra inline policies for the task role: name => policy JSON. A map, so the names are known at plan time even when the JSON isn't."
  type        = map(string)
  default     = {}
}

variable "log_retention_days" {
  description = "CloudWatch log retention."
  type        = number
  default     = 14
}

variable "permissions_boundary_arn" {
  description = "Permissions boundary for the roles (required by the infra deployer)."
  type        = string
}

variable "iam_path" {
  description = "IAM path for the roles."
  type        = string
  default     = "/job-platform/"
}

variable "config_sync_image" {
  description = "Image of the init container that copies the config from S3."
  type        = string
  default     = "public.ecr.aws/aws-cli/aws-cli:2.31.0"
}
