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
