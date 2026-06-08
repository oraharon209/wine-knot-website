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

resource "cloudflare_zone_settings_override" "tls" {
  zone_id = data.cloudflare_zone.main.id

  settings {
    min_tls_version = "1.2"
    tls_1_3         = "on"
  }
}
