# Output values for the EKS cluster module
# AWS Provider version ~> 5.0

# Cluster Identifier
output "cluster_id" {
  description = "The unique identifier of the EKS cluster for resource referencing and integration"
  value       = aws_eks_cluster.main.id
  sensitive   = false
}

# Cluster ARN
output "cluster_arn" {
  description = "The Amazon Resource Name (ARN) of the EKS cluster for IAM policies and cross-account access"
  value       = aws_eks_cluster.main.arn
  sensitive   = false
}

# Cluster Endpoint
output "cluster_endpoint" {
  description = "The endpoint URL for the EKS cluster API server, used for cluster access and high availability configuration"
  value       = aws_eks_cluster.main.endpoint
  sensitive   = false
}

# Cluster Security Group ID
output "cluster_security_group_id" {
  description = "The ID of the EKS cluster security group for network rules and VPC integration"
  value       = aws_eks_cluster.main.vpc_config[0].cluster_security_group_id
  sensitive   = false
}

# Cluster Certificate Authority Data
output "cluster_certificate_authority_data" {
  description = "The base64 encoded certificate authority data for secure cluster authentication"
  value       = aws_eks_cluster.main.certificate_authority[0].data
  sensitive   = true
}

# Cluster Version
output "cluster_version" {
  description = "The Kubernetes version running on the EKS cluster for version tracking and upgrades"
  value       = aws_eks_cluster.main.version
  sensitive   = false
}

# Node Groups Configuration
output "node_groups" {
  description = "Map of node group configurations and attributes for scaling and management"
  value = {
    for ng_key, ng in aws_eks_node_group.main : ng_key => {
      arn           = ng.arn
      status        = ng.status
      capacity_type = ng.capacity_type
      scaling_config = {
        desired_size = ng.scaling_config[0].desired_size
        max_size     = ng.scaling_config[0].max_size
        min_size     = ng.scaling_config[0].min_size
      }
      instance_types = ng.instance_types
      labels        = ng.labels
      taints        = ng.taints
    }
  }
  sensitive = false
}

# Cluster Authentication Token
output "cluster_auth_token" {
  description = "The authentication token for EKS cluster access with proper security controls"
  value       = data.aws_eks_cluster_auth.main.token
  sensitive   = true
}

# Data source for cluster authentication
data "aws_eks_cluster_auth" "main" {
  name = aws_eks_cluster.main.name
}

# OIDC Provider URL
output "cluster_oidc_provider_url" {
  description = "The OpenID Connect provider URL for IAM role federation and service account integration"
  value       = aws_eks_cluster.main.identity[0].oidc[0].issuer
  sensitive   = false
}

# Cluster Primary Security Group ID
output "cluster_primary_security_group_id" {
  description = "The ID of the EKS cluster's primary security group for pod networking"
  value       = aws_eks_cluster.main.vpc_config[0].security_group_ids[0]
  sensitive   = false
}

# Node Group Role ARN
output "node_group_role_arn" {
  description = "The ARN of the IAM role used by the EKS node groups"
  value       = aws_iam_role.node.arn
  sensitive   = false
}