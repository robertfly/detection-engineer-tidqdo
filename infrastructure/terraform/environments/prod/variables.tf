# Production environment variables for AI-Driven Detection Engineering platform
# Version: ~> 1.6

# Environment Configuration
variable "environment" {
  type        = string
  description = "Production environment identifier with strict validation"
  default     = "prod"

  validation {
    condition     = var.environment == "prod"
    error_message = "Environment must be prod in production configuration"
  }
}

# AWS Region Configuration
variable "aws_region" {
  type        = string
  description = "AWS region for production deployment with approved region validation"
  default     = "us-west-2"

  validation {
    condition     = contains(["us-west-2", "us-east-1"], var.aws_region)
    error_message = "Production must be deployed in approved regions (us-west-2, us-east-1)"
  }
}

# Network Configuration
variable "vpc_cidr" {
  type        = string
  description = "Production VPC CIDR block with appropriate network space"
  default     = "10.0.0.0/16"

  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block"
  }
}

# EKS Configuration
variable "eks_cluster_version" {
  type        = string
  description = "EKS cluster version for production with minimum version requirement"
  default     = "1.27"

  validation {
    condition     = can(regex("^1\\.(2[7-9]|[3-9][0-9])$", var.eks_cluster_version))
    error_message = "Production EKS cluster version must be 1.27 or higher"
  }
}

variable "eks_node_instance_types" {
  type        = list(string)
  description = "Production EKS node instance types with high availability requirement"
  default     = ["t3.xlarge", "m5.xlarge"]

  validation {
    condition     = length(var.eks_node_instance_types) >= 2
    error_message = "Production requires at least two instance types for high availability"
  }
}

# Database Configuration
variable "rds_instance_class" {
  type        = string
  description = "Production RDS instance class with performance tier validation"
  default     = "db.r5.large"

  validation {
    condition     = can(regex("^db\\.(r5|r6|t3)\\..*", var.rds_instance_class))
    error_message = "Production RDS must use r5, r6, or t3 instance classes"
  }
}

variable "documentdb_instance_class" {
  type        = string
  description = "Production DocumentDB instance class with performance tier validation"
  default     = "db.r5.large"

  validation {
    condition     = can(regex("^db\\.r[56]\\..*", var.documentdb_instance_class))
    error_message = "Production DocumentDB must use r5 or r6 instance classes"
  }
}

variable "elasticache_node_type" {
  type        = string
  description = "Production ElastiCache node type with performance tier validation"
  default     = "cache.r5.large"

  validation {
    condition     = can(regex("^cache\\.r[56]\\..*", var.elasticache_node_type))
    error_message = "Production ElastiCache must use r5 or r6 node types"
  }
}