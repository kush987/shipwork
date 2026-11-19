# One image, three planes (backend/src/config/planes.ts):
#   api     — builder/control-plane APIs + Swagger        (behind Front Door: /api/*)
#   runtime — data plane only: /api/run/* and /api/health (behind Front Door: /api/run/*)
#   worker  — BullMQ workers, schedules, domain events     (no ingress)

resource "azurerm_container_app_environment" "this" {
  name                       = "cae-${local.name}"
  location                   = azurerm_resource_group.this.location
  resource_group_name        = azurerm_resource_group.this.name
  infrastructure_subnet_id   = azurerm_subnet.apps.id
  log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id
  logs_destination           = "log-analytics"
  tags                       = local.tags

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }

  depends_on = [azurerm_subnet_nat_gateway_association.apps]
}

locals {
  image = "${azurerm_container_registry.this.login_server}/${var.project}-backend:${var.image_tag}"

  frontend_origins = compact([
    "https://${azurerm_cdn_frontdoor_endpoint.this.host_name}",
    var.custom_domain != "" ? "https://${var.custom_domain}" : "",
  ])

  common_env = merge({
    PORT                        = "3000"
    REDIS_HOST                  = azurerm_managed_redis.this.hostname
    REDIS_PORT                  = tostring(azurerm_managed_redis.this.default_database[0].port)
    REDIS_TLS                   = "true"
    TRUST_PROXY                 = "true" # behind Front Door
    CORS_ORIGINS                = join(",", local.frontend_origins)
    ALLOW_SIGNUP                = tostring(var.allow_signup)
    PLATFORM_ADMIN_EMAILS       = join(",", var.platform_admin_emails)
    WORKER_CONCURRENCY          = tostring(var.worker_concurrency)
    EVENT_CONCURRENCY           = tostring(var.event_concurrency)
    HTTP_ALLOW_PRIVATE_NETWORKS = "false"
    ALLOW_PRIVATE_DB_HOSTS      = "false"
  }, var.app_settings)

  # env var -> Key Vault secret name
  secret_env = merge({
    MONGO_URI           = "mongo-uri"
    REDIS_PASSWORD      = "redis-password"
    DATA_ENCRYPTION_KEY = "data-encryption-key"
    WEBHOOK_SECRET      = "webhook-secret"
    OPS_TOKEN           = "ops-token"
  }, local.has_business_mongo ? { BUSINESS_MONGO_URI = "business-mongo-uri" } : {})

  http_apps = toset(["api", "runtime"])
}

resource "azurerm_container_app" "this" {
  for_each = var.apps

  name                         = "ca-${local.name}-${each.key}"
  container_app_environment_id = azurerm_container_app_environment.this.id
  resource_group_name          = azurerm_resource_group.this.name
  revision_mode                = "Single"
  workload_profile_name        = "Consumption"
  tags                         = local.tags

  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.apps.id]
  }

  registry {
    server   = azurerm_container_registry.this.login_server
    identity = azurerm_user_assigned_identity.apps.id
  }

  dynamic "secret" {
    for_each = local.secret_env
    content {
      name                = secret.value
      identity            = azurerm_user_assigned_identity.apps.id
      key_vault_secret_id = azurerm_key_vault_secret.this[secret.value].versionless_id
    }
  }

  dynamic "ingress" {
    for_each = contains(local.http_apps, each.key) ? [1] : []
    content {
      external_enabled = true
      target_port      = 3000
      transport        = "auto"
      traffic_weight {
        latest_revision = true
        percentage      = 100
      }
    }
  }

  template {
    min_replicas                     = each.value.min_replicas
    max_replicas                     = each.value.max_replicas
    termination_grace_period_seconds = 60

    container {
      name   = "backend"
      image  = local.image
      cpu    = each.value.cpu
      memory = each.value.memory

      env {
        name  = "APP_ROLE"
        value = each.key
      }
      env {
        name  = "SANDBOX_THREADS"
        value = tostring(each.value.sandbox_threads)
      }
      dynamic "env" {
        for_each = local.common_env
        content {
          name  = env.key
          value = env.value
        }
      }
      dynamic "env" {
        for_each = local.secret_env
        content {
          name        = env.key
          secret_name = env.value
        }
      }

      dynamic "startup_probe" {
        for_each = contains(local.http_apps, each.key) ? [1] : []
        content {
          transport               = "HTTP"
          port                    = 3000
          path                    = "/api/health"
          interval_seconds        = 5
          failure_count_threshold = 30
        }
      }
      dynamic "liveness_probe" {
        for_each = contains(local.http_apps, each.key) ? [1] : []
        content {
          transport = "HTTP"
          port      = 3000
          path      = "/api/health"
        }
      }
      dynamic "readiness_probe" {
        for_each = contains(local.http_apps, each.key) ? [1] : []
        content {
          transport = "HTTP"
          port      = 3000
          path      = "/api/health"
        }
      }
    }

    # HTTP planes scale on concurrent requests; workers on CPU (steps are CPU + I/O).
    dynamic "http_scale_rule" {
      for_each = contains(local.http_apps, each.key) ? [1] : []
      content {
        name                = "http"
        concurrent_requests = tostring(var.runtime_concurrent_requests)
      }
    }
    dynamic "custom_scale_rule" {
      for_each = contains(local.http_apps, each.key) ? [] : [1]
      content {
        name             = "cpu"
        custom_rule_type = "cpu"
        metadata = {
          type  = "Utilization"
          value = "70"
        }
      }
    }
  }

  lifecycle {
    # GitHub Actions rolls out new images; Terraform must not roll them back.
    ignore_changes = [template[0].container[0].image]
  }

  depends_on = [
    azurerm_role_assignment.apps_acr_pull,
    azurerm_role_assignment.apps_kv_user,
    azurerm_private_endpoint.redis,
  ]
}
