# Deploying ShipFlow on Azure

```
                       Azure Front Door (one public origin, HTTPS)
          /api/run/*  ─────────►  ca-…-runtime   (data plane, scales on concurrent requests)
          /api/*      ─────────►  ca-…-api       (builder APIs + Swagger)
          /*          ─────────►  Storage static website (React build, SPA fallback)

   Container Apps environment (VNet) ── ca-…-worker (BullMQ workers, no ingress, scales on CPU)
        │ private endpoint                 │ NAT gateway (one static outbound IP)
        ▼                                  ▼
   Azure Managed Redis               MongoDB Atlas on Azure (IP allow-list = NAT IP)
   (TLS, NoCluster, NoEviction)      (replica set: transactions + change streams)

   Key Vault: MONGO_URI, REDIS_PASSWORD, DATA_ENCRYPTION_KEY, WEBHOOK_SECRET, OPS_TOKEN
   ACR: one backend image; APP_ROLE picks the plane
```

| Path | What |
|---|---|
| `infra/terraform/` | All Azure + Atlas resources; one root, one state per environment |
| `infra/terraform/envs/<env>.tfvars` | Sizing per environment |
| `infra/terraform/envs/<env>.backend.hcl` | Where that environment's state lives |
| `infra/scripts/bootstrap.sh` | One-time: state storage + GitHub OIDC identity |
| `.github/workflows/ci.yml` | PRs: backend typecheck/tests/build, frontend build, Docker build |
| `.github/workflows/deploy.yml` | `main`: CI → staging → (approval) → prod, same image promoted |
| `.github/workflows/terraform.yml` | PRs: plan both envs. `main`: apply staging → (approval) → prod |

## First-time setup

1. **Bootstrap** (as a subscription Owner): `infra/scripts/bootstrap.sh <subscription-id> <owner/repo>`.
   Commit the updated `envs/*.backend.hcl`.
2. **GitHub**: add the variables/secrets the script prints, and environments `staging` and `prod`
   (give `prod` required reviewers).
3. **MongoDB Atlas**: create an org service account (Organization Project Creator) for the secrets.
   Using your own MongoDB instead? Set `create_atlas_cluster = false` and pass `TF_VAR_mongo_uri`.
4. **Registry first** — the apps can't start before an image exists:
   - Actions → *Terraform* → Run: `staging`, `apply`, **bootstrap ✓** (repeat for `prod`)
   - Actions → *Deploy* → Run (pushes the image; app steps are skipped)
   - Actions → *Terraform* → Run: `staging`, `apply` (repeat for `prod`) — creates everything else
   - Actions → *Deploy* → Run — frontend upload, rollout, smoke test
5. Create the first owner account (or set `allow_signup = true`):
   ```
   az containerapp exec -n ca-shipflow-prod-api -g rg-shipflow-prod --command \
     "node dist/scripts/create-workspace-owner.js --tenant acme --email you@example.com --password '…'"
   ```

After that, merging to `main` is the whole release process.

## Things to know

- **`DATA_ENCRYPTION_KEY` must never change.** Terraform generates it once (`prevent_destroy`) and
  stores it in Key Vault and in state; losing it makes workspace DB credentials unreadable.
  Back it up somewhere outside Azure.
- Terraform state contains secrets: the state storage account allows Entra ID auth only, with versioning.
- Terraform ignores the container image (`ignore_changes`); deploys own it.
- One-off scripts (`data:move-to-workspaces`, `workspace:owner`) run through `az containerapp exec`.
- Custom domain: set `custom_domain`, apply, then create the CNAME + TXT from the `custom_domain_dns` output.

## Tearing an environment down

Deletes the environment's data (Atlas cluster and its backups, Redis, uploaded frontend).

**From GitHub (recommended):** Actions → *Terraform* → Run: environment, action `destroy`,
confirm_destroy = the environment name. `prod` waits for its reviewers.

**From your machine** (`az login` as an Owner). Key Vault access belongs to whoever applied
(the GitHub identity), so first grant yourself "Key Vault Secrets Officer" on the vault:

```bash
cd infra/terraform
ENV=staging   # or prod
export ARM_SUBSCRIPTION_ID=<subscription-id> TF_VAR_subscription_id=<subscription-id>
export TF_VAR_atlas_org_id=<atlas-org-id>
export MONGODB_ATLAS_CLIENT_ID=<…> MONGODB_ATLAS_CLIENT_SECRET=<…>

terraform init -reconfigure -backend-config=envs/$ENV.backend.hcl

az role assignment create --role "Key Vault Secrets Officer" \
  --assignee "$(az ad signed-in-user show --query id -o tsv)" \
  --scope "$(az keyvault show -n "$(terraform output -raw key_vault_name)" --query id -o tsv)"

# Optional: keep the encryption key (needed to read any data you restore elsewhere)
az keyvault secret show --vault-name "$(terraform output -raw key_vault_name)" \
  -n data-encryption-key --query value -o tsv > data-encryption-key.$ENV.txt

# prod only: lift Atlas termination protection first
terraform apply -var-file=envs/$ENV.tfvars -var allow_destroy=true \
  -target=mongodbatlas_advanced_cluster.this

# The key is protected from destroy; drop it from state (it exists only in state + Key Vault)
terraform state rm random_bytes.data_encryption_key

terraform destroy -var-file=envs/$ENV.tfvars -var allow_destroy=true
```

Key Vault is soft-deleted (prod: purge protection, kept 30 days, no cost). Bootstrap resources are
outside Terraform; remove them only when every environment is gone:

```bash
az group delete -n rg-shipflow-tfstate --yes
az ad app delete --id "$(az ad app list --display-name shipflow-github-actions --query '[0].appId' -o tsv)"
```

## Next hardening steps

- Container App ingress is public; requests that skip Front Door can spoof `X-Forwarded-For`
  (per-IP rate limits). Add a WAF policy on Front Door and/or check the `X-Azure-FDID` header in the app.
- Scale workers on queue backlog (`GET /api/health/load` via a KEDA `metrics-api` rule) instead of CPU.
- Atlas private endpoint instead of the NAT IP allow-list (needs M10+ and an Azure Private Link).
- Alerts: Container App restarts, 5xx at Front Door, Redis memory, Atlas connections.
