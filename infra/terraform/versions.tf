terraform {
  required_version = ">= 1.9"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.13"
    }
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 2.21"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.7"
    }
  }

  # State lives in Azure Storage; the account/container/key come from envs/<env>.backend.hcl.
  backend "azurerm" {}
}

provider "azurerm" {
  features {
    key_vault {
      # Keep soft-deleted vaults recoverable; a destroy must not lose DATA_ENCRYPTION_KEY for good.
      purge_soft_delete_on_destroy = false
    }
  }
  subscription_id     = var.subscription_id
  storage_use_azuread = true
}

# Credentials come from MONGODB_ATLAS_CLIENT_ID / MONGODB_ATLAS_CLIENT_SECRET (an Atlas service account).
# Unused when create_atlas_cluster = false.
provider "mongodbatlas" {}
