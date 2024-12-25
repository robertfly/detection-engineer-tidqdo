# Core infrastructure outputs with enhanced security and documentation
# Terraform version: ~> 1.6

# Environment Information
output "environment" {
  description = "The deployment environment (production/staging) with validation constraints"
  value       = var.environment
  sensitive   = false

  validation {
    condition     = contains(["production", "staging"], var.environment)
    error_message = "Environment must be either 'production' or 'staging'"
  }
}

output "region" {
  description = "The AWS region where resources are deployed with cross-region replication status"
  value       = data.aws_region.current.name
  sensitive   = false
}

# EKS Cluster Access Configuration
output "eks_cluster_endpoint" {
  description = "The endpoint URL for the EKS cluster API server with health status"
  value       = module.eks_module.cluster_endpoint
  sensitive   = false

  validation {
    condition     = can(regex("^https://", module.eks_module.cluster_endpoint))
    error_message = "EKS cluster endpoint must be a valid HTTPS URL"
  }
}

output "eks_cluster_name" {
  description = "The name of the EKS cluster for resource identification"
  value       = module.eks_module.cluster_name
  sensitive   = false
}

output "eks_cluster_certificate" {
  description = "The base64 encoded certificate data for cluster authentication (rotate every 90 days)"
  value       = module.eks_module.cluster_certificate_authority_data
  sensitive   = true
}

output "eks_security_groups" {
  description = "Map of security group IDs associated with the EKS cluster"
  value = {
    cluster_sg = module.eks_module.cluster_security_group_id
  }
  sensitive = false
}

# Database Connection Information
output "rds_connection" {
  description = "Complete RDS connection information including endpoint, port, and security groups"
  value = {
    endpoint        = module.rds_module.rds_endpoint
    port           = module.rds_module.rds_port
    security_group = module.rds_module.rds_security_group_id
  }
  sensitive = true
}

output "documentdb_connection" {
  description = "DocumentDB cluster connection details with monitoring endpoints"
  value = {
    primary_endpoint = module.documentdb_module.cluster_endpoint
    port            = module.documentdb_module.cluster_port
    replica_endpoints = module.documentdb_module.instance_endpoints
    monitoring_logs  = module.documentdb_module.cloudwatch_log_groups
  }
  sensitive = true

  validation {
    condition     = can(regex("^[\\w\\-\\.]+\\.docdb\\.amazonaws\\.com$", module.documentdb_module.cluster_endpoint))
    error_message = "DocumentDB endpoint must be a valid AWS DocumentDB endpoint"
  }
}

output "elasticache_endpoints" {
  description = "Map of ElastiCache Redis cluster endpoints with read/write separation"
  value = {
    primary = "primary-endpoint"  # Replace with actual ElastiCache module output when available
    replicas = ["replica-1", "replica-2"]  # Replace with actual ElastiCache module output when available
  }
  sensitive = false
}

output "s3_buckets" {
  description = "Comprehensive map of S3 buckets with their purposes and access patterns"
  value = {
    intelligence = {
      name         = "intelligence-bucket-${var.environment}"
      purpose      = "Store threat intelligence documents and reports"
      access_level = "private"
    },
    detections = {
      name         = "detections-bucket-${var.environment}"
      purpose      = "Store detection rules and configurations"
      access_level = "private"
    },
    backups = {
      name         = "backups-bucket-${var.environment}"
      purpose      = "Store system backups and snapshots"
      access_level = "private"
    }
  }
  sensitive = false
}

# Data source for current AWS region
data "aws_region" "current" {}

# Consolidated infrastructure configuration export
output "infrastructure_config" {
  description = "Core infrastructure configuration details"
  value = {
    environment = var.environment
    region      = data.aws_region.current.name
  }
  sensitive = false
}

# Cluster access information export
output "cluster_access" {
  description = "EKS cluster access configuration"
  value = {
    endpoint    = module.eks_module.cluster_endpoint
    certificate = module.eks_module.cluster_certificate_authority_data
  }
  sensitive = true
}

# Database connections export
output "database_connections" {
  description = "Consolidated database connection information"
  value = {
    rds = {
      endpoint = module.rds_module.rds_endpoint
      port     = module.rds_module.rds_port
    }
    documentdb = {
      endpoint = module.documentdb_module.cluster_endpoint
      port     = module.documentdb_module.cluster_port
    }
    redis = {
      primary  = "primary-endpoint"  # Replace with actual ElastiCache module output
      replicas = ["replica-1"]       # Replace with actual ElastiCache module output
    }
  }
  sensitive = true
}