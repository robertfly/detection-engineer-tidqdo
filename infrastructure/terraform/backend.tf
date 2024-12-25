# Backend configuration for AI-Driven Detection Engineering platform
# Version: ~> 1.6
# Provider Version: AWS Provider ~> 5.0

terraform {
  # S3 backend configuration with enhanced security controls
  backend "s3" {
    # State file storage configuration
    bucket = "ai-detection-platform-${var.environment}-tfstate"
    key    = "terraform.tfstate"
    region = var.aws_region

    # Encryption and security controls
    encrypt        = true
    kms_key_id    = "alias/terraform-state-key"
    
    # State locking configuration
    dynamodb_table = "ai-detection-platform-${var.environment}-tflock"
    
    # Access logging configuration
    access_logging {
      target_bucket = "ai-detection-platform-${var.environment}-logs"
      target_prefix = "tfstate-access/"
    }
    
    # State file versioning
    versioning = true
    
    # Lifecycle rules for state management
    lifecycle_rule {
      enabled = true
      
      noncurrent_version_transition {
        days          = 30
        storage_class = "GLACIER"
      }
      
      noncurrent_version_expiration {
        days = 90
      }
    }

    # Force SSL for all operations
    force_ssl = true

    # Additional security configurations
    server_side_encryption_configuration {
      rule {
        apply_server_side_encryption_by_default {
          sse_algorithm     = "aws:kms"
          kms_master_key_id = "alias/terraform-state-key"
        }
        bucket_key_enabled = true
      }
    }

    # VPC endpoint configuration for enhanced network security
    vpc_endpoint_enabled = true

    # Block public access
    block_public_acls       = true
    block_public_policy     = true
    ignore_public_acls      = true
    restrict_public_buckets = true
  }

  # Required provider configuration
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Terraform version constraint
  required_version = ">= 1.6.0"
}

# Additional backend configuration validation
locals {
  # Validate environment-specific configuration
  validate_environment = regex("^(prod|staging)$", var.environment)
  
  # Validate AWS region
  validate_region = regex("^[a-z]{2}-[a-z]+-[1-9][0-9]?$", var.aws_region)
  
  # Common tags for backend resources
  backend_tags = {
    Project     = "AI Detection Platform"
    ManagedBy   = "Terraform"
    Environment = var.environment
    Component   = "State Backend"
    Compliance  = "SOC2"
    Encryption  = "AES-256"
  }
}

# Backend health check data source
data "aws_s3_bucket" "tfstate" {
  bucket = "ai-detection-platform-${var.environment}-tfstate"
}

data "aws_dynamodb_table" "tflock" {
  name = "ai-detection-platform-${var.environment}-tflock"
}

# Backend monitoring configuration
resource "aws_cloudwatch_metric_alarm" "backend_errors" {
  alarm_name          = "terraform-backend-errors-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "4xxErrors"
  namespace           = "AWS/S3"
  period             = "300"
  statistic          = "Sum"
  threshold          = "0"
  alarm_description  = "This metric monitors Terraform backend access errors"
  
  dimensions = {
    BucketName = data.aws_s3_bucket.tfstate.id
  }
  
  tags = local.backend_tags
}