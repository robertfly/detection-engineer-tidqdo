# Provider Configuration
terraform {
  required_version = "~> 1.6"
  
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
    # Backend configuration should be provided via backend config file
    encrypt = true
  }
}

# AWS Provider Configuration
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = var.tags
  }
}

# Random string for unique naming
resource "random_string" "suffix" {
  length  = 8
  special = false
  upper   = false
}

# Local variables for resource configuration
locals {
  name_prefix = "${var.project_name}-${var.environment}-${random_string.suffix.result}"
  
  common_tags = merge(var.tags, {
    Environment = var.environment
    ManagedBy   = "Terraform"
    LastUpdated = timestamp()
  })

  # KMS configuration for encryption
  kms_config = {
    deletion_window_in_days = 7
    enable_key_rotation    = true
    alias_name            = "alias/${local.name_prefix}-key"
  }

  # Monitoring configuration
  monitoring_config = {
    retention_in_days    = var.environment == "prod" ? 365 : 30
    evaluation_periods   = var.environment == "prod" ? 3 : 2
    alarm_threshold      = var.environment == "prod" ? 90 : 80
    metrics_namespace    = "AI-Detection-Platform"
  }
}

# KMS Key for encryption
resource "aws_kms_key" "main" {
  description             = "KMS key for ${var.project_name} ${var.environment} environment"
  deletion_window_in_days = local.kms_config.deletion_window_in_days
  enable_key_rotation     = local.kms_config.enable_key_rotation
  tags                    = local.common_tags
}

resource "aws_kms_alias" "main" {
  name          = local.kms_config.alias_name
  target_key_id = aws_kms_key.main.key_id
}

# VPC Module
module "vpc" {
  source = "./modules/vpc"

  cidr_block        = var.vpc_cidr
  environment       = var.environment
  enable_flow_logs  = true
  tags             = local.common_tags

  # Enhanced security configurations
  enable_vpc_endpoints = true
  enable_nat_gateway  = true
  single_nat_gateway  = var.environment != "prod"
  
  # Monitoring configurations
  flow_logs_retention = local.monitoring_config.retention_in_days
  kms_key_id         = aws_kms_key.main.arn
}

# EKS Module
module "eks" {
  source = "./modules/eks"

  cluster_name        = local.name_prefix
  cluster_version     = var.eks_cluster_version
  vpc_id             = module.vpc.vpc_id
  subnet_ids         = module.vpc.private_subnets
  node_instance_types = var.eks_node_instance_types
  
  # Security configurations
  enable_irsa        = true
  encrypt_secrets    = true
  kms_key_id        = aws_kms_key.main.arn
  
  # Monitoring configurations
  enable_monitoring  = true
  log_retention     = local.monitoring_config.retention_in_days
  metrics_namespace = local.monitoring_config.metrics_namespace
  
  tags = local.common_tags
}

# RDS Module
module "rds" {
  source = "./modules/rds"

  identifier           = local.name_prefix
  instance_class       = var.rds_instance_class
  vpc_id              = module.vpc.vpc_id
  subnet_ids          = module.vpc.private_subnets
  
  # High availability configurations
  multi_az            = var.environment == "prod"
  backup_retention_period = var.environment == "prod" ? 30 : 7
  
  # Security configurations
  storage_encrypted   = true
  kms_key_id         = aws_kms_key.main.arn
  
  # Monitoring configurations
  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn
  
  tags = local.common_tags
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "application" {
  name              = "/aws/${var.project_name}/${var.environment}/application"
  retention_in_days = local.monitoring_config.retention_in_days
  kms_key_id       = aws_kms_key.main.arn
  tags             = local.common_tags
}

# SNS Topic for Alerts
resource "aws_sns_topic" "alerts" {
  name = "${local.name_prefix}-alerts"
  kms_master_key_id = aws_kms_key.main.id
  tags = local.common_tags
}

# CloudWatch Alarms
resource "aws_cloudwatch_metric_alarm" "cpu_utilization" {
  alarm_name          = "${local.name_prefix}-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = local.monitoring_config.evaluation_periods
  metric_name         = "CPUUtilization"
  namespace           = local.monitoring_config.metrics_namespace
  period              = 300
  statistic           = "Average"
  threshold           = local.monitoring_config.alarm_threshold
  alarm_description   = "CPU utilization is too high"
  alarm_actions       = [aws_sns_topic.alerts.arn]
  
  tags = local.common_tags
}

# IAM Role for RDS Enhanced Monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = "${local.name_prefix}-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Outputs
output "vpc_id" {
  description = "ID of the created VPC"
  value       = module.vpc.vpc_id
}

output "monitoring_configuration" {
  description = "Monitoring configuration details"
  value = {
    cloudwatch_log_groups = [aws_cloudwatch_log_group.application.name]
    alarm_topics         = [aws_sns_topic.alerts.arn]
    metrics_namespace    = local.monitoring_config.metrics_namespace
  }
}