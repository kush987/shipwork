environment = "prod"
# subscription_id and atlas_org_id come from TF_VAR_* (GitHub variables), not this file.
location = "centralindia"

atlas_region        = "INDIA_CENTRAL"
atlas_instance_size = "M30"

redis_sku               = "Balanced_B3"
redis_high_availability = true

apps = {
  api     = { cpu = 0.5, memory = "1Gi", min_replicas = 2, max_replicas = 4, sandbox_threads = 1 }
  runtime = { cpu = 1, memory = "2Gi", min_replicas = 2, max_replicas = 20, sandbox_threads = 2 }
  worker  = { cpu = 1, memory = "2Gi", min_replicas = 2, max_replicas = 20, sandbox_threads = 2 }
}

allow_signup          = false
platform_admin_emails = []
custom_domain         = "" # e.g. app.example.com
