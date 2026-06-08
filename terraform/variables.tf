variable "aws_region" {
  description = "AWS region (your current instance is in eu-north-1)"
  type        = string
  default     = "eu-north-1"
}

variable "project_name" {
  description = "Prefix for resource names, SSM paths, and tags"
  type        = string
  default     = "wine-knot"
}

variable "instance_type" {
  description = "EC2 instance type. t3.micro is enough for this site (use swap)."
  type        = string
  default     = "t3.micro"
}

variable "ssh_public_key" {
  description = "SSH public key for the Terraform-managed EC2 key pair (cat ~/.ssh/id_ed25519.pub)"
  type        = string
}

variable "ssh_cidr_blocks" {
  description = "CIDR blocks allowed to SSH (your IP only — Cloudflare does not proxy SSH)"
  type        = list(string)
}

variable "http_port" {
  description = "Host port mapped to nginx (HTTP_PORT in .env)"
  type        = number
  default     = 80
}

variable "root_volume_size_gb" {
  description = "Root EBS volume size in GB"
  type        = number
  default     = 20
}

variable "git_repo_url" {
  description = "Public git URL to clone on first boot"
  type        = string
  default     = "https://github.com/oraharon209/wine-knot-website.git"
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token for Terraform DNS — set in terraform.tfvars (never commit)"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone" {
  description = "Cloudflare zone managed by Terraform"
  type        = string
  default     = "wineknot.co.il"
}

variable "cloudflare_subdomain" {
  description = "DNS record name (@ for apex)"
  type        = string
  default     = "@"
}

variable "cloudflare_proxied" {
  description = "Whether the Cloudflare DNS record is proxied (must be true for Cloudflare-only SG to work for visitors)"
  type        = bool
  default     = true
}

variable "admin_password" {
  description = "Admin panel password. Leave empty to auto-generate and store in SSM only."
  type        = string
  sensitive   = true
  default     = ""
}

variable "swap_size_gb" {
  description = "Swap file size in GB (helps on t3.micro)"
  type        = number
  default     = 1
}
