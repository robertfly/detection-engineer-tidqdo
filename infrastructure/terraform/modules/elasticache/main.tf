# AWS ElastiCache Redis Module
# Provider version: ~> 5.0

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

# Generate secure random auth token for Redis
resource "random_password" "redis_auth_token" {
  length  = 32
  special = false

  lifecycle {
    ignore_changes = [length, special]
  }
}

# Redis parameter group for optimized performance
resource "aws_elasticache_parameter_group" "redis" {
  family = "redis7"
  name   = "redis-params-${var.environment}"

  description = "Custom Redis 7.0 parameter group for ${var.environment}"

  # Performance and behavior parameters
  parameter {
    name  = "maxmemory-policy"
    value = "volatile-lru"  # Evict keys with TTL using LRU
  }

  parameter {
    name  = "notify-keyspace-events"
    value = "Ex"  # Enable keyspace notifications for expired events
  }

  tags = {
    Environment = var.environment
    Terraform   = "true"
    Service     = "redis-cache"
  }
}

# Subnet group for Redis cluster placement
resource "aws_elasticache_subnet_group" "redis" {
  name        = "redis-subnet-group-${var.environment}"
  description = "Redis subnet group for ${var.environment}"
  subnet_ids  = var.private_subnet_ids

  tags = {
    Environment = var.environment
    Terraform   = "true"
    Service     = "redis-cache"
  }
}

# Security group for Redis access control
resource "aws_security_group" "redis" {
  name        = "redis-security-group-${var.environment}"
  description = "Security group for Redis cluster in ${var.environment}"
  vpc_id      = var.vpc_id

  # Inbound rule for Redis access
  ingress {
    from_port   = 6379
    to_port     = 6379
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr_blocks
    description = "Redis access from allowed CIDRs"
  }

  # Outbound rule for Redis cluster
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
    description = "Allow all outbound traffic"
  }

  tags = {
    Environment = var.environment
    Terraform   = "true"
    Service     = "redis-cache"
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Redis replication group with enhanced features
resource "aws_elasticache_replication_group" "redis" {
  replication_group_id = "redis-${var.environment}"
  description         = "Redis cluster for ${var.environment}"

  # Engine configuration
  engine               = "redis"
  engine_version      = "7.0"
  port                = 6379
  parameter_group_name = aws_elasticache_parameter_group.redis.name
  node_type           = var.node_type

  # High availability settings
  num_cache_clusters         = var.num_cache_clusters
  automatic_failover_enabled = true
  multi_az_enabled          = true
  subnet_group_name         = aws_elasticache_subnet_group.redis.name
  security_group_ids        = [aws_security_group.redis.id]

  # Security settings
  at_rest_encryption_enabled = true
  transit_encryption_enabled = true
  auth_token                = random_password.redis_auth_token.result

  # Backup and maintenance settings
  snapshot_retention_limit   = 7
  snapshot_window           = "03:00-05:00"
  maintenance_window        = "mon:05:00-mon:07:00"
  auto_minor_version_upgrade = true

  # Performance settings
  apply_immediately = true

  tags = {
    Environment = var.environment
    Terraform   = "true"
    Service     = "redis-cache"
  }

  lifecycle {
    prevent_destroy = true
    ignore_changes  = [auth_token]
  }
}

# Output the Redis endpoint information
output "redis_endpoint" {
  description = "Redis cluster endpoint information"
  value = {
    primary_endpoint_address = aws_elasticache_replication_group.redis.primary_endpoint_address
    port                    = aws_elasticache_replication_group.redis.port
  }
}

# Output the security group ID
output "redis_security_group" {
  description = "ID of the Redis security group"
  value = {
    id = aws_security_group.redis.id
  }
}