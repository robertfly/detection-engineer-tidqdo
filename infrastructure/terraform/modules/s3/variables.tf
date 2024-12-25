# Terraform AWS S3 Module Variables
# Version: ~> 1.6
# Purpose: Defines input variables for enterprise-grade S3 bucket configuration with 
# versioning, encryption, and cross-region replication capabilities.

variable "bucket_name" {
  type        = string
  description = "Name of the S3 bucket to be created, must comply with AWS S3 naming rules and organization standards"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.bucket_name))
    error_message = "Bucket name must be between 3 and 63 characters, start and end with a letter or number, and contain only lowercase letters, numbers, dots, and hyphens"
  }
}

variable "environment" {
  type        = string
  description = "Deployment environment identifier for resource segregation and management"

  validation {
    condition     = contains(["prod", "staging", "dev"], var.environment)
    error_message = "Environment must be one of: prod, staging, dev to ensure proper resource segregation"
  }
}

variable "replica_bucket_arn" {
  type        = string
  description = "ARN of the destination bucket for cross-region replication, must be a valid S3 bucket ARN"

  validation {
    condition     = can(regex("^arn:aws:s3:::[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.replica_bucket_arn))
    error_message = "Replica bucket ARN must be a valid S3 bucket ARN following AWS naming conventions"
  }
}

variable "tags" {
  type        = map(string)
  description = "Resource tags for bucket organization, monitoring, and cost allocation"
  
  default = {
    Terraform   = "true"
    Project     = "ai-detection-platform"
    ManagedBy   = "terraform"
    Environment = "var.environment"
  }
}