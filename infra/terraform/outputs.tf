output "url" {
  value = var.custom_domain != "" ? "https://${var.custom_domain}" : "https://${azurerm_cdn_frontdoor_endpoint.this.host_name}"
}

# --- Read by the deploy workflow (terraform output -json) -------------------------------------------

output "resource_group" {
  value = azurerm_resource_group.this.name
}

output "acr_name" {
  value = azurerm_container_registry.this.name
}

output "acr_login_server" {
  value = azurerm_container_registry.this.login_server
}

output "image_repository" {
  value = "${var.project}-backend"
}

output "container_apps" {
  value = { for k, v in azurerm_container_app.this : k => v.name }
}

output "web_storage_account" {
  value = azurerm_storage_account.web.name
}

output "frontdoor_profile" {
  value = azurerm_cdn_frontdoor_profile.this.name
}

output "frontdoor_endpoint" {
  value = azurerm_cdn_frontdoor_endpoint.this.name
}

# --- Operations ------------------------------------------------------------------------------------

output "key_vault_name" {
  value = azurerm_key_vault.this.name
}

output "outbound_ip" {
  description = "All backend traffic leaves from this IP (allow-list it on external databases/APIs)."
  value       = azurerm_public_ip.nat.ip_address
}

output "custom_domain_dns" {
  description = "DNS records to create for the custom domain."
  value = var.custom_domain == "" ? null : {
    cname = { name = var.custom_domain, value = azurerm_cdn_frontdoor_endpoint.this.host_name }
    txt   = { name = "_dnsauth.${var.custom_domain}", value = azurerm_cdn_frontdoor_custom_domain.this[0].validation_token }
  }
}

# --- Realtime --------------------------------------------------------------------------------------

output "realtime_url" {
  description = "WebSocket URL for the Centrifugo client SDK (null until realtime_tenant is set)."
  value       = local.realtime_enabled ? "wss://${azurerm_container_app.centrifugo[0].ingress[0].fqdn}/connection/websocket" : null
}

output "realtime_publish_url" {
  description = "URL for workflows' HTTP request step (header X-API-Key = Key Vault secret centrifugo-api-key)."
  value       = local.realtime_enabled ? "https://${azurerm_container_app.centrifugo[0].ingress[0].fqdn}/api/publish" : null
}
