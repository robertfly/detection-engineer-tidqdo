# Terraform ~> 1.6

# Environment Identifier
variable "environment" {
  type        = string
  description = "Deployment environment identifier for staging"
  default     = "staging"

  validation {
    condition     = var.environment == "staging"
    error_message = "Environment must be staging in this configuration"
  }
}

# AWS Region
variable "aws_region" {
  type        = string
  description = "AWS region for staging deployment"
  default     = "us-west-2"
}

# Network Configuration
variable "vpc_cidr" {
  type        = string
  description = "CIDR block for staging VPC, isolated from production network space"
  default     = "10.1.0.0/16"
}

# EKS Configuration
variable "eks_cluster_version" {
  type        = string
  description = "Kubernetes version for staging EKS cluster with version constraint"
  default     = "1.27"

  validation {
    condition     = can(regex("^1\\.(2[7-9]|[3-9][0-9])$", var.eks_cluster_version))
    error_message = "EKS cluster version must be 1.27 or higher"
  }
}

variable "eks_node_instance_types" {
  type        = list(string)
  description = "Cost-optimized instance types for staging EKS node groups"
  default     = ["t3.large"]
}

# Database Configuration
variable "rds_instance_class" {
  type        = string
  description = "Right-sized instance class for staging RDS PostgreSQL"
  default     = "db.t3.medium"
}

variable "documentdb_instance_class" {
  type        = string
  description = "Right-sized instance class for staging DocumentDB"
  default     = "db.t3.medium"
}

variable "elasticache_node_type" {
  type        = string
  description = "Right-sized node type for staging ElastiCache Redis"
  default     = "cache.t3.medium"
}

# Resource Tagging
variable "tags" {
  type        = map(string)
  description = "Common tags for staging resources including feature flag indication"
  default = {
    Environment   = "staging"
    Project       = "AI Detection Platform"
    ManagedBy     = "Terraform"
    Feature-Flags = "enabled"
  }
}