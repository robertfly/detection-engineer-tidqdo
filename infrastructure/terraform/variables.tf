# Terraform variables for AI-Driven Detection Engineering platform
# Version: ~> 1.6

# Environment Configuration
variable "environment" {
  type        = string
  description = "Deployment environment (prod/staging) with strict validation"
  
  validation {
    condition     = contains(["prod", "staging"], var.environment)
    error_message = "Environment must be either prod or staging."
  }
}

# AWS Region Configuration
variable "aws_region" {
  type        = string
  description = "AWS region for resource deployment with data sovereignty consideration"
  default     = "us-west-2"
  
  validation {
    condition     = can(regex("^[a-z]{2}-[a-z]+-[1-9][0-9]?$", var.aws_region))
    error_message = "AWS region must be a valid region identifier (e.g., us-west-2)."
  }
}

# Network Configuration
variable "vpc_cidr" {
  type        = string
  description = "CIDR block for VPC following security best practices"
  default     = "10.0.0.0/16"
  
  validation {
    condition     = can(cidrhost(var.vpc_cidr, 0))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block."
  }
}

# EKS Configuration
variable "eks_cluster_version" {
  type        = string
  description = "Kubernetes version for EKS cluster with security requirements"
  default     = "1.27"
  
  validation {
    condition     = can(regex("^1\\.(2[7-9]|[3-9][0-9])$", var.eks_cluster_version))
    error_message = "EKS cluster version must be 1.27 or higher for security compliance."
  }
}

variable "eks_node_instance_types" {
  type        = list(string)
  description = "Instance types for EKS node groups with performance optimization"
  default     = ["t3.large"]
  
  validation {
    condition     = length([for t in var.eks_node_instance_types : t if can(regex("^[a-z][0-9][.][a-z]+$", t))]) == length(var.eks_node_instance_types)
    error_message = "EKS node instance types must be valid AWS instance type identifiers."
  }
}

# Database Configuration
variable "rds_instance_class" {
  type        = string
  description = "Instance class for RDS PostgreSQL with high availability"
  default     = "db.t3.large"
  
  validation {
    condition     = can(regex("^db\\.[a-z0-9]+\\.[a-z]+$", var.rds_instance_class))
    error_message = "RDS instance class must be a valid identifier (e.g., db.t3.large)."
  }
}

variable "documentdb_instance_class" {
  type        = string
  description = "Instance class for DocumentDB with performance requirements"
  default     = "db.t3.medium"
  
  validation {
    condition     = can(regex("^db\\.[a-z0-9]+\\.[a-z]+$", var.documentdb_instance_class))
    error_message = "DocumentDB instance class must be a valid identifier (e.g., db.t3.medium)."
  }
}

variable "elasticache_node_type" {
  type        = string
  description = "Node type for ElastiCache Redis with clustering support"
  default     = "cache.t3.medium"
  
  validation {
    condition     = can(regex("^cache\\.[a-z0-9]+\\.[a-z]+$", var.elasticache_node_type))
    error_message = "ElastiCache node type must be a valid identifier (e.g., cache.t3.medium)."
  }
}

# Project Configuration
variable "project_name" {
  type        = string
  description = "Project name for consistent resource naming"
  default     = "ai-detection-platform"
  
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,28}[a-z0-9]$", var.project_name))
    error_message = "Project name must be between 4-30 characters, start with a letter, and contain only lowercase letters, numbers, and hyphens."
  }
}

# Resource Tagging
variable "tags" {
  type        = map(string)
  description = "Common tags for all resources including cost allocation"
  default = {
    Project     = "AI Detection Platform"
    ManagedBy   = "Terraform"
    Environment = "${var.environment}"
    CostCenter  = "Security-Operations"
    Compliance  = "SOC2"
  }
  
  validation {
    condition     = length(var.tags) >= 3
    error_message = "At least 3 tags must be provided for proper resource management and cost allocation."
  }
}