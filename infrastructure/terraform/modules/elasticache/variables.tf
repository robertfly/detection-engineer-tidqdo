# Core Terraform functionality for variable definitions and validation rules
terraform {
  # Version constraint specified in imports
  required_version = "~> 1.6"
}

# Environment identifier for resource naming and tagging
# Must be one of: dev, staging, prod
variable "environment" {
  description = "Environment identifier for resource naming and tagging (dev/staging/prod)"
  type        = string
  
  validation {
    condition     = can(regex("^(dev|staging|prod)$", var.environment))
    error_message = "Environment must be one of: dev, staging, prod"
  }
}

# VPC ID where Redis cluster will be deployed
variable "vpc_id" {
  description = "ID of the VPC where Redis cluster will be deployed"
  type        = string
  
  validation {
    condition     = can(regex("^vpc-", var.vpc_id))
    error_message = "VPC ID must be valid format starting with 'vpc-'"
  }
}

# Private subnet IDs for high availability deployment
variable "private_subnet_ids" {
  description = "List of private subnet IDs for Redis cluster deployment (minimum 2 for HA)"
  type        = list(string)
  
  validation {
    condition     = length(var.private_subnet_ids) >= 2
    error_message = "At least two private subnets are required for high availability"
  }
}

# CIDR blocks for network security
variable "allowed_cidr_blocks" {
  description = "List of CIDR blocks allowed to access the Redis cluster"
  type        = list(string)
  
  validation {
    condition     = alltrue([for cidr in var.allowed_cidr_blocks : can(cidrhost(cidr, 0))])
    error_message = "All CIDR blocks must be valid IPv4 CIDR notation"
  }
}

# ElastiCache node type configuration
variable "node_type" {
  description = "ElastiCache node type for Redis cluster (e.g., cache.t4g.medium)"
  type        = string
  default     = "cache.t4g.medium"
  
  validation {
    condition     = can(regex("^cache\\.[a-z0-9]+\\.[a-z0-9]+$", var.node_type))
    error_message = "Node type must be valid ElastiCache instance type format"
  }
}

# Number of cache clusters for high availability
variable "num_cache_clusters" {
  description = "Number of cache clusters in the Redis replication group (minimum 2 for HA)"
  type        = number
  default     = 2
  
  validation {
    condition     = var.num_cache_clusters >= 2
    error_message = "At least two cache clusters are required for high availability"
  }
}