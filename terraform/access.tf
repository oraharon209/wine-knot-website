locals {
  cloudflare_account_id = data.cloudflare_zone.main.account_id
  admin_hostname        = var.cloudflare_zone
  admin_page_uri        = "${local.admin_hostname}/admin.html"
  admin_api_uri         = "${local.admin_hostname}/api/admin/*"
}

# Single Access app so one email OTP session covers both the page and API calls.
resource "cloudflare_zero_trust_access_application" "admin" {
  account_id = local.cloudflare_account_id
  name       = "Wine Knot Admin"
  type       = "self_hosted"
  domain     = local.admin_page_uri

  session_duration     = "24h"
  app_launcher_visible = false

  destinations {
    type = "public"
    uri  = local.admin_page_uri
  }

  destinations {
    type = "public"
    uri  = local.admin_api_uri
  }
}

resource "cloudflare_zero_trust_access_policy" "admin_allowed" {
  account_id     = local.cloudflare_account_id
  application_id = cloudflare_zero_trust_access_application.admin.id
  name           = "Allowed admins — email OTP"
  decision       = "allow"
  precedence     = 1

  include {
    email = var.admin_allowed_emails
  }
}
