# Output definitions for the S3 storage module
# Version: ~> 1.6
# Purpose: Exposes essential S3 bucket attributes for infrastructure integration
# and cross-module references

output "bucket_id" {
  description = "The unique identifier of the created S3 bucket"
  value       = aws_s3_bucket.s3_bucket.id
}

output "bucket_arn" {
  description = "The ARN of the created S3 bucket"
  value       = aws_s3_bucket.s3_bucket.arn
}

output "bucket_domain_name" {
  description = "The domain name of the S3 bucket"
  value       = aws_s3_bucket.s3_bucket.bucket_domain_name
}