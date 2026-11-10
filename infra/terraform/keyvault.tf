# Every secret the backend reads lives here; the apps reference them through their managed identity.

resource "azurerm_key_vault" "this" {
  name                       = "kv-${local.flat}"
  location                   = azurerm_resource_group.this.location
  resource_group_name        = azurerm_resource_group.this.name
  tenant_id                  = data.azurerm_client_config.current.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = true
  purge_protection_enabled   = var.environment == "prod"
  soft_delete_retention_days = 30
  tags                       = local.tags
}

resource "azurerm_role_assignment" "deployer_kv_officer" {
  for_each             = local.deployers
  scope                = azurerm_key_vault.this.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = each.value
}

resource "azurerm_role_assignment" "apps_kv_user" {
  scope                = azurerm_key_vault.this.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.apps.principal_id
}

# --- Generated secrets -----------------------------------------------------------------------------

# Encrypts workspace database connection strings and auth-provider secrets.
# NEVER rotate or lose this value: data encrypted with it becomes unreadable.
resource "random_bytes" "data_encryption_key" {
  length = 32
  lifecycle { prevent_destroy = true }
}

resource "random_password" "webhook_secret" {
  length  = 48
  special = false
}

resource "random_password" "ops_token" {
  length  = 48
  special = false
}

locals {
  secrets = merge({
    "mongo-uri"           = local.mongo_uri
    "redis-password"      = azurerm_managed_redis.this.default_database[0].primary_access_key
    "data-encryption-key" = random_bytes.data_encryption_key.base64
    "webhook-secret"      = random_password.webhook_secret.result
    "ops-token"           = random_password.ops_token.result
    }, local.has_business_mongo ? { "business-mongo-uri" = local.business_mongo_uri } : {}
  )
  has_business_mongo = var.create_atlas_cluster || var.business_mongo_uri != ""
}

resource "azurerm_key_vault_secret" "this" {
  for_each     = nonsensitive(toset(keys(local.secrets)))
  name         = each.key
  value        = local.secrets[each.key]
  key_vault_id = azurerm_key_vault.this.id

  depends_on = [azurerm_role_assignment.deployer_kv_officer]
}
