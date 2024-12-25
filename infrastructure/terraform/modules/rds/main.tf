# Provider version constraints
# aws ~> 5.0
# random ~> 3.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

# Generate secure random password for RDS instance
resource "random_password" "db_password" {
  length           = 32
  special          = true
  override_special = "!#$%&*()-_=+[]{}<>:?"
}

# Store the database password in AWS Secrets Manager
resource "aws_secretsmanager_secret" "db_password" {
  name        = "${var.environment}-postgresql-password"
  description = "PostgreSQL database password for ${var.environment} environment"
  tags        = var.tags
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}

# Create DB parameter group for PostgreSQL optimization
resource "aws_db_parameter_group" "postgresql" {
  family = "postgres${split(".", var.engine_version)[0]}"
  name   = "${var.environment}-postgresql-params"

  parameter {
    name  = "log_connections"
    value = "1"
  }

  parameter {
    name  = "log_disconnections"
    value = "1"
  }

  parameter {
    name  = "log_checkpoints"
    value = "1"
  }

  parameter {
    name  = "log_lock_waits"
    value = "1"
  }

  tags = var.tags
}

# Create IAM role for enhanced monitoring
resource "aws_iam_role" "rds_monitoring" {
  name = "${var.environment}-rds-monitoring-role"

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

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# Create DB subnet group for multi-AZ deployment
resource "aws_db_subnet_group" "this" {
  name        = "${var.environment}-rds-subnet-group"
  subnet_ids  = var.private_subnet_ids
  description = "Subnet group for RDS PostgreSQL in ${var.environment}"
  tags        = var.tags
}

# Create security group for RDS access control
resource "aws_security_group" "rds" {
  name        = "${var.environment}-rds-sg"
  description = "Security group for RDS PostgreSQL in ${var.environment}"
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL access from VPC"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    cidr_blocks     = [var.vpc_cidr]
    security_groups = var.allowed_security_groups
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name = format("%s-rds-sg", var.environment)
  })
}

# Create RDS PostgreSQL instance
resource "aws_db_instance" "postgresql" {
  identifier     = "${var.environment}-postgresql"
  engine         = "postgres"
  engine_version = var.engine_version

  # Instance configuration
  instance_class        = var.instance_class
  allocated_storage     = var.allocated_storage
  max_allocated_storage = var.max_allocated_storage
  storage_encrypted     = true
  kms_key_id           = var.kms_key_arn

  # Database configuration
  db_name  = var.database_name
  username = "admin"
  password = random_password.db_password.result

  # High availability and backup configuration
  multi_az                = true
  backup_retention_period = 30
  backup_window          = "03:00-04:00"
  maintenance_window     = "Mon:04:00-Mon:05:00"
  deletion_protection    = true
  skip_final_snapshot    = false
  final_snapshot_identifier = "${var.environment}-postgresql-final"

  # Monitoring and performance configuration
  performance_insights_enabled          = true
  performance_insights_retention_period = 7
  monitoring_interval                   = 60
  monitoring_role_arn                  = aws_iam_role.rds_monitoring.arn
  enabled_cloudwatch_logs_exports       = ["postgresql", "upgrade"]

  # Network and security configuration
  db_subnet_group_name    = aws_db_subnet_group.this.name
  vpc_security_group_ids  = [aws_security_group.rds.id]
  parameter_group_name    = aws_db_parameter_group.postgresql.name
  copy_tags_to_snapshot   = true
  auto_minor_version_upgrade = true

  tags = merge(var.tags, {
    Backup     = true
    Encryption = true
  })
}

# Create CloudWatch alarms for monitoring
resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  alarm_name          = "${var.environment}-database-cpu"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name        = "CPUUtilization"
  namespace          = "AWS/RDS"
  period             = "300"
  statistic          = "Average"
  threshold          = "80"
  alarm_description  = "This metric monitors database CPU utilization"
  alarm_actions      = var.alarm_actions

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgresql.id
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "database_memory" {
  alarm_name          = "${var.environment}-database-memory"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = "2"
  metric_name        = "FreeableMemory"
  namespace          = "AWS/RDS"
  period             = "300"
  statistic          = "Average"
  threshold          = "1000000000" # 1GB in bytes
  alarm_description  = "This metric monitors database freeable memory"
  alarm_actions      = var.alarm_actions

  dimensions = {
    DBInstanceIdentifier = aws_db_instance.postgresql.id
  }

  tags = var.tags
}