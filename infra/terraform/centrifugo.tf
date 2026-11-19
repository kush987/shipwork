# Realtime (WebSocket) server: Centrifugo, next to the backend in the same Container Apps environment.
#
#   browser ══ wss://<fqdn>/connection/websocket ══► centrifugo ──connect / subscribe / rpc hooks──►
#       runtime /api/run/<realtime_tenant>/ws/{connect,subscribe,rpc}  (endpoints + workflows built in ShipFlow)
#   workflows ── HTTP request step ── POST https://<fqdn>/api/publish (X-API-Key) ──► centrifugo ──► browsers
#
# Off until `realtime_tenant` is set (the workspace exists only after the first owner is created).
# Redis: the existing Managed Redis (own key prefix), so replicas share connections/channels — no sticky sessions.
# Option names below are Centrifugo v6 (env = CENTRIFUGO_ + config path with "_"), checked against v6.10.3.

resource "random_password" "centrifugo_api_key" {
  count   = local.realtime_enabled ? 1 : 0
  length  = 48
  special = false
}

resource "azurerm_key_vault_secret" "centrifugo_api_key" {
  count        = local.realtime_enabled ? 1 : 0
  name         = "centrifugo-api-key"
  value        = random_password.centrifugo_api_key[0].result
  key_vault_id = azurerm_key_vault.this.id

  depends_on = [azurerm_role_assignment.deployer_kv_officer]
}

locals {
  realtime_enabled = var.realtime_tenant != ""

  # Hooks call the runtime app directly (not through Front Door).
  realtime_hooks = "https://${azurerm_container_app.this["runtime"].ingress[0].fqdn}/api/run/${var.realtime_tenant}/ws"

  # Browsers can't set headers on a WebSocket: the SDK sends `headers: { Authorization }` inside the connect
  # frame (header emulation). The runtime's JWT endpoint auth verifies it, so forwarding it is safe.
  realtime_auth_headers = "Authorization"

  # ShipFlow answers a bad/missing token with 401; make that a terminal disconnect instead of a retry loop.
  realtime_status_transforms = jsonencode([
    { status_code = 401, to_disconnect = { code = 4501, reason = "unauthorized" } },
    { status_code = 403, to_disconnect = { code = 4503, reason = "forbidden" } },
  ])

  centrifugo_env = {
    CENTRIFUGO_HEALTH_ENABLED = "true"

    CENTRIFUGO_ENGINE_TYPE              = "redis"
    CENTRIFUGO_ENGINE_REDIS_ADDRESS     = "${azurerm_managed_redis.this.hostname}:${azurerm_managed_redis.this.default_database[0].port}"
    CENTRIFUGO_ENGINE_REDIS_TLS_ENABLED = "true"
    CENTRIFUGO_ENGINE_REDIS_PREFIX      = "centrifugo" # apart from BullMQ's keys

    CENTRIFUGO_CLIENT_ALLOWED_ORIGINS = join(" ", local.frontend_origins)

    CENTRIFUGO_CLIENT_PROXY_CONNECT_ENABLED                        = "true"
    CENTRIFUGO_CLIENT_PROXY_CONNECT_ENDPOINT                       = "${local.realtime_hooks}/connect"
    CENTRIFUGO_CLIENT_PROXY_CONNECT_TIMEOUT                        = "5s"
    CENTRIFUGO_CLIENT_PROXY_CONNECT_HTTP_HEADERS                   = local.realtime_auth_headers
    CENTRIFUGO_CLIENT_PROXY_CONNECT_EMULATED_HEADERS               = local.realtime_auth_headers
    CENTRIFUGO_CLIENT_PROXY_CONNECT_HTTP_STATUS_TO_CODE_TRANSFORMS = local.realtime_status_transforms

    CENTRIFUGO_RPC_PROXY_ENDPOINT                       = "${local.realtime_hooks}/rpc"
    CENTRIFUGO_RPC_PROXY_TIMEOUT                        = "10s"
    CENTRIFUGO_RPC_PROXY_HTTP_HEADERS                   = local.realtime_auth_headers
    CENTRIFUGO_RPC_PROXY_EMULATED_HEADERS               = local.realtime_auth_headers
    CENTRIFUGO_RPC_PROXY_HTTP_STATUS_TO_CODE_TRANSFORMS = local.realtime_status_transforms
    CENTRIFUGO_RPC_WITHOUT_NAMESPACE_PROXY_ENABLED      = "true"

    CENTRIFUGO_CHANNEL_PROXY_SUBSCRIBE_ENDPOINT                       = "${local.realtime_hooks}/subscribe"
    CENTRIFUGO_CHANNEL_PROXY_SUBSCRIBE_TIMEOUT                        = "5s"
    CENTRIFUGO_CHANNEL_PROXY_SUBSCRIBE_HTTP_HEADERS                   = local.realtime_auth_headers
    CENTRIFUGO_CHANNEL_PROXY_SUBSCRIBE_EMULATED_HEADERS               = local.realtime_auth_headers
    CENTRIFUGO_CHANNEL_PROXY_SUBSCRIBE_HTTP_STATUS_TO_CODE_TRANSFORMS = local.realtime_status_transforms
    CENTRIFUGO_CHANNEL_WITHOUT_NAMESPACE_SUBSCRIBE_PROXY_ENABLED      = "true"
    # "orders:o_123" is channel o_123 in namespace "orders": every prefix used before ":" must be listed.
    CENTRIFUGO_CHANNEL_NAMESPACES = jsonencode([
      for ns in var.realtime_namespaces : { name = ns, subscribe_proxy_enabled = true }
    ])
  }
}

resource "azurerm_container_app" "centrifugo" {
  count = local.realtime_enabled ? 1 : 0

  name                         = "ca-${local.name}-centrifugo"
  container_app_environment_id = azurerm_container_app_environment.this.id
  resource_group_name          = azurerm_resource_group.this.name
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.apps.id]
  }

  secret {
    name                = "centrifugo-api-key"
    identity            = azurerm_user_assigned_identity.apps.id
    key_vault_secret_id = azurerm_key_vault_secret.centrifugo_api_key[0].versionless_id
  }
  secret {
    name                = "redis-password"
    identity            = azurerm_user_assigned_identity.apps.id
    key_vault_secret_id = azurerm_key_vault_secret.this["redis-password"].versionless_id
  }

  ingress {
    external_enabled = true # clients connect here directly; /api/publish is guarded by the API key
    target_port      = 8000
    transport        = "auto" # passes WebSocket upgrades through
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }

  template {
    # Never scale to zero: open sockets need a live replica. Scale-in drops sockets; the SDK reconnects.
    min_replicas                     = var.realtime_replicas.min
    max_replicas                     = var.realtime_replicas.max
    termination_grace_period_seconds = 30

    container {
      name    = "centrifugo"
      image   = "docker.io/centrifugo/centrifugo:${var.centrifugo_version}"
      command = ["centrifugo"]
      cpu     = var.realtime_cpu
      memory  = var.realtime_memory

      dynamic "env" {
        for_each = local.centrifugo_env
        content {
          name  = env.key
          value = env.value
        }
      }
      env {
        name        = "CENTRIFUGO_ENGINE_REDIS_PASSWORD"
        secret_name = "redis-password"
      }
      env {
        name        = "CENTRIFUGO_HTTP_API_KEY"
        secret_name = "centrifugo-api-key"
      }

      startup_probe {
        transport               = "HTTP"
        port                    = 8000
        path                    = "/health"
        interval_seconds        = 5
        failure_count_threshold = 30
      }
      liveness_probe {
        transport = "HTTP"
        port      = 8000
        path      = "/health"
      }
      readiness_probe {
        transport = "HTTP"
        port      = 8000
        path      = "/health"
      }
    }

    # Open WebSockets don't show up as concurrent HTTP requests; CPU tracks connection/message load.
    custom_scale_rule {
      name             = "cpu"
      custom_rule_type = "cpu"
      metadata = {
        type  = "Utilization"
        value = "70"
      }
    }
  }

  depends_on = [
    azurerm_role_assignment.apps_kv_user,
    azurerm_private_endpoint.redis,
  ]
}
