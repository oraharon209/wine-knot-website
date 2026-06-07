variable "aws_region" {
  description = "AWS region for all resources (e.g. eu-west-1 for Israel-adjacent latency)"
  type        = string
  default     = "eu-west-1"
}

variable "project_name" {
  description = "Prefix for resource names and tags"
  type        = string
  default     = "wine-knot"
}

variable "instance_type" {
  description = "EC2 instance type. t3.small is recommended for Docker + MySQL; t3.micro works for very low traffic."
  type        = string
  default     = "t3.small"
}

variable "ssh_public_key" {
  description = "Contents of your SSH public key (~/.ssh/id_ed25519.pub or id_rsa.pub)"
  type        = string
}

variable "ssh_cidr_blocks" {
  description = "CIDR blocks allowed to SSH into the instance. Restrict to your home IP for security."
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "http_port" {
  description = "Host port mapped to nginx (must match HTTP_PORT in .env on the server)"
  type        = number
  default     = 80
}

variable "root_volume_size_gb" {
  description = "Root EBS volume size in GB (images + MySQL data need some headroom)"
  type        = number
  default     = 20
}
