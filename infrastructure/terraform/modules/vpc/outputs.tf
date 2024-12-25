# VPC Identifier Output
output "vpc_id" {
  description = "The ID of the VPC for reference by other infrastructure components"
  value       = aws_vpc.main.id
}

# VPC CIDR Block Output - Marked sensitive for security
output "vpc_cidr" {
  description = "The primary CIDR block of the VPC for network planning and security group configuration"
  value       = aws_vpc.main.cidr_block
  sensitive   = true
}

# Private Subnet IDs Output with dependency management
output "private_subnet_ids" {
  description = "List of private subnet IDs for secure resource placement (databases, internal services)"
  value       = aws_subnet.private[*].id
  depends_on  = [aws_subnet.private]
}

# Public Subnet IDs Output with dependency management
output "public_subnet_ids" {
  description = "List of public subnet IDs for internet-facing resources (load balancers, NAT gateways)"
  value       = aws_subnet.public[*].id
  depends_on  = [aws_subnet.public]
}

# Private Subnet CIDR Blocks Output - Marked sensitive for security
output "private_subnet_cidrs" {
  description = "List of private subnet CIDR blocks for network planning and security group configuration"
  value       = aws_subnet.private[*].cidr_block
  sensitive   = true
}

# Public Subnet CIDR Blocks Output - Marked sensitive for security
output "public_subnet_cidrs" {
  description = "List of public subnet CIDR blocks for network planning and security group configuration"
  value       = aws_subnet.public[*].cidr_block
  sensitive   = true
}

# Availability Zones Output for HA deployment planning
output "availability_zones" {
  description = "List of availability zones where the VPC resources are deployed for high availability configuration"
  value       = var.azs
}