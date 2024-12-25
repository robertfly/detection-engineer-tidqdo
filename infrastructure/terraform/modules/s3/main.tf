# AWS S3 Module Configuration
# Provider Version: ~> 5.0
# Purpose: Provisions enterprise-grade S3 buckets with advanced security features
# including versioning, encryption, replication, and access controls

terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Local variables for consistent resource tagging
locals {
  default_tags = merge(var.tags, {
    Environment = var.environment
    ManagedBy   = "terraform"
    Service     = "detection-platform"
  })
}

# Primary S3 bucket resource with base configuration
resource "aws_s3_bucket" "s3_bucket" {
  bucket        = var.bucket_name
  force_destroy = false
  tags          = local.default_tags
}

# Enable versioning with MFA delete protection
resource "aws_s3_bucket_versioning" "bucket_versioning" {
  bucket = aws_s3_bucket.s3_bucket.id
  versioning_configuration {
    status     = "Enabled"
    mfa_delete = "Enabled"
  }
}

# Configure server-side encryption using KMS
resource "aws_s3_bucket_server_side_encryption_configuration" "bucket_encryption" {
  bucket = aws_s3_bucket.s3_bucket.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_arn
    }
    bucket_key_enabled = true
  }
}

# Configure cross-region replication with encryption
resource "aws_s3_bucket_replication_configuration" "bucket_replication" {
  # Must have versioning enabled first
  depends_on = [aws_s3_bucket_versioning.bucket_versioning]

  bucket = aws_s3_bucket.s3_bucket.id
  role   = aws_iam_role.replication_role.arn

  rule {
    id       = "EntireS3BucketReplication"
    status   = "Enabled"
    priority = 10

    source_selection_criteria {
      sse_kms_encrypted_objects {
        status = "Enabled"
      }
    }

    destination {
      bucket = var.replica_bucket_arn
      encryption_configuration {
        replica_kms_key_id = var.kms_key_arn
      }
    }
  }
}

# Implement strict public access controls
resource "aws_s3_bucket_public_access_block" "public_access_block" {
  bucket = aws_s3_bucket.s3_bucket.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Configure lifecycle rules for cost optimization
resource "aws_s3_bucket_lifecycle_configuration" "bucket_lifecycle" {
  bucket = aws_s3_bucket.s3_bucket.id

  rule {
    id     = "transition_old_versions"
    status = "Enabled"

    noncurrent_version_transition {
      noncurrent_days = 30
      storage_class   = "STANDARD_IA"
    }
  }
}

# IAM role for S3 replication with least privilege
resource "aws_iam_role" "replication_role" {
  name = "s3-bucket-replication-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Sid = ""
      }
    ]
  })

  tags = local.default_tags
}

# IAM policy for replication role with minimal required permissions
resource "aws_iam_role_policy" "replication_policy" {
  name = "s3-bucket-replication-policy-${var.environment}"
  role = aws_iam_role.replication_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "s3:GetReplicationConfiguration",
          "s3:ListBucket"
        ]
        Effect = "Allow"
        Resource = [
          aws_s3_bucket.s3_bucket.arn
        ]
      },
      {
        Action = [
          "s3:GetObjectVersionForReplication",
          "s3:GetObjectVersionAcl",
          "s3:GetObjectVersionTagging"
        ]
        Effect = "Allow"
        Resource = [
          "${aws_s3_bucket.s3_bucket.arn}/*"
        ]
      },
      {
        Action = [
          "s3:ReplicateObject",
          "s3:ReplicateDelete",
          "s3:ReplicateTags"
        ]
        Effect = "Allow"
        Resource = [
          "${var.replica_bucket_arn}/*"
        ]
      }
    ]
  })
}