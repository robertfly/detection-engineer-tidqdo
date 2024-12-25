# AWS Provider version ~> 5.0
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# Main VPC Resource
resource "aws_vpc" "main" {
  cidr_block                       = var.vpc_cidr
  enable_dns_hostnames            = true
  enable_dns_support              = true
  enable_network_address_usage_metrics = true
  instance_tenancy                = "default"

  tags = merge(
    {
      Name          = format("%s-vpc", var.environment)
      Environment   = var.environment
      Platform      = "ai-detection"
      SecurityZone  = "restricted"
      Terraform     = "true"
    },
    var.tags
  )
}

# Private Subnets
resource "aws_subnet" "private" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_subnet_cidrs[count.index]
  availability_zone = var.azs[count.index]
  
  map_public_ip_on_launch = false

  tags = merge(
    {
      Name                                           = format("%s-private-%s", var.environment, var.azs[count.index])
      Environment                                    = var.environment
      Tier                                          = "private"
      Platform                                       = "ai-detection"
      "kubernetes.io/role/internal-elb"             = "1"
      "kubernetes.io/cluster/${var.environment}"     = "shared"
    },
    var.tags
  )
}

# Public Subnets
resource "aws_subnet" "public" {
  count             = length(var.azs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.public_subnet_cidrs[count.index]
  availability_zone = var.azs[count.index]
  
  map_public_ip_on_launch = true

  tags = merge(
    {
      Name                                           = format("%s-public-%s", var.environment, var.azs[count.index])
      Environment                                    = var.environment
      Tier                                          = "public"
      Platform                                       = "ai-detection"
      "kubernetes.io/role/elb"                      = "1"
      "kubernetes.io/cluster/${var.environment}"     = "shared"
    },
    var.tags
  )
}

# Internet Gateway
resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.main.id

  tags = merge(
    {
      Name        = format("%s-igw", var.environment)
      Environment = var.environment
      Platform    = "ai-detection"
      Terraform   = "true"
    },
    var.tags
  )
}

# Elastic IPs for NAT Gateways
resource "aws_eip" "nat" {
  count  = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : length(var.azs)) : 0
  domain = "vpc"

  tags = merge(
    {
      Name        = format("%s-eip-%s", var.environment, var.azs[count.index])
      Environment = var.environment
      Platform    = "ai-detection"
      Terraform   = "true"
    },
    var.tags
  )

  depends_on = [aws_internet_gateway.this]
}

# NAT Gateways
resource "aws_nat_gateway" "this" {
  count         = var.enable_nat_gateway ? (var.single_nat_gateway ? 1 : length(var.azs)) : 0
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(
    {
      Name        = format("%s-nat-%s", var.environment, var.azs[count.index])
      Environment = var.environment
      Platform    = "ai-detection"
      Terraform   = "true"
    },
    var.tags
  )

  depends_on = [aws_internet_gateway.this]
}

# Public Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = merge(
    {
      Name        = format("%s-public-rt", var.environment)
      Environment = var.environment
      Tier        = "public"
      Platform    = "ai-detection"
      Terraform   = "true"
    },
    var.tags
  )
}

# Private Route Tables
resource "aws_route_table" "private" {
  count  = length(var.azs)
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = var.single_nat_gateway ? aws_nat_gateway.this[0].id : aws_nat_gateway.this[count.index].id
  }

  tags = merge(
    {
      Name        = format("%s-private-rt-%s", var.environment, var.azs[count.index])
      Environment = var.environment
      Tier        = "private"
      Platform    = "ai-detection"
      Terraform   = "true"
    },
    var.tags
  )
}

# Route Table Associations - Public
resource "aws_route_table_association" "public" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Route Table Associations - Private
resource "aws_route_table_association" "private" {
  count          = length(var.azs)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# VPC Flow Logs
resource "aws_flow_log" "main" {
  iam_role_arn    = aws_iam_role.flow_log.arn
  log_destination = aws_cloudwatch_log_group.flow_log.arn
  traffic_type    = "ALL"
  vpc_id          = aws_vpc.main.id

  tags = merge(
    {
      Name        = format("%s-flow-log", var.environment)
      Environment = var.environment
      Platform    = "ai-detection"
      Terraform   = "true"
    },
    var.tags
  )
}

# CloudWatch Log Group for VPC Flow Logs
resource "aws_cloudwatch_log_group" "flow_log" {
  name              = "/aws/vpc/${var.environment}-flow-logs"
  retention_in_days = 30

  tags = merge(
    {
      Environment = var.environment
      Platform    = "ai-detection"
      Terraform   = "true"
    },
    var.tags
  )
}

# IAM Role for VPC Flow Logs
resource "aws_iam_role" "flow_log" {
  name = format("%s-vpc-flow-log-role", var.environment)

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "vpc-flow-logs.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(
    {
      Environment = var.environment
      Platform    = "ai-detection"
      Terraform   = "true"
    },
    var.tags
  )
}

# IAM Role Policy for VPC Flow Logs
resource "aws_iam_role_policy" "flow_log" {
  name = format("%s-vpc-flow-log-policy", var.environment)
  role = aws_iam_role.flow_log.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogGroups",
          "logs:DescribeLogStreams"
        ]
        Effect = "Allow"
        Resource = "*"
      }
    ]
  })
}