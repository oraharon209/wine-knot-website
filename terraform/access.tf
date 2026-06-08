locals {
  cloudflare_account_id = data.cloudflare_zone.main.account_id
  admin_hostname        = var.cloudflare_zone
  admin_page_uri        = "${local.admin_hostname}/admin.html"
  admin_api_uri         = "${local.admin_hostname}/api/admin/*"
}

# Email one-time PIN (enable in Zero Trust → Settings → Authentication).
# Dad enters doronchick@gmail.com and receives a code in his inbox.

resource "cloudflare_zero_trust_access_application" "admin_page" {
  account_id = local.cloudflare_account_id
  name       = "Wine Knot Admin Page"
  type       = "self_hosted"
  domain     = local.admin_page_uri

  session_duration     = "24h"
  app_launcher_visible = false

  destinations {
    type = "public"
    uri  = local.admin_page_uri
  }
}

resource "cloudflare_zero_trust_access_application" "admin_api" {
  account_id = local.cloudflare_account_id
  name       = "Wine Knot Admin API"
  type       = "self_hosted"
  domain     = local.admin_api_uri

  session_duration     = "24h"
  app_launcher_visible = false

  destinations {
    type = "public"
    uri  = local.admin_api_uri
  }
}

resource "cloudflare_zero_trust_access_policy" "admin_page_dad" {
  account_id     = local.cloudflare_account_id
  application_id = cloudflare_zero_trust_access_application.admin_page.id
  name           = "Dad only — email OTP"
  decision       = "allow"
  precedence     = 1

  include {
    email = var.admin_allowed_emails
  }
}

resource "cloudflare_zero_trust_access_policy" "admin_api_dad" {
  account_id     = local.cloudflare_account_id
  application_id = cloudflare_zero_trust_access_application.admin_api.id
  name           = "Dad only — email OTP"
  decision       = "allow"
  precedence     = 1

  include {
    email = var.admin_allowed_emails
  }
}
