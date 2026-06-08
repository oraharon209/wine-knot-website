data "http" "cloudflare_ipv4" {
  url = "https://www.cloudflare.com/ips-v4"

  lifecycle {
    postcondition {
      condition     = self.status_code == 200
      error_message = "Failed to fetch Cloudflare IPv4 ranges"
    }
  }
}

data "http" "cloudflare_ipv6" {
  url = "https://www.cloudflare.com/ips-v6"

  lifecycle {
    postcondition {
      condition     = self.status_code == 200
      error_message = "Failed to fetch Cloudflare IPv6 ranges"
    }
  }
}

locals {
  cloudflare_ipv4_cidrs = [for cidr in split("\n", chomp(data.http.cloudflare_ipv4.response_body)) : cidr if cidr != ""]
  cloudflare_ipv6_cidrs = [for cidr in split("\n", chomp(data.http.cloudflare_ipv6.response_body)) : cidr if cidr != ""]
}

data "cloudflare_zone" "main" {
  name = var.cloudflare_zone
}

resource "cloudflare_record" "apex" {
  zone_id = data.cloudflare_zone.main.id
  name    = var.cloudflare_subdomain == "@" ? "@" : var.cloudflare_subdomain
  content = aws_eip.web.public_ip
  type    = "A"
  proxied = var.cloudflare_proxied
  ttl     = 1
}

# cloudflare_zone_settings_override fails on destroy (read-only prefetch_preload).
# TLS/HSTS is applied via scripts/configure_cloudflare_ssl.sh after apply.
removed {
  from = cloudflare_zone_settings_override.tls

  lifecycle {
    destroy = false
  }
}

resource "terraform_data" "cloudflare_tls" {
  input = {
    zone = var.cloudflare_zone
  }

  provisioner "local-exec" {
    command     = "bash ${path.module}/../scripts/configure_cloudflare_ssl.sh ${var.cloudflare_zone}"
    environment = {
      CF_API_TOKEN = var.cloudflare_api_token
    }
  }
}
