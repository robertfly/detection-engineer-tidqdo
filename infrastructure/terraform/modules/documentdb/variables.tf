# Core Terraform configuration requiring version 1.6 or higher
terraform {
  required_version = "~> 1.6"
}

# Cluster Configuration
variable "cluster_name" {
  type        = string
  description = "Name of the DocumentDB cluster. Must be unique within the AWS account and region."
  validation {
    condition     = can(regex("^[a-zA-Z0-9-]+$", var.cluster_name))
    error_message = "Cluster name must contain only alphanumeric characters and hyphens"
  }
}

variable "instance_class" {
  type        = string
  description = "Instance class for DocumentDB nodes. Affects compute, memory, and network performance. Consider cost implications of larger instances."
  default     = "db.r6g.large"
  validation {
    condition     = contains(["db.r6g.large", "db.r6g.xlarge", "db.r6g.2xlarge", "db.r6g.4xlarge"], var.instance_class)
    error_message = "Instance class must be one of the supported R6g instance types for production use"
  }
}

variable "instance_count" {
  type        = number
  description = "Number of instances in the DocumentDB cluster. Minimum of 3 required for high availability across availability zones."
  default     = 3
  validation {
    condition     = var.instance_count >= 3
    error_message = "At least 3 instances required for high availability"
  }
}

variable "engine_version" {
  type        = string
  description = "DocumentDB engine version. Must be compatible with enterprise requirements."
  default     = "6.0"
  validation {
    condition     = contains(["5.0", "6.0"], var.engine_version)
    error_message = "Engine version must be either 5.0 or 6.0"
  }
}

# Backup and Recovery
variable "backup_retention_period" {
  type        = number
  description = "Number of days to retain automated backups. Enterprise compliance requires minimum 7 days."
  default     = 7
  validation {
    condition     = var.backup_retention_period >= 7 && var.backup_retention_period <= 35
    error_message = "Backup retention period must be between 7 and 35 days for enterprise compliance"
  }
}

# Networking
variable "vpc_id" {
  type        = string
  description = "VPC ID for DocumentDB deployment. Must be configured with appropriate security groups and network ACLs."
}

variable "subnet_ids" {
  type        = list(string)
  description = "List of subnet IDs for DocumentDB cluster. Must span multiple AZs for high availability."
  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "At least 2 subnets required for high availability"
  }
}

# Security and Encryption
variable "encryption_enabled" {
  type        = bool
  description = "Enable encryption at rest using AWS KMS. Required for enterprise security compliance."
  default     = true
  validation {
    condition     = var.encryption_enabled == true
    error_message = "Encryption must be enabled for enterprise security compliance"
  }
}

variable "kms_key_id" {
  type        = string
  description = "ARN of KMS key for encryption at rest. If not specified, AWS managed key will be used."
  default     = null
}

variable "tls_enabled" {
  type        = bool
  description = "Enable TLS for in-transit encryption. Required for enterprise security compliance."
  default     = true
  validation {
    condition     = var.tls_enabled == true
    error_message = "TLS must be enabled for enterprise security compliance"
  }
}

variable "deletion_protection" {
  type        = bool
  description = "Enable deletion protection to prevent accidental cluster deletion."
  default     = true
}

# Monitoring and Logging
variable "audit_logging_enabled" {
  type        = bool
  description = "Enable audit logging for compliance and security monitoring."
  default     = true
}

variable "preferred_maintenance_window" {
  type        = string
  description = "Preferred maintenance window in UTC (e.g., sun:04:00-sun:05:00)."
  default     = "sun:04:00-sun:05:00"
}

variable "auto_minor_version_upgrade" {
  type        = bool
  description = "Enable automatic minor version upgrades during maintenance window."
  default     = true
}

variable "allowed_cidr_blocks" {
  type        = list(string)
  description = "List of CIDR blocks allowed to access the DocumentDB cluster."
  default     = []
}

variable "enhanced_monitoring_role_arn" {
  type        = string
  description = "ARN for the enhanced monitoring IAM role."
  default     = null
}

variable "cloudwatch_logs_exports" {
  type        = list(string)
  description = "List of log types to export to CloudWatch."
  default     = ["audit", "profiler"]
  validation {
    condition     = alltrue([for log in var.cloudwatch_logs_exports : contains(["audit", "profiler"], log)])
    error_message = "Supported log types are: audit, profiler"
  }
}

# Tagging
variable "tags" {
  type        = map(string)
  description = "Resource tags for DocumentDB cluster including required enterprise tags."
  default     = {}
}