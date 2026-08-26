# Terraform — hisuiki web infrastructure (Google Cloud)

Everything the site runs on, in the `hisuiki` project.

| Resource                                  | What it does                                                     |
| ----------------------------------------- | ---------------------------------------------------------------- |
| `google_storage_bucket.assets`            | Published markdown and images under the `static/` prefix, versioned |
| `google_sql_database_instance.main`       | Postgres behind better-auth: accounts, sessions, provider links   |
| `google_cloud_run_v2_service.web`         | `hisuiki.com` — the built React frontend                          |
| `google_cloud_run_v2_service.api`         | `api.hisuiki.com` — Express `/api`                                |
| Global external ALB + Cloud CDN           | Routes all three hostnames, with one managed certificate          |
| PgBouncer API sidecar                     | Transaction-pools API traffic before it reaches Cloud SQL         |
| Secret Manager                            | Direct/pooled database URLs, database password, auth secrets       |
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
3. **Add the OAuth client secrets.** Terraform creates both secrets empty, because a value it owned
   would pass through the state in plain text:

   ```
   gcloud secrets versions add github-oauth-client-secret --data-file=- --project=hisuiki
   gcloud secrets versions add google-oauth-client-secret --data-file=- --project=hisuiki
   ```

   Register the callbacks printed by `terraform output oauth_callback_urls` with each provider.
4. **Run the database migration** with the migration job. It receives `DIRECT_DATABASE_URL` and
   deliberately bypasses PgBouncer, because Prisma schema operations are not safe through a
   transaction pool:

   ```
   gcloud run jobs execute hisuiki-migrate --region northamerica-northeast1 --project hisuiki --wait
   ```
5. **Set the repository variables** the deploy workflow reads: `GCP_PROJECT_ID`, `GCP_REGION`,
   `GCP_WEB_SERVICE`, `GCP_API_SERVICE`, `GCP_URL_MAP`, `API_BASE_URL`, `ASSET_BASE_URL`, plus the
   `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOY_SERVICE_ACCOUNT` secrets. The matching values are
   Terraform outputs.

Both Cloud Run services start on a placeholder image (`var.app_image`) and are only real once the
deploy workflow has pushed one. Terraform ignores the image field from then on.

The API runs that same release image a second time as a PgBouncer sidecar. It accepts up to 100
client connections but opens four regular and one reserve backend connection per Cloud Run
instance. With the API capped at four instances, ordinary traffic is therefore bounded to 16
Cloud SQL sessions (20 while every reserve slot is in use) instead of scaling one-for-one with
incoming application connections. PgBouncer uses transaction mode with prepared-statement support;
the migration job always keeps its direct socket connection.
