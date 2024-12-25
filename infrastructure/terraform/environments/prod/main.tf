# Production Environment Terraform Configuration for AI-Driven Detection Engineering Platform
# Version: 1.6.0
# Provider versions:
# - hashicorp/aws ~> 5.0
# - hashicorp/kubernetes ~> 2.23
# - hashicorp/random ~> 3.5
# - cloudposse/security-group ~> 1.0

terraform {
  required_version = ">= 1.6.0"

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

  backend "s3" {
    bucket         = "ai-detection-platform-tfstate-prod"
    key            = "prod/terraform.tfstate"
    region         = "us-west-2"
    encrypt        = true
    dynamodb_table = "terraform-state-lock-prod"
    kms_key_id     = "alias/terraform-state-key-prod"
  }
}

# Common tags for resource management and compliance
locals {
  common_tags = {
    Environment      = "production"
    Project         = "ai-detection-platform"
    ManagedBy       = "terraform"
    SecurityLevel   = "high"
    ComplianceScope = "soc2-hipaa-gdpr"
    BackupFrequency = "hourly"
    CostCenter      = "production-infrastructure"
  }
}

# Primary region provider configuration
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.common_tags
  }

  assume_role {
    role_arn = "arn:aws:iam::ACCOUNT_ID:role/TerraformProductionRole"
  }
}

# Secondary region provider for disaster recovery
provider "aws" {
  alias  = "secondary"
  region = var.secondary_region

  default_tags {
    tags = local.common_tags
  }

  assume_role {
    role_arn = "arn:aws:iam::ACCOUNT_ID:role/TerraformProductionRole"
  }
}

# Production VPC with enhanced security
module "vpc" {
  source = "../../modules/vpc"

  cidr_block           = var.vpc_cidr
  environment         = var.environment
  enable_nat_gateway  = true
  single_nat_gateway  = false
  enable_vpn_gateway  = true
  enable_flow_logs    = true
  flow_logs_retention = 365

  # Enhanced network security
  enable_network_firewall = true
  network_acls = {
    strict_inbound  = true
    strict_outbound = true
  }

  # Availability Zones configuration
  azs             = ["${var.aws_region}a", "${var.aws_region}b", "${var.aws_region}c"]
  private_subnets = ["10.0.1.0/24", "10.0.2.0/24", "10.0.3.0/24"]
  public_subnets  = ["10.0.101.0/24", "10.0.102.0/24", "10.0.103.0/24"]

  tags = merge(local.common_tags, {
    Name = "ai-detection-platform-vpc-prod"
  })
}

# Production EKS cluster with advanced security
module "eks" {
  source = "../../modules/eks"

  cluster_name    = "ai-detection-prod"
  cluster_version = var.eks_cluster_version
  vpc_id          = module.vpc.vpc_id
  subnet_ids      = module.vpc.private_subnets

  # Node group configuration
  node_groups = {
    general = {
      instance_types = var.eks_node_instance_types
      min_size      = 2
      max_size      = 10
      desired_size  = 3
    }
    compute_intensive = {
      instance_types = ["c5.2xlarge", "c5.4xlarge"]
      min_size      = 1
      max_size      = 5
      desired_size  = 2
    }
  }

  # Security and compliance controls
  enable_cluster_autoscaler = true
  enable_pod_security_policy = true
  enable_network_policy     = true
  enable_secrets_encryption = true
  control_plane_logging     = ["api", "audit", "authenticator", "controllerManager", "scheduler"]

  # OIDC configuration for service accounts
  enable_irsa = true

  tags = merge(local.common_tags, {
    Name = "ai-detection-platform-eks-prod"
  })
}

# Production RDS instance with high availability
module "rds" {
  source = "../../modules/rds"

  identifier = "ai-detection-prod-db"
  engine     = "postgres"
  engine_version = "15.3"
  instance_class = var.rds_instance_class
  
  multi_az = true
  storage_encrypted = true
  backup_retention_period = 30
  deletion_protection = true

  vpc_security_group_ids = [module.vpc.database_security_group_id]
  subnet_ids = module.vpc.database_subnets

  tags = merge(local.common_tags, {
    Name = "ai-detection-platform-rds-prod"
  })
}

# Production DocumentDB cluster
module "documentdb" {
  source = "../../modules/documentdb"

  cluster_identifier = "ai-detection-prod-docdb"
  engine_version    = "6.0"
  instance_class    = var.documentdb_instance_class
  
  instances = 3
  backup_retention_period = 30
  preferred_backup_window = "02:00-04:00"
  
  vpc_security_group_ids = [module.vpc.documentdb_security_group_id]
  subnet_ids = module.vpc.database_subnets

  tags = merge(local.common_tags, {
    Name = "ai-detection-platform-docdb-prod"
  })
}

# Production ElastiCache cluster
module "elasticache" {
  source = "../../modules/elasticache"

  cluster_id = "ai-detection-prod-cache"
  engine     = "redis"
  engine_version = "7.0"
  node_type  = var.elasticache_node_type
  
  num_cache_nodes = 3
  automatic_failover_enabled = true
  multi_az_enabled = true
  
  vpc_security_group_ids = [module.vpc.elasticache_security_group_id]
  subnet_ids = module.vpc.elasticache_subnets

  tags = merge(local.common_tags, {
    Name = "ai-detection-platform-cache-prod"
  })
}

# Outputs for other configurations
output "vpc_outputs" {
  description = "VPC and security information"
  value = {
    vpc_id            = module.vpc.vpc_id
    private_subnets   = module.vpc.private_subnets
    security_group_ids = module.vpc.security_group_ids
  }
}

output "eks_outputs" {
  description = "EKS cluster information"
  value = {
    cluster_endpoint                  = module.eks.cluster_endpoint
    cluster_security_group_id         = module.eks.cluster_security_group_id
    cluster_certificate_authority_data = module.eks.cluster_certificate_authority_data
  }
  sensitive = true
}