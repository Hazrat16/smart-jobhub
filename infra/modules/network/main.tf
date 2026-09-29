# Public subnets only, no NAT gateway (cost decision in PLAN.md). Tasks get a
# public IP for outbound traffic, and their security groups accept ingress only
# from the ALB.

data "aws_availability_zones" "available" {
  # checkov:skip=CKV_AWS_394:Only the first two regular AZs are used, sorted by name, so new AZs don't move subnets.
  state = "available"

  # Regular AZs only: no Local or Wavelength Zones, which the ALB and Fargate don't fully support.
  filter {
    name   = "opt-in-status"
    values = ["opt-in-not-required"]
  }
}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, var.az_count)
}

resource "aws_vpc" "this" {
  # checkov:skip=CKV2_AWS_11:VPC flow logs cost more than the rest of staging's logging; revisit in step 8.
  cidr_block           = var.cidr_block
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = var.name }
}

# Take over the default security group and strip its rules so nothing can use it by accident.
resource "aws_default_security_group" "this" {
  vpc_id = aws_vpc.this.id

  tags = { Name = "${var.name}-default-unused" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id

  tags = { Name = var.name }
}

resource "aws_subnet" "public" {
  # checkov:skip=CKV_AWS_130:Public IPs on launch are the no-NAT design; the task security groups only allow the ALB in.
  count = length(local.azs)

  vpc_id                  = aws_vpc.this.id
  availability_zone       = local.azs[count.index]
  cidr_block              = cidrsubnet(var.cidr_block, 4, count.index)
  map_public_ip_on_launch = true

  tags = { Name = "${var.name}-public-${local.azs[count.index]}" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }

  tags = { Name = "${var.name}-public" }
}

resource "aws_route_table_association" "public" {
  count = length(aws_subnet.public)

  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}
