# Terraform AWS RDS Module Variables
# Version: ~> 1.6

# Environment configuration
variable "environment" {
  type        = string
  description = "Deployment environment (prod/staging)"
  
  validation {
    condition     = contains(["prod", "staging"], var.environment)
    error_message = "Environment must be either prod or staging"
  }
}

# Database engine configuration
variable "engine_version" {
  type        = string
  description = "PostgreSQL engine version"
  default     = "15.0"
  
  validation {
    condition     = can(regex("^15\\.[0-9]+$", var.engine_version))
    error_message = "PostgreSQL version must be 15.x as specified in requirements"
  }
}

# Instance configuration
variable "instance_class" {
  type        = string
  description = "RDS instance class"
  default     = "db.t3.large"
}

# Storage configuration
variable "allocated_storage" {
  type        = number
  description = "Initial storage allocation in GB"
  default     = 100
  
  validation {
    condition     = var.allocated_storage >= 100 && var.allocated_storage <= 65536
    error_message = "Allocated storage must be between 100 GB and 65536 GB"
  }
}

variable "max_allocated_storage" {
  type        = number
  description = "Maximum storage allocation in GB for autoscaling"
  default     = 500
  
  validation {
    condition     = var.max_allocated_storage >= 100 && var.max_allocated_storage <= 65536
    error_message = "Maximum allocated storage must be between 100 GB and 65536 GB"
  }
}

# Database configuration
variable "database_name" {
  type        = string
  description = "Name of the default database to create"
  default     = "detection_platform"
  
  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9_]*$", var.database_name))
    error_message = "Database name must start with a letter and contain only alphanumeric characters and underscores"
  }
}

# High availability configuration
variable "multi_az" {
  type        = bool
  description = "Enable Multi-AZ deployment for high availability"
  default     = true
}

# Backup configuration
variable "backup_retention_period" {
  type        = number
  description = "Number of days to retain automated backups"
  default     = 7
  
  validation {
    condition     = var.backup_retention_period >= 7 && var.backup_retention_period <= 35
    error_message = "Backup retention period must be between 7 and 35 days"
  }
}

# Security configuration
variable "deletion_protection" {
  type        = bool
  description = "Enable deletion protection"
  default     = true
}

# Monitoring configuration
variable "performance_insights_enabled" {
  type        = bool
  description = "Enable Performance Insights for monitoring"
  default     = true
}

# Network configuration
variable "vpc_id" {
  type        = string
  description = "VPC ID where RDS will be deployed"
  
  validation {
    condition     = can(regex("^vpc-[a-z0-9]+$", var.vpc_id))
    error_message = "VPC ID must be a valid AWS VPC ID format"
  }
}

variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR block for security group rules"
  
  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid CIDR block"
  }
}

variable "private_subnet_ids" {
  type        = list(string)
  description = "List of private subnet IDs for RDS deployment"
  
  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "At least two private subnets are required for high availability"
  }
}

# Resource tagging
variable "tags" {
  type        = map(string)
  description = "Tags to apply to RDS resources"
  default = {
    Project    = "AI Detection Platform"
    ManagedBy  = "Terraform"
  }
}