# Terraform — hisuiki web infrastructure (Google Cloud)

Everything the site runs on, in the `hisuiki` project.

| Resource                                  | What it does                                                     |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `google_storage_bucket.assets`            | Published markdown and images under the `static/` prefix, versioned |
| `google_sql_database_instance.main`       | Postgres behind better-auth: accounts, sessions, provider links   |
| `google_cloud_run_v2_service.web`         | `hisuiki.com` — the built React frontend                          |
| `google_cloud_run_v2_service.api`         | `api.hisuiki.com` — Express `/api`                                |
| Global external ALB + Cloud CDN           | Routes all three hostnames, with one managed certificate          |
| Secret Manager                            | Database URL, session signing secret, both OAuth client secrets   |
| Artifact Registry + Workload Identity     | Lets GitHub Actions build and deploy without a service-account key |

Host routing:

- `hisuiki.com` → `hisuiki-web` Cloud Run, cached on origin headers
- `api.hisuiki.com` → `hisuiki-api` Cloud Run, **no CDN**
- `cdn.hisuiki.com` → assets bucket through Cloud CDN

The API deliberately has no cache in front of it. That is what separating the origins buys: when the
frontend and the API shared a hostname, every authenticated response had to opt out of caching one
header at a time, and a single omission would have put a signed-in user's data into a shared cache.

## First apply

The order matters, because two of these steps depend on something outside Terraform.

```
gcloud auth application-default login          # Terraform needs ADC, not just the gcloud CLI
terraform -chdir=terraform init
terraform -chdir=terraform apply
```

The assets bucket already exists — content was migrated into it before this stack was written — so
`storage.tf` carries an `import` block that adopts it instead of trying to create it.

Then, in order:

1. **Update DNS.** `terraform output load_balancer_ip` prints a new address. The old A record pointed
   at the retired NukaWorks load balancer in a different project, and an IP cannot move between
   projects. `api` and `cdn` are CNAMEs to the apex, so the one A record covers all three.
2. **Wait for the certificate.** It covers all three hostnames and cannot be issued until each
   resolves to the load balancer. If it sticks in `FAILED_NOT_VISIBLE`, DNS was still wrong when
   Google first tried: fix the record, then bump `cert_version` to force a fresh issue rather than
   waiting on Google's own retry.
3. **Configure OAuth and the site owner.** Create GitHub and Google OAuth clients with the callback
   URLs printed by `terraform output oauth_callback_urls`. Pass Google's public client id and the
   email addresses that may open `/admin` when applying the stack:

   ```
   terraform -chdir=terraform apply \
     -var='google_client_id=YOUR_GOOGLE_CLIENT_ID' \
     -var='site_owner_emails=owner@example.com'
   ```

   The GitHub client id has the existing app's public value as its default; override
   `github_client_id` the same way if a replacement app is used. Terraform creates placeholder
   secret versions because real values in Terraform would pass through state in plain text. Add the
   matching real secrets directly to Secret Manager:

   ```
   gcloud secrets versions add github-oauth-client-secret --data-file=- --project=hisuiki
   gcloud secrets versions add google-oauth-client-secret --data-file=- --project=hisuiki
   ```

   Deploy a fresh API revision after adding or rotating a secret. Until both halves of one provider
   are real, the sign-in page labels that provider unavailable instead of sending visitors into a
   failing OAuth flow.
4. **Run the database migration**, through the Cloud SQL proxy against
   `terraform output database_instance_connection_name`:

   ```
   export DATABASE_URL=...
   pnpm --filter hisuiki-server migrate
   ```
5. **Set the repository variables** the deploy workflow reads: `GCP_PROJECT_ID`, `GCP_REGION`,
   `GCP_WEB_SERVICE`, `GCP_API_SERVICE`, `GCP_URL_MAP`, `API_BASE_URL`, `ASSET_BASE_URL`, plus the
   `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT` secrets. The matching values are
   Terraform outputs.

Both Cloud Run services start on a placeholder image (`var.app_image`) and are only real once the
deploy workflow has pushed one. Terraform ignores the image field from then on.

## Manual image deployment

The same build-and-deploy sequence used by GitHub Actions is available locally:

```
gcloud auth login
pnpm deploy:gcp
```

This builds `server/Dockerfile` for `linux/amd64`, pushes it to the `containers` Artifact Registry
repository, resolves the pushed tag to an immutable digest, and deploys that one digest to the API
first and the frontend second. It then invalidates the frontend Cloud CDN cache.

Use `pnpm deploy:gcp -- --dry-run` to inspect the commands or `--tag TAG` to choose a tag. Every
setting has an environment override documented at the top of
`scripts/build-and-deploy-gcp.sh`; `SKIP_CDN_INVALIDATION=1` skips only the final cache purge.
