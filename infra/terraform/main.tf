data "azurerm_client_config" "current" {}

resource "random_string" "suffix" {
  length  = 4
  upper   = false
  special = false
}

locals {
  name = "${var.project}-${var.environment}"
  # Globally unique names (ACR, Key Vault, storage) allow only letters and digits.
  flat = "${var.project}${var.environment}${random_string.suffix.result}"

  tags = merge({ project = var.project, environment = var.environment, managed_by = "terraform" }, var.tags)

  deployers = toset(concat([data.azurerm_client_config.current.object_id], var.deployer_principal_ids))
}

resource "azurerm_resource_group" "this" {
  name     = "rg-${local.name}"
  location = var.location
  tags     = local.tags
}

resource "azurerm_log_analytics_workspace" "this" {
  name                = "log-${local.name}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.tags
}

# Identity every backend app runs as: pulls images, reads secrets.
resource "azurerm_user_assigned_identity" "apps" {
  name                = "id-${local.name}-apps"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  tags                = local.tags
}

# --- Container registry ----------------------------------------------------------------------------

resource "azurerm_container_registry" "this" {
  name                = "acr${local.flat}"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  sku                 = "Basic"
  admin_enabled       = false
  tags                = local.tags
}

resource "azurerm_role_assignment" "apps_acr_pull" {
  scope                = azurerm_container_registry.this.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_user_assigned_identity.apps.principal_id
}

resource "azurerm_role_assignment" "deployer_acr_push" {
  for_each             = local.deployers
  scope                = azurerm_container_registry.this.id
  role_definition_name = "AcrPush"
  principal_id         = each.value
}
