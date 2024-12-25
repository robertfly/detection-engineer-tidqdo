# Connection Information Outputs
output "db_instance_endpoint" {
  description = "Connection endpoint for the PostgreSQL RDS instance. This value should be handled securely as it contains sensitive connection information. Used by applications to establish database connections."
  value       = aws_db_instance.postgresql.endpoint
  sensitive   = true
}

output "db_instance_address" {
  description = "The hostname of the RDS instance. This value should be handled securely and not exposed publicly. Used for direct database access when required."
  value       = aws_db_instance.postgresql.address
  sensitive   = true
}

output "db_instance_port" {
  description = "The port number the PostgreSQL RDS instance is listening on. Standard PostgreSQL port used for database connections."
  value       = aws_db_instance.postgresql.port
  sensitive   = false
}

# Resource Identifiers
output "db_instance_id" {
  description = "The RDS instance identifier used for resource management and AWS API operations. Required for infrastructure automation and monitoring."
  value       = aws_db_instance.postgresql.id
  sensitive   = false
}

output "db_instance_arn" {
  description = "The Amazon Resource Name (ARN) of the RDS instance. Used for IAM policies, resource tagging, and cross-account access configuration."
  value       = aws_db_instance.postgresql.arn
  sensitive   = false
}

# Network Configuration
output "db_subnet_group_id" {
  description = "The ID of the DB subnet group associated with the RDS instance. Used for network configuration and VPC management."
  value       = aws_db_subnet_group.this.id
  sensitive   = false
}

# Security Configuration
output "db_security_group_id" {
  description = "The ID of the security group controlling access to the RDS instance. Used for managing inbound/outbound database access rules."
  value       = aws_security_group.rds.id
  sensitive   = false
}

# Additional Security Information
output "monitoring_role_arn" {
  description = "The ARN of the IAM role used for RDS enhanced monitoring. Required for monitoring configuration and IAM policy management."
  value       = aws_iam_role.rds_monitoring.arn
  sensitive   = false
}

output "parameter_group_id" {
  description = "The ID of the DB parameter group applied to the RDS instance. Used for database engine configuration management."
  value       = aws_db_parameter_group.postgresql.id
  sensitive   = false
}

output "db_secret_arn" {
  description = "The ARN of the Secrets Manager secret storing the database password. Required for secure password rotation and application configuration."
  value       = aws_secretsmanager_secret.db_password.arn
  sensitive   = false
}