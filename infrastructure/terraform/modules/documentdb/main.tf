# AWS Provider configuration
# Provider version: ~> 5.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# DocumentDB Subnet Group
resource "aws_docdb_subnet_group" "main" {
  name        = "${var.cluster_name}-subnet-group"
  subnet_ids  = var.subnet_ids
  description = "Subnet group for ${var.cluster_name} DocumentDB cluster"
  tags        = merge(var.tags, { Name = "${var.cluster_name}-subnet-group" })
}

# Security Group for DocumentDB
resource "aws_security_group" "docdb" {
  name        = "${var.cluster_name}-sg"
  description = "Security group for ${var.cluster_name} DocumentDB cluster"
  vpc_id      = var.vpc_id

  # Ingress rule for DocumentDB port 27017
  ingress {
    from_port       = 27017
    to_port         = 27017
    protocol        = "tcp"
    cidr_blocks     = var.allowed_cidr_blocks
    security_groups = []
    description     = "DocumentDB access"
  }

  # Egress rule allowing all outbound traffic
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-sg"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# DocumentDB Parameter Group
resource "aws_docdb_cluster_parameter_group" "main" {
  family      = "docdb${var.engine_version}"
  name        = "${var.cluster_name}-params"
  description = "Custom parameter group for ${var.cluster_name}"

  # Security parameters
  parameter {
    name  = "tls"
    value = var.tls_enabled ? "enabled" : "disabled"
  }

  parameter {
    name  = "audit_logs"
    value = var.audit_logging_enabled ? "enabled" : "disabled"
  }

  tags = var.tags
}

# DocumentDB Cluster
resource "aws_docdb_cluster" "main" {
  cluster_identifier              = var.cluster_name
  engine                         = "docdb"
  engine_version                 = var.engine_version
  master_username                = "docdbadmin"
  master_password                = random_password.master_password.result
  db_subnet_group_name           = aws_docdb_subnet_group.main.name
  vpc_security_group_ids         = [aws_security_group.docdb.id]
  db_cluster_parameter_group_name = aws_docdb_cluster_parameter_group.main.name
  
  # High Availability settings
  availability_zones            = slice(data.aws_availability_zones.available.names, 0, 3)
  backup_retention_period      = var.backup_retention_period
  preferred_backup_window      = "03:00-05:00"
  preferred_maintenance_window = var.preferred_maintenance_window
  
  # Security settings
  storage_encrypted               = var.encryption_enabled
  kms_key_id                     = var.kms_key_id
  deletion_protection            = var.deletion_protection
  enabled_cloudwatch_logs_exports = var.cloudwatch_logs_exports
  
  # Performance and monitoring
  apply_immediately            = false
  skip_final_snapshot         = false
  final_snapshot_identifier   = "${var.cluster_name}-final-snapshot"

  tags = merge(var.tags, {
    Name = var.cluster_name
  })

  depends_on = [
    aws_docdb_subnet_group.main,
    aws_security_group.docdb
  ]
}

# DocumentDB Cluster Instances
resource "aws_docdb_cluster_instance" "instances" {
  count                   = var.instance_count
  identifier             = "${var.cluster_name}-${count.index + 1}"
  cluster_identifier     = aws_docdb_cluster.main.id
  instance_class         = var.instance_class
  engine                 = "docdb"
  
  # Monitoring configuration
  auto_minor_version_upgrade = var.auto_minor_version_upgrade
  monitoring_interval       = 30
  monitoring_role_arn      = var.enhanced_monitoring_role_arn
  
  # Instance promotion tier (0 for primary, increasing numbers for replicas)
  promotion_tier          = count.index

  tags = merge(var.tags, {
    Name = "${var.cluster_name}-${count.index + 1}"
  })

  depends_on = [aws_docdb_cluster.main]
}

# Random password generation for master user
resource "random_password" "master_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# Data source for availability zones
data "aws_availability_zones" "available" {
  state = "available"
}

# Store master password in AWS Secrets Manager
resource "aws_secretsmanager_secret" "docdb_master" {
  name        = "${var.cluster_name}-master-credentials"
  description = "Master credentials for DocumentDB cluster ${var.cluster_name}"
  tags        = var.tags
}

resource "aws_secretsmanager_secret_version" "docdb_master" {
  secret_id = aws_secretsmanager_secret.docdb_master.id
  secret_string = jsonencode({
    username = "docdbadmin"
    password = random_password.master_password.result
  })
}

# CloudWatch Alarms for monitoring
resource "aws_cloudwatch_metric_alarm" "cpu_utilization" {
  alarm_name          = "${var.cluster_name}-cpu-utilization"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "CPUUtilization"
  namespace           = "AWS/DocDB"
  period              = "300"
  statistic           = "Average"
  threshold           = "80"
  alarm_description   = "This metric monitors DocumentDB CPU utilization"
  alarm_actions       = []  # Add SNS topic ARN for notifications

  dimensions = {
    DBClusterIdentifier = aws_docdb_cluster.main.cluster_identifier
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "free_local_storage" {
  alarm_name          = "${var.cluster_name}-free-local-storage"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "FreeLocalStorage"
  namespace           = "AWS/DocDB"
  period              = "300"
  statistic           = "Average"
  threshold           = "10000000000"  # 10GB in bytes
  alarm_description   = "This metric monitors free local storage"
  alarm_actions       = []  # Add SNS topic ARN for notifications

  dimensions = {
    DBClusterIdentifier = aws_docdb_cluster.main.cluster_identifier
  }

  tags = var.tags
}