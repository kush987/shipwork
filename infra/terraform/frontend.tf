# Front Door is the single public entry point, so the SPA and the API share one origin
# (the frontend calls a relative /api):
#   /api/run/*  -> runtime app      (customer traffic, any origin)
#   /api/*      -> api app          (builder APIs)
#   /*          -> storage static website (React build), SPA fallback to /index.html

resource "azurerm_storage_account" "web" {
  name                            = "st${local.flat}"
  location                        = azurerm_resource_group.this.location
  resource_group_name             = azurerm_resource_group.this.name
  account_tier                    = "Standard"
  account_replication_type        = "LRS"
  min_tls_version                 = "TLS1_2"
  allow_nested_items_to_be_public = false
  shared_access_key_enabled       = false
  tags                            = local.tags
}

resource "azurerm_storage_account_static_website" "web" {
  storage_account_id = azurerm_storage_account.web.id
  index_document     = "index.html"
  error_404_document = "index.html"
}

resource "azurerm_role_assignment" "deployer_web_upload" {
  for_each             = local.deployers
  scope                = azurerm_storage_account.web.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = each.value
}

# --- Front Door ------------------------------------------------------------------------------------

resource "azurerm_cdn_frontdoor_profile" "this" {
  name                = "afd-${local.name}"
  resource_group_name = azurerm_resource_group.this.name
  sku_name            = "Standard_AzureFrontDoor"
  tags                = local.tags
}

resource "azurerm_cdn_frontdoor_endpoint" "this" {
  name                     = "${local.name}-${random_string.suffix.result}"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id
  tags                     = local.tags
}

locals {
  origins = {
    api     = { host = azurerm_container_app.this["api"].ingress[0].fqdn, probe = "/api/health" }
    runtime = { host = azurerm_container_app.this["runtime"].ingress[0].fqdn, probe = "/api/health" }
    web     = { host = azurerm_storage_account.web.primary_web_host, probe = "/" }
  }
}

resource "azurerm_cdn_frontdoor_origin_group" "this" {
  for_each                 = local.origins
  name                     = each.key
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id

  load_balancing {}

  health_probe {
    path                = each.value.probe
    protocol            = "Https"
    request_type        = "HEAD"
    interval_in_seconds = 60
  }
}

resource "azurerm_cdn_frontdoor_origin" "this" {
  for_each                       = local.origins
  name                           = each.key
  cdn_frontdoor_origin_group_id  = azurerm_cdn_frontdoor_origin_group.this[each.key].id
  host_name                      = each.value.host
  origin_host_header             = each.value.host
  certificate_name_check_enabled = true
  enabled                        = true
}

# SPA deep links (/workflows/123) have no file extension: serve index.html for them.
resource "azurerm_cdn_frontdoor_rule_set" "spa" {
  name                     = "spa"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id
}

resource "azurerm_cdn_frontdoor_rule" "spa_fallback" {
  name                      = "indexfallback"
  cdn_frontdoor_rule_set_id = azurerm_cdn_frontdoor_rule_set.spa.id
  order                     = 1
  behaviour_on_match        = "Continue"

  conditions {
    request_file_extension {
      operator = "LessThan"
      values   = ["1"]
    }
  }

  actions {
    url_rewrite {
      source_pattern                  = "/"
      destination_path                = "/index.html"
      preserve_unmatched_path_enabled = false
    }
  }
}

locals {
  routes = {
    runtime = { patterns = ["/api/run/*"], rule_sets = [], cache = false }
    api     = { patterns = ["/api/*"], rule_sets = [], cache = false }
    web     = { patterns = ["/*"], rule_sets = [azurerm_cdn_frontdoor_rule_set.spa.id], cache = true }
  }
}

resource "azurerm_cdn_frontdoor_route" "this" {
  for_each                        = local.routes
  name                            = each.key
  cdn_frontdoor_endpoint_id       = azurerm_cdn_frontdoor_endpoint.this.id
  cdn_frontdoor_origin_group_id   = azurerm_cdn_frontdoor_origin_group.this[each.key].id
  cdn_frontdoor_origin_ids        = [azurerm_cdn_frontdoor_origin.this[each.key].id]
  cdn_frontdoor_rule_set_ids      = each.value.rule_sets
  cdn_frontdoor_custom_domain_ids = var.custom_domain != "" ? [azurerm_cdn_frontdoor_custom_domain.this[0].id] : []
  patterns_to_match               = each.value.patterns
  supported_protocols             = ["Http", "Https"]
  https_redirect_enabled          = true
  forwarding_protocol             = "HttpsOnly"
  link_to_default_domain          = true

  # API responses are never cached; static assets are.
  dynamic "cache" {
    for_each = each.value.cache ? [1] : []
    content {
      query_string_caching_behavior = "IgnoreQueryString"
      compression_enabled           = true
      content_types_to_compress     = ["text/html", "text/css", "application/javascript", "application/json", "image/svg+xml"]
    }
  }
}

# --- Optional custom domain ------------------------------------------------------------------------
# After apply, create the DNS records from the outputs (CNAME to the endpoint + _dnsauth TXT).

resource "azurerm_cdn_frontdoor_custom_domain" "this" {
  count                    = var.custom_domain != "" ? 1 : 0
  name                     = replace(var.custom_domain, ".", "-")
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id
  host_name                = var.custom_domain

  tls {
    certificate_type = "ManagedCertificate"
  }
}

resource "azurerm_cdn_frontdoor_custom_domain_association" "this" {
  count                          = var.custom_domain != "" ? 1 : 0
  cdn_frontdoor_custom_domain_id = azurerm_cdn_frontdoor_custom_domain.this[0].id
  cdn_frontdoor_route_ids        = [for r in azurerm_cdn_frontdoor_route.this : r.id]
}
