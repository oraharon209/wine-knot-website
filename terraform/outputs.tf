output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.web.id
}

output "public_ip" {
  description = "Elastic IP — point your domain or Cloudflare DDNS here"
  value       = aws_eip.web.public_ip
}

output "ssh_command" {
  description = "SSH into the server as ec2-user"
  value       = "ssh -i ~/.ssh/YOUR_PRIVATE_KEY ec2-user@${aws_eip.web.public_ip}"
}

output "website_url" {
  description = "URL to open after deploying docker compose"
  value       = "http://${aws_eip.web.public_ip}:${var.http_port}"
}
