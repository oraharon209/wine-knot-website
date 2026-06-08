terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    http = {
      source  = "hashicorp/http"
      version = "~> 3.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

check "key_pair_configured" {
  assert {
    condition     = var.key_name != "" || var.ssh_public_key != ""
    error_message = "Set key_name (existing EC2 key pair) or ssh_public_key."
  }
}

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_key_pair" "deploy" {
  count      = var.key_name == "" ? 1 : 0
  key_name   = "${var.project_name}-deploy"
  public_key = var.ssh_public_key

  tags = {
    Name    = "${var.project_name}-deploy"
    Project = var.project_name
  }
}

locals {
  key_name = var.key_name != "" ? var.key_name : aws_key_pair.deploy[0].key_name
}

resource "aws_security_group" "web" {
  name        = "${var.project_name}-web"
  description = "HTTP/HTTPS from Cloudflare only; SSH from admin IP"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description      = "SSH (admin IP only)"
    from_port        = 22
    to_port          = 22
    protocol         = "tcp"
    cidr_blocks      = var.ssh_cidr_blocks
    ipv6_cidr_blocks = []
  }

  ingress {
    description      = "HTTP from Cloudflare"
    from_port        = 80
    to_port          = 80
    protocol         = "tcp"
    cidr_blocks      = local.cloudflare_ipv4_cidrs
    ipv6_cidr_blocks = local.cloudflare_ipv6_cidrs
  }

  ingress {
    description      = "HTTPS from Cloudflare"
    from_port        = 443
    to_port          = 443
    protocol         = "tcp"
    cidr_blocks      = local.cloudflare_ipv4_cidrs
    ipv6_cidr_blocks = local.cloudflare_ipv6_cidrs
  }

  dynamic "ingress" {
    for_each = var.http_port != 80 && var.http_port != 443 ? [var.http_port] : []
    content {
      description      = "Custom nginx port from Cloudflare"
      from_port        = ingress.value
      to_port          = ingress.value
      protocol         = "tcp"
      cidr_blocks      = local.cloudflare_ipv4_cidrs
      ipv6_cidr_blocks = local.cloudflare_ipv6_cidrs
    }
  }

  egress {
    from_port        = 0
    to_port          = 0
    protocol         = "-1"
    cidr_blocks      = ["0.0.0.0/0"]
    ipv6_cidr_blocks = ["::/0"]
  }

  tags = {
    Name    = "${var.project_name}-web"
    Project = var.project_name
  }
}

resource "aws_instance" "web" {
  ami                         = data.aws_ami.ubuntu.id
  instance_type               = var.instance_type
  key_name                    = local.key_name
  vpc_security_group_ids      = [aws_security_group.web.id]
  subnet_id                   = data.aws_subnets.default.ids[0]
  iam_instance_profile        = aws_iam_instance_profile.ec2.name
  associate_public_ip_address = true

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
  }

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    aws_region           = var.aws_region
    project_name         = var.project_name
    git_repo_url         = var.git_repo_url
    http_port            = var.http_port
    swap_size_gb         = var.swap_size_gb
    cloudflare_zone      = var.cloudflare_zone
    cloudflare_subdomain = var.cloudflare_subdomain
    cloudflare_proxied   = var.cloudflare_proxied
    s3_bucket            = aws_s3_bucket.wine_images.bucket
    s3_public_base_url   = local.s3_public_base_url
  })

  root_block_device {
    volume_size = var.root_volume_size_gb
    volume_type = "gp3"
    encrypted   = true
  }

  tags = {
    Name    = "${var.project_name}-web"
    Project = var.project_name
  }

  lifecycle {
    ignore_changes = [ami]
  }
}

resource "aws_eip" "web" {
  instance = aws_instance.web.id
  domain   = "vpc"

  tags = {
    Name    = "${var.project_name}-web"
    Project = var.project_name
  }
}
