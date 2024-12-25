# Provider configuration for AI-Driven Detection Engineering platform
# Version: 1.6+
# Last updated: 2024

terraform {
  required_providers {
    # AWS Provider v5.0+ for enhanced security features and enterprise support
    # hashicorp/aws ~> 5.0
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }

    # Kubernetes Provider v2.23+ for EKS management with enhanced RBAC support
    # hashicorp/kubernetes ~> 2.23
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
  }
}

# AWS Provider configuration with enterprise-grade settings
provider "aws" {
  region = var.aws_region

  # Enhanced security with IAM role assumption
  assume_role {
    role_arn     = var.aws_assume_role_arn
    session_name = "TerraformProviderSession"
  }

  # Default tags for all resources following enterprise standards
  default_tags {
    Environment         = var.environment
    ManagedBy          = "Terraform"
    Project            = "AI Detection Platform"
    SecurityCompliance = "SOC2"
    CostCenter         = "Security-Operations"
    BackupPolicy       = "Required"
    DataClassification = "Confidential"
  }

  # Retry configuration for high availability
  retry_mode  = "standard"
  max_retries = 3
}

# Data source for EKS cluster information
data "aws_eks_cluster" "main" {
  name = "${var.project_name}-${var.environment}-eks"

  # Timeout settings for reliable cluster data retrieval
  timeouts {
    read = "30m"
  }
}

# Data source for EKS cluster authentication
data "aws_eks_cluster_auth" "main" {
  name = data.aws_eks_cluster.main.name
}

# Kubernetes Provider configuration with secure authentication
provider "kubernetes" {
  host                   = data.aws_eks_cluster.main.endpoint
  cluster_ca_certificate = base64decode(data.aws_eks_cluster.main.certificate_authority[0].data)
  token                  = data.aws_eks_cluster_auth.main.token

  # AWS IAM Authenticator configuration for EKS
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args = [
      "eks",
      "get-token",
      "--cluster-name",
      data.aws_eks_cluster.main.name
    ]
  }

  # Timeout settings for Kubernetes operations
  timeouts {
    create = "30m"
    update = "30m"
    delete = "30m"
  }
}