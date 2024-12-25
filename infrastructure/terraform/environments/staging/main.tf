# Main Terraform configuration for AI-Driven Detection Engineering platform staging environment
# Version: 1.6+

# Provider Configuration
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    kubernetes = {
      source  = "hashicorp/kubernetes"
      version = "~> 2.23"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
    }
  }
  required_version = ">= 1.6.0"

  backend "s3" {
    # Backend configuration should be provided via backend config file
    key = "staging/terraform.tfstate"
  }
}

# Import common variables
variable "environment" {}
variable "aws_region" {}

# Provider configurations
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }
}

provider "kubernetes" {
  host                   = module.eks.cluster_endpoint
  cluster_ca_certificate = base64decode(module.eks.cluster_certificate_authority_data)
  exec {
    api_version = "client.authentication.k8s.io/v1beta1"
    command     = "aws"
    args        = ["eks", "get-token", "--cluster-name", module.eks.cluster_name]
  }
}

# Local variables
locals {
  environment = "staging"
  common_tags = {
    Environment = "staging"
    ManagedBy   = "Terraform"
    Project     = "AI Detection Platform"
  }
  name_prefix = "aidet-staging"
}

# VPC Module
module "vpc" {
  source = "../../modules/vpc"

  cidr_block  = "10.1.0.0/16"
  environment = local.environment
  tags        = local.common_tags
}

# EKS Module
module "eks" {
  source = "../../modules/eks"

  cluster_name       = "${local.name_prefix}-cluster"
  cluster_version    = "1.27"
  vpc_id            = module.vpc.vpc_id
  subnet_ids        = module.vpc.private_subnets
  node_instance_types = ["t3.large"]
  min_size          = 2
  max_size          = 4
  desired_size      = 2
  tags              = local.common_tags
}

# RDS Module
module "rds" {
  source = "../../modules/rds"

  identifier             = "${local.name_prefix}-db"
  instance_class        = "db.t3.large"
  vpc_id               = module.vpc.vpc_id
  subnet_ids           = module.vpc.private_subnets
  backup_retention_period = 7
  multi_az             = true
  tags                 = local.common_tags
}

# DocumentDB Module
module "documentdb" {
  source = "../../modules/documentdb"

  cluster_name           = "${local.name_prefix}-docdb"
  instance_class        = "db.t3.medium"
  vpc_id               = module.vpc.vpc_id
  subnet_ids           = module.vpc.private_subnets
  instance_count       = 2
  backup_retention_period = 7
  tags                 = local.common_tags
}

# ElastiCache Module
module "elasticache" {
  source = "../../modules/elasticache"

  cluster_name     = "${local.name_prefix}-redis"
  node_type       = "cache.t3.medium"
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets
  num_cache_nodes = 2
  tags            = local.common_tags
}

# S3 Module
module "s3" {
  source = "../../modules/s3"

  bucket_prefix      = local.name_prefix
  environment       = local.environment
  versioning_enabled = true
  tags              = local.common_tags
}

# Outputs
output "vpc_id" {
  description = "The ID of the VPC"
  value       = module.vpc.vpc_id
}

output "eks_cluster_endpoint" {
  description = "The endpoint for the EKS cluster"
  value       = module.eks.cluster_endpoint
  sensitive   = true
}

output "rds_endpoint" {
  description = "The endpoint for the RDS instance"
  value       = module.rds.endpoint
  sensitive   = true
}

output "documentdb_endpoint" {
  description = "The endpoint for the DocumentDB cluster"
  value       = module.documentdb.endpoint
  sensitive   = true
}

output "elasticache_endpoint" {
  description = "The endpoint for the ElastiCache cluster"
  value       = module.elasticache.endpoint
  sensitive   = true
}