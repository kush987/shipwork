# Azure Managed Redis (Azure Cache for Redis no longer accepts new instances).
# BullMQ needs: no clustering (its Lua scripts touch many keys) and no eviction (jobs are durable data).

resource "azurerm_managed_redis" "this" {
  name                      = "redis-${local.name}-${random_string.suffix.result}"
  location                  = azurerm_resource_group.this.location
  resource_group_name       = azurerm_resource_group.this.name
  sku_name                  = var.redis_sku
  high_availability_enabled = var.redis_high_availability
  public_network_access     = "Disabled"
  tags                      = local.tags

  default_database {
    access_keys_authentication_enabled = true
    client_protocol                    = "Encrypted"
    clustering_policy                  = "NoCluster"
    eviction_policy                    = "NoEviction"
    # Queues survive a restart.
    persistence_append_only_file_backup_frequency = "1s"
  }
}

resource "azurerm_private_dns_zone" "redis" {
  name                = "privatelink.redis.azure.net"
  resource_group_name = azurerm_resource_group.this.name
  tags                = local.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "redis" {
  name                = "redis"
  private_dns_zone_id = azurerm_private_dns_zone.redis.id
  virtual_network_id  = azurerm_virtual_network.this.id
}

resource "azurerm_private_endpoint" "redis" {
  name                = "pe-${local.name}-redis"
  location            = azurerm_resource_group.this.location
  resource_group_name = azurerm_resource_group.this.name
  subnet_id           = azurerm_subnet.private_endpoints.id
  tags                = local.tags

  private_service_connection {
    name                           = "redis"
    private_connection_resource_id = azurerm_managed_redis.this.id
    subresource_names              = ["redisEnterprise"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "redis"
    private_dns_zone_ids = [azurerm_private_dns_zone.redis.id]
  }
}
