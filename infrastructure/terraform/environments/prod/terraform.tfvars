# Production Environment Configuration
# Version: ~> 1.6
# Purpose: Production-grade infrastructure configuration for AI-Driven Detection Engineering platform

# Environment Identifier
environment = "prod"

# AWS Region Configuration
# Primary region with multi-AZ support for high availability (99.9% uptime)
aws_region = "us-west-2"

# Network Configuration
# Production VPC with sufficient address space for scalability
vpc_cidr = "10.0.0.0/16"

# EKS Cluster Configuration
# Latest stable version with production-grade node types
eks_cluster_version = "1.27"
eks_node_instance_types = [
  "t3.xlarge",   # Base node type for general workloads
  "t3.2xlarge"   # High-capacity nodes for ML/processing workloads
]

# Database Configuration
# Production-grade instances with multi-AZ deployment
rds_instance_class = "db.r6g.xlarge"        # Memory-optimized for PostgreSQL 15+
documentdb_instance_class = "db.r6g.large"   # For DocumentDB 6.0+ with high throughput
elasticache_node_type = "cache.r6g.large"    # For Redis 7.0+ caching layer

# Project Identification
project_name = "ai-detection-platform"

# Resource Tagging
# Comprehensive tags for cost allocation and resource management
tags = {
  Environment = "production"
  Project = "AI Detection Platform"
  ManagedBy = "Terraform"
  BusinessUnit = "Security"
  CostCenter = "Security-Prod"
  Compliance = "SOC2"
  DataClassification = "Confidential"
  HighAvailability = "true"
  BackupEnabled = "true"
  MaintenanceWindow = "sun:04:00-sun:06:00"
}