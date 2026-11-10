environment = "staging"
# subscription_id and atlas_org_id come from TF_VAR_* (GitHub variables), not this file.
location = "centralindia"

atlas_region        = "INDIA_CENTRAL"
atlas_instance_size = "M10"

redis_sku               = "Balanced_B0"
redis_high_availability = false

apps = {
  api     = { cpu = 0.5, memory = "1Gi", min_replicas = 1, max_replicas = 2, sandbox_threads = 1 }
  runtime = { cpu = 0.5, memory = "1Gi", min_replicas = 1, max_replicas = 3, sandbox_threads = 1 }
  worker  = { cpu = 0.5, memory = "1Gi", min_replicas = 1, max_replicas = 3, sandbox_threads = 1 }
}

allow_signup          = true
platform_admin_emails = []

# Realtime (centrifugo.tf). Set realtime_tenant to the workspace id after the first owner exists, then apply.
realtime_tenant     = ""
realtime_namespaces = ["orders"]
realtime_replicas   = { min = 1, max = 2 }
