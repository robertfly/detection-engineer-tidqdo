# Core Redis endpoint information
output "redis_endpoint" {
  description = "Primary endpoint address of the Redis cluster for write operations"
  value       = aws_elasticache_replication_group.redis.primary_endpoint_address
}

output "redis_reader_endpoint" {
  description = "Reader endpoint address of the Redis cluster for read operations in multi-AZ setup"
  value       = aws_elasticache_replication_group.redis.reader_endpoint_address
}

output "redis_port" {
  description = "Port number for Redis cluster access"
  value       = aws_elasticache_replication_group.redis.port
}

# Security group information
output "security_group_id" {
  description = "ID of the security group controlling Redis cluster access"
  value       = aws_security_group.redis.id
}

output "security_group_name" {
  description = "Name of the security group for identification and tagging"
  value       = aws_security_group.redis.name
}

# Connection strings for application configuration
output "connection_string" {
  description = "Full Redis connection string including endpoint and port for application configuration"
  value       = format("redis://%s:%d", 
    aws_elasticache_replication_group.redis.primary_endpoint_address,
    aws_elasticache_replication_group.redis.port
  )
}

output "reader_connection_string" {
  description = "Full Redis reader connection string for read-only operations in multi-AZ setup"
  value       = format("redis://%s:%d",
    aws_elasticache_replication_group.redis.reader_endpoint_address,
    aws_elasticache_replication_group.redis.port
  )
}