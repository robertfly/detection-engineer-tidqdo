# terraform ~> 1.6
terraform {
  required_version = "~> 1.6"
}

variable "cluster_name" {
  description = "Name of the EKS cluster - must be unique within the AWS region"
  type        = string

  validation {
    condition     = can(regex("^[a-zA-Z][a-zA-Z0-9-]*$", var.cluster_name)) && length(var.cluster_name) <= 100
    error_message = "Cluster name must start with letter, contain only alphanumeric characters and hyphens, and be 100 characters or less"
  }
}

variable "cluster_version" {
  description = "Kubernetes version for the EKS cluster - must be 1.27 or higher per requirements"
  type        = string
  default     = "1.27"

  validation {
    condition     = can(regex("^1\\.(2[7-9]|[3-9][0-9])$", var.cluster_version))
    error_message = "EKS cluster version must be 1.27 or higher per technical requirements"
  }
}

variable "environment" {
  description = "Deployment environment identifier for resource tagging and configuration"
  type        = string

  validation {
    condition     = contains(["prod", "staging"], var.environment)
    error_message = "Environment must be either prod or staging"
  }
}

variable "subnet_ids" {
  description = "List of subnet IDs across multiple AZs for high availability EKS cluster and node group deployment"
  type        = list(string)

  validation {
    condition     = length(var.subnet_ids) >= 2
    error_message = "At least 2 subnet IDs are required for high availability across multiple AZs"
  }
}

variable "node_groups" {
  description = "Comprehensive configuration for EKS managed node groups including auto-scaling, instance types, and node labels/taints"
  type = map(object({
    instance_types = list(string)
    desired_size   = number
    min_size      = number
    max_size      = number
    disk_size     = number
    labels        = map(string)
    taints = list(object({
      key    = string
      value  = string
      effect = string
    }))
    capacity_type = string
  }))

  validation {
    condition     = alltrue([for ng in var.node_groups : ng.min_size <= ng.desired_size && ng.desired_size <= ng.max_size])
    error_message = "Node group sizes must satisfy: min_size <= desired_size <= max_size"
  }
}

variable "cluster_endpoint_private_access" {
  description = "Enable private API server endpoint access for enhanced security"
  type        = bool
  default     = true
}

variable "cluster_endpoint_public_access" {
  description = "Enable public API server endpoint access - defaults to false for security"
  type        = bool
  default     = false
}

variable "cluster_endpoint_public_access_cidrs" {
  description = "List of CIDR blocks allowed to access the public API server endpoint if enabled"
  type        = list(string)
  default     = []

  validation {
    condition     = alltrue([for cidr in var.cluster_endpoint_public_access_cidrs : can(cidrhost(cidr, 0))])
    error_message = "All values must be valid CIDR blocks"
  }
}

variable "enable_cluster_encryption" {
  description = "Enable envelope encryption for cluster secrets using AWS KMS - required for security compliance"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Additional tags for EKS resources including required tags for cost allocation and compliance"
  type        = map(string)
  default = {
    ManagedBy  = "terraform"
    Component  = "eks"
  }
}