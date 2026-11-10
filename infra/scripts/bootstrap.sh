#!/usr/bin/env bash
# One-time setup, run by a subscription Owner with the Azure CLI logged in:
#   1. Storage account for Terraform state (Entra ID auth, versioned blobs)
#   2. An Entra app GitHub Actions signs in as through OIDC (no stored passwords)
#   3. Roles for that app: Contributor + RBAC Administrator (Terraform creates role assignments)
#
# Usage: infra/scripts/bootstrap.sh <subscription-id> <github-owner/repo> [location]
set -euo pipefail

SUBSCRIPTION_ID="${1:?subscription id}"
REPO="${2:?github owner/repo}"
LOCATION="${3:-centralindia}"

STATE_RG="rg-shipflow-tfstate"
APP_NAME="shipflow-github-actions"
HERE="$(cd "$(dirname "$0")" && pwd)"
TF_DIR="$HERE/../terraform"

az account set --subscription "$SUBSCRIPTION_ID"
TENANT_ID="$(az account show --query tenantId -o tsv)"
ME="$(az ad signed-in-user show --query id -o tsv)"

echo "==> Terraform state storage"
az group create -n "$STATE_RG" -l "$LOCATION" -o none
STATE_SA="$(az storage account list -g "$STATE_RG" --query '[0].name' -o tsv)"
if [[ -z "$STATE_SA" ]]; then
  STATE_SA="stshipflowtf$(openssl rand -hex 3)"
  az storage account create -n "$STATE_SA" -g "$STATE_RG" -l "$LOCATION" \
    --sku Standard_ZRS --min-tls-version TLS1_2 --allow-blob-public-access false \
    --allow-shared-key-access false -o none
  az storage account blob-service-properties update --account-name "$STATE_SA" -g "$STATE_RG" \
    --enable-versioning true --enable-delete-retention true --delete-retention-days 30 -o none
fi
STATE_SA_ID="$(az storage account show -n "$STATE_SA" -g "$STATE_RG" --query id -o tsv)"
az role assignment create --assignee-object-id "$ME" --assignee-principal-type User \
  --role "Storage Blob Data Contributor" --scope "$STATE_SA_ID" -o none 2>/dev/null || true
for i in {1..12}; do
  az storage container create -n tfstate --account-name "$STATE_SA" --auth-mode login -o none 2>/dev/null && break
  echo "   waiting for role propagation…"; sleep 10
done

echo "==> GitHub Actions identity (OIDC)"
APP_ID="$(az ad app list --display-name "$APP_NAME" --query '[0].appId' -o tsv)"
if [[ -z "$APP_ID" ]]; then
  APP_ID="$(az ad app create --display-name "$APP_NAME" --query appId -o tsv)"
fi
SP_ID="$(az ad sp show --id "$APP_ID" --query id -o tsv 2>/dev/null || az ad sp create --id "$APP_ID" --query id -o tsv)"

# Which GitHub jobs may sign in: PR plans, main-branch runs, and the two deployment environments.
for subject in "pull_request" "ref:refs/heads/main" "environment:staging" "environment:prod"; do
  name="gh-$(echo "$subject" | tr ':/' '--')"
  if ! az ad app federated-credential show --id "$APP_ID" --federated-credential-id "$name" -o none 2>/dev/null; then
    az ad app federated-credential create --id "$APP_ID" -o none --parameters "{
      \"name\": \"$name\",
      \"issuer\": \"https://token.actions.githubusercontent.com\",
      \"subject\": \"repo:$REPO:$subject\",
      \"audiences\": [\"api://AzureADTokenExchange\"]
    }"
  fi
done

SCOPE="/subscriptions/$SUBSCRIPTION_ID"
for role in "Contributor" "Role Based Access Control Administrator"; do
  az role assignment create --assignee-object-id "$SP_ID" --assignee-principal-type ServicePrincipal \
    --role "$role" --scope "$SCOPE" -o none 2>/dev/null || true
done
az role assignment create --assignee-object-id "$SP_ID" --assignee-principal-type ServicePrincipal \
  --role "Storage Blob Data Contributor" --scope "$STATE_SA_ID" -o none 2>/dev/null || true

for env in staging prod; do
  sed -i.bak "s/^storage_account_name.*/storage_account_name = \"$STATE_SA\"/" "$TF_DIR/envs/$env.backend.hcl"
  rm -f "$TF_DIR/envs/$env.backend.hcl.bak"
done

cat <<EOF

Done. In GitHub (Settings → Secrets and variables → Actions) add:

  Variables:
    AZURE_CLIENT_ID        = $APP_ID
    AZURE_TENANT_ID        = $TENANT_ID
    AZURE_SUBSCRIPTION_ID  = $SUBSCRIPTION_ID
    ATLAS_ORG_ID           = <your MongoDB Atlas organization id>
  Secrets:
    MONGODB_ATLAS_CLIENT_ID      = <Atlas service account client id>
    MONGODB_ATLAS_CLIENT_SECRET  = <Atlas service account secret>

Create environments "staging" and "prod" (Settings → Environments); give "prod" required reviewers.
Commit infra/terraform/envs/*.backend.hcl (now pointing at $STATE_SA).
EOF
