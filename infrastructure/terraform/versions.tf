# Terraform version constraint for infrastructure deployment
# Version 1.6+ selected for stability and feature support
terraform {
  required_version = "~> 1.6"

  # Required provider versions for AWS cloud resources and Kubernetes management
  required_providers {
    # AWS provider version 5.0+ for managing cloud infrastructure:
    # - EKS (Container orchestration)
    # - RDS (PostgreSQL database)
    # - DocumentDB (MongoDB-compatible database)
    # - ElastiCache (Redis caching)
    # - S3 (Object storage)
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }

    # Kubernetes provider version 2.23+ for EKS cluster management:
    # - Pod deployment
    # - Service configuration
    # - Resource management
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
  }
}