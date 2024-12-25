# Core cluster connection outputs
output "cluster_endpoint" {
  description = "The DNS address of the DocumentDB cluster primary instance. Used for primary write operations."
  value       = aws_docdb_cluster.main.endpoint
  sensitive   = false
}

output "cluster_port" {
  description = "The port number on which the DocumentDB cluster accepts connections."
  value       = aws_docdb_cluster.main.port
  sensitive   = false
}

output "cluster_arn" {
  description = "The ARN (Amazon Resource Name) of the DocumentDB cluster. Used for IAM permissions and cross-account access."
  value       = aws_docdb_cluster.main.arn
  sensitive   = false
}

# High availability instance outputs
output "instance_endpoints" {
  description = "List of DNS addresses for all instances in the DocumentDB cluster. Used for read operations and connection pooling."
  value       = [for instance in aws_docdb_cluster_instance.instances : instance.endpoint]
  sensitive   = false
}

output "instance_identifiers" {
  description = "List of instance identifiers in the DocumentDB cluster. Used for monitoring and management."
  value       = [for instance in aws_docdb_cluster_instance.instances : instance.identifier]
  sensitive   = false
}

# Security-related outputs
output "security_group_id" {
  description = "ID of the security group associated with the DocumentDB cluster. Used for network security configuration."
  value       = aws_security_group.docdb.id
  sensitive   = false
}

output "parameter_group_name" {
  description = "Name of the cluster parameter group used by the DocumentDB cluster. Used for configuration management."
  value       = aws_docdb_cluster_parameter_group.main.name
  sensitive   = false
}

output "subnet_group_name" {
  description = "Name of the subnet group used by the DocumentDB cluster. Used for network configuration."
  value       = aws_docdb_subnet_group.main.name
  sensitive   = false
}

# Monitoring and management outputs
output "cloudwatch_log_groups" {
  description = "List of CloudWatch log groups created for the DocumentDB cluster. Used for log analysis and monitoring."
  value       = aws_docdb_cluster.main.enabled_cloudwatch_logs_exports
  sensitive   = false
}

output "master_credentials_secret_arn" {
  description = "ARN of the Secrets Manager secret containing master credentials. Used for secure credential management."
  value       = aws_secretsmanager_secret.docdb_master.arn
  sensitive   = false
}

# High availability configuration outputs
output "availability_zones" {
  description = "List of availability zones where cluster instances are deployed. Used for understanding HA deployment."
  value       = aws_docdb_cluster.main.availability_zones
  sensitive   = false
}

output "backup_retention_period" {
  description = "Number of days automated backups are retained. Used for backup policy compliance."
  value       = aws_docdb_cluster.main.backup_retention_period
  sensitive   = false
}

# Status and configuration outputs
output "cluster_status" {
  description = "Current status of the DocumentDB cluster. Used for monitoring cluster health."
  value       = aws_docdb_cluster.main.status
  sensitive   = false
}

output "engine_version" {
  description = "Version of the DocumentDB engine running on the cluster. Used for version management."
  value       = aws_docdb_cluster.main.engine_version
  sensitive   = false
}