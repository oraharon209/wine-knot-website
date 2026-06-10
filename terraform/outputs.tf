output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.web.id
}

output "public_ip" {
  description = "Elastic IP — Terraform points your Cloudflare DNS record here"
  value       = aws_eip.web.public_ip
}

output "ssh_command" {
  description = "SSH into the server (must come from an IP in ssh_cidr_blocks)"
  value       = "ssh -i ~/.ssh/id_ed25519 ubuntu@${aws_eip.web.public_ip}"
}

output "key_pair_name" {
  description = "Terraform-managed EC2 key pair (matches ssh_public_key in tfvars)"
  value       = aws_key_pair.deploy.key_name
}

output "website_url" {
  description = "Site URL via Cloudflare (orange-cloud proxied DNS required)"
  value       = "https://${var.cloudflare_zone}"
}

output "admin_panel_url" {
  description = "Admin panel URL (protected by Cloudflare Access email OTP)"
  value       = "https://${var.cloudflare_zone}/admin.html"
}

output "admin_access_emails" {
  description = "Emails allowed through Cloudflare Access for admin"
  value       = var.admin_allowed_emails
}

output "ssm_admin_password_path" {
  description = "SSM path for admin password (retrieve with aws ssm get-parameter --with-decryption)"
  value       = aws_ssm_parameter.admin_password.name
}

output "ssm_cloudflare_token_path" {
  description = "SSM path for Cloudflare API token"
  value       = aws_ssm_parameter.cloudflare_api_token.name
}

output "admin_password" {
  description = "Admin password (only shown once — also stored in SSM)"
  value       = local.admin_password_value
  sensitive   = true
}

output "retrieve_secrets_command" {
  description = "How to read secrets from SSM after apply"
  value       = "aws ssm get-parameter --region ${var.aws_region} --name /${var.project_name}/admin_password --with-decryption --query Parameter.Value --output text"
}

output "s3_bucket" {
  description = "S3 bucket for wine bottle images"
  value       = aws_s3_bucket.wine_images.bucket
}

output "s3_images_base_url" {
  description = "Public base URL for wine images (uploads go to /wines/)"
  value       = local.s3_public_base_url
}

output "github_actions_access_key_id" {
  description = "Add to GitHub repo secret AWS_ACCESS_KEY_ID"
  value       = aws_iam_access_key.github_actions_deploy.id
}

output "github_actions_secret_access_key" {
  description = "Add to GitHub repo secret AWS_SECRET_ACCESS_KEY (shown once)"
  value       = aws_iam_access_key.github_actions_deploy.secret
  sensitive   = true
}

output "github_actions_ec2_instance_id" {
  description = "Add to GitHub repo secret EC2_INSTANCE_ID"
  value       = aws_instance.web.id
}
