# Created by infra/scripts/bootstrap.sh
resource_group_name  = "rg-shipflow-tfstate"
storage_account_name = "REPLACE_ME"
container_name       = "tfstate"
key                  = "staging.tfstate"
use_azuread_auth     = true
