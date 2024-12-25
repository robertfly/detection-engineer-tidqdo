# Environment Identification
environment = "staging"
project_name = "ai-detection-platform"

# AWS Configuration
aws_region = "us-west-2"

# Network Configuration
vpc_cidr = "10.1.0.0/16"

# EKS Configuration
eks_cluster_version = "1.27"
eks_node_instance_types = ["t3.large"]

# Database Configuration
rds_instance_class = "db.t3.medium"
documentdb_instance_class = "db.t3.medium"
elasticache_node_type = "cache.t3.medium"

# Resource Tagging
tags = {
  Environment    = "staging"
  Project        = "AI Detection Platform"
  ManagedBy      = "Terraform"
  Feature-Flags  = "enabled"
}