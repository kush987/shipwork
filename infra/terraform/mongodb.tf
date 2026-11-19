# MongoDB must be a replica set (transactions + change streams). MongoDB Atlas on Azure is the
# default; Azure Cosmos DB's MongoDB APIs don't fully support the change streams record triggers use.

resource "mongodbatlas_project" "this" {
  count  = var.create_atlas_cluster ? 1 : 0
  name   = local.name
  org_id = var.atlas_org_id
}

resource "mongodbatlas_advanced_cluster" "this" {
  count                          = var.create_atlas_cluster ? 1 : 0
  project_id                     = mongodbatlas_project.this[0].id
  name                           = local.name
  cluster_type                   = "REPLICASET"
  mongo_db_major_version         = "7.0"
  backup_enabled                 = true
  termination_protection_enabled = var.environment == "prod" && !var.allow_destroy

  replication_specs = [{
    region_configs = [{
      provider_name = "AZURE"
      region_name   = var.atlas_region
      priority      = 7
      electable_specs = {
        instance_size = var.atlas_instance_size
        node_count    = 3
      }
    }]
  }]
}

resource "random_password" "mongo" {
  count   = var.create_atlas_cluster ? 1 : 0
  length  = 40
  special = false
}

resource "mongodbatlas_database_user" "app" {
  count              = var.create_atlas_cluster ? 1 : 0
  project_id         = mongodbatlas_project.this[0].id
  auth_database_name = "admin"
  username           = "shipflow-app"
  password           = random_password.mongo[0].result

  # The app creates one database per workspace (sfb_<id>), so it needs access to all of them.
  roles {
    role_name     = "readWriteAnyDatabase"
    database_name = "admin"
  }

  scopes {
    name = mongodbatlas_advanced_cluster.this[0].name
    type = "CLUSTER"
  }
}

# Only the Container Apps' NAT IP may connect.
resource "mongodbatlas_project_ip_access_list" "apps" {
  count      = var.create_atlas_cluster ? 1 : 0
  project_id = mongodbatlas_project.this[0].id
  ip_address = azurerm_public_ip.nat.ip_address
  comment    = "${local.name} container apps (NAT)"
}

locals {
  atlas_host = var.create_atlas_cluster ? trimprefix(mongodbatlas_advanced_cluster.this[0].connection_strings.standard_srv, "mongodb+srv://") : ""
  atlas_auth = var.create_atlas_cluster ? "${mongodbatlas_database_user.app[0].username}:${random_password.mongo[0].result}" : ""

  mongo_uri = (var.create_atlas_cluster
    ? "mongodb+srv://${local.atlas_auth}@${local.atlas_host}/shipflow?retryWrites=true&w=majority"
  : var.mongo_uri)

  business_mongo_uri = (var.business_mongo_uri != "" ? var.business_mongo_uri
    : var.create_atlas_cluster ? "mongodb+srv://${local.atlas_auth}@${local.atlas_host}/?retryWrites=true&w=majority"
  : "") # empty: the app uses the MONGO_URI server
}
