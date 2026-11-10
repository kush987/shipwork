variable "subscription_id" {
  description = "Azure subscription to deploy into."
  type        = string
}

variable "environment" {
  description = "Environment name (staging, prod). Part of every resource name."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9]{2,8}$", var.environment))
    error_message = "Use 2-8 lowercase letters/digits."
  }
}

variable "project" {
  description = "Short project name used in resource names."
  type        = string
  default     = "shipflow"
}

variable "location" {
  description = "Azure region."
  type        = string
  default     = "centralindia"
}

variable "tags" {
  type    = map(string)
  default = {}
}

# --- Network ---------------------------------------------------------------------------------------

variable "vnet_cidr" {
  type    = string
  default = "10.40.0.0/16"
}

# --- Backend containers ----------------------------------------------------------------------------

variable "image_tag" {
  description = "Backend image tag in ACR used when Terraform creates the apps. Later deploys come from GitHub Actions (Terraform ignores image changes)."
  type        = string
  default     = "latest"
}

variable "apps" {
  description = "Sizing per plane. cpu/memory per replica; sandbox_threads should be about cpu cores (user-code threads)."
  type = map(object({
    cpu             = number
    memory          = string
    min_replicas    = number
    max_replicas    = number
    sandbox_threads = number
  }))
  default = {
    api     = { cpu = 0.5, memory = "1Gi", min_replicas = 1, max_replicas = 3, sandbox_threads = 1 }
    runtime = { cpu = 1, memory = "2Gi", min_replicas = 1, max_replicas = 10, sandbox_threads = 2 }
    worker  = { cpu = 1, memory = "2Gi", min_replicas = 1, max_replicas = 10, sandbox_threads = 2 }
  }
}

variable "runtime_concurrent_requests" {
  description = "Concurrent HTTP requests per runtime replica before scaling out."
  type        = number
  default     = 50
}

variable "worker_concurrency" {
  type    = number
  default = 10
}

variable "event_concurrency" {
  type    = number
  default = 20
}

variable "app_settings" {
  description = "Extra non-secret environment variables for every backend app (see backend/.env.example)."
  type        = map(string)
  default     = {}
}

variable "allow_signup" {
  type    = bool
  default = false
}

variable "platform_admin_emails" {
  description = "Emails allowed to change platform-wide settings (couriers)."
  type        = list(string)
  default     = []
}

variable "custom_domain" {
  description = "Optional custom host name (e.g. app.example.com) on Front Door. Empty: use the *.azurefd.net host."
  type        = string
  default     = ""
}

# --- Redis -----------------------------------------------------------------------------------------

variable "redis_sku" {
  description = "Azure Managed Redis SKU (Balanced_B0 is the smallest)."
  type        = string
  default     = "Balanced_B0"
}

variable "redis_high_availability" {
  type    = bool
  default = false
}

# --- MongoDB ---------------------------------------------------------------------------------------

variable "create_atlas_cluster" {
  description = "Create a MongoDB Atlas cluster on Azure. false: supply mongo_uri yourself (any replica set)."
  type        = bool
  default     = true
}

variable "atlas_org_id" {
  type    = string
  default = ""
}

variable "atlas_region" {
  description = "Atlas region name for Azure (INDIA_CENTRAL matches centralindia)."
  type        = string
  default     = "INDIA_CENTRAL"
}

variable "atlas_instance_size" {
  description = "Atlas tier (M10 and up: dedicated, backups, change streams, transactions)."
  type        = string
  default     = "M10"
}

variable "mongo_uri" {
  description = "Used only when create_atlas_cluster = false: connection string incl. database, e.g. mongodb+srv://u:p@host/shipflow."
  type        = string
  default     = ""
  sensitive   = true
}

variable "business_mongo_uri" {
  description = "Optional separate server for workspace databases (no database name). Empty: same server as mongo_uri."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Access ----------------------------------------------------------------------------------------

variable "deployer_principal_ids" {
  description = "Extra principals (e.g. the GitHub Actions identity, if Terraform runs as someone else) that push images, upload the frontend and manage Key Vault secrets."
  type        = list(string)
  default     = []
}

variable "allow_destroy" {
  description = "Set true (apply, then destroy) to lift the prod Atlas cluster's termination protection before tearing an environment down."
  type        = bool
  default     = false
}

# --- Realtime (Centrifugo, see centrifugo.tf) ------------------------------------------------------

variable "realtime_tenant" {
  description = "Workspace id whose /ws/connect, /ws/subscribe and /ws/rpc endpoints handle Centrifugo's hooks. Empty: no realtime server."
  type        = string
  default     = ""
}

variable "realtime_namespaces" {
  description = "Channel namespaces (the part before \":\" in a channel name, e.g. \"orders\" in orders:o_123). Each one's subscriptions go through /ws/subscribe."
  type        = list(string)
  default     = []
}

variable "centrifugo_version" {
  description = "Centrifugo image tag (option names in centrifugo.tf are v6)."
  type        = string
  default     = "v6.10.3"
}

variable "realtime_replicas" {
  type    = object({ min = number, max = number })
  default = { min = 1, max = 3 }
  validation {
    condition     = var.realtime_replicas.min >= 1
    error_message = "Keep at least one replica: open WebSockets need a live one."
  }
}

variable "realtime_cpu" {
  type    = number
  default = 0.5
}

variable "realtime_memory" {
  type    = string
  default = "1Gi"
}
