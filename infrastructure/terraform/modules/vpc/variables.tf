# VPC CIDR block configuration
variable "vpc_cidr" {
  description = "CIDR block for the VPC with validation for valid CIDR notation"
  type        = string
  default     = "10.0.0.0/16"

  validation {
    condition     = can(regex("^([0-9]{1,3}\\.){3}[0-9]{1,3}/[0-9]{1,2}$", var.vpc_cidr))
    error_message = "VPC CIDR must be a valid IPv4 CIDR block"
  }
}

# Environment name configuration
variable "environment" {
  description = "Environment name for resource tagging and configuration management"
  type        = string

  validation {
    condition     = can(regex("^(prod|staging|dev)$", var.environment))
    error_message = "Environment must be one of: prod, staging, dev"
  }
}

# Availability zones configuration
variable "azs" {
  description = "List of availability zones for high availability deployment"
  type        = list(string)

  validation {
    condition     = length(var.azs) >= 2
    error_message = "At least 2 availability zones are required for high availability"
  }
}

# Private subnet configuration
variable "private_subnet_cidrs" {
  description = "List of CIDR blocks for private subnets with validation"
  type        = list(string)

  validation {
    condition     = length(var.private_subnet_cidrs) == length(var.azs)
    error_message = "Number of private subnet CIDRs must match number of AZs"
  }
}

# Public subnet configuration
variable "public_subnet_cidrs" {
  description = "List of CIDR blocks for public subnets with validation"
  type        = list(string)

  validation {
    condition     = length(var.public_subnet_cidrs) == length(var.azs)
    error_message = "Number of public subnet CIDRs must match number of AZs"
  }
}

# NAT Gateway configuration
variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for secure private subnet internet access"
  type        = bool
  default     = true
}

# Single NAT Gateway option
variable "single_nat_gateway" {
  description = "Use single NAT Gateway for cost optimization with availability trade-off"
  type        = bool
  default     = false
}

# Resource tagging configuration
variable "tags" {
  description = "Additional tags for VPC resources including required platform tags"
  type        = map(string)
  default = {
    Platform   = "detection-engineering"
    ManagedBy  = "terraform"
  }
}