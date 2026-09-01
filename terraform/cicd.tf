# Workload Identity Federation for GitHub Actions. No service-account key is ever created or stored
# as a repo secret: Actions exchanges its own OIDC token for a short-lived GCP credential, and only
# for this repository.

resource "google_artifact_registry_repository" "containers" {
  repository_id = "containers"
  location      = var.region
  format        = "DOCKER"
  description   = "Application images for the hisuiki Cloud Run services."

  depends_on = [google_project_service.required]
}

resource "google_service_account" "deployer" {
  account_id   = "github-deployer"
  display_name = "GitHub Actions deployer"
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions"

  depends_on = [google_project_service.required]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  # Without this, *any* GitHub repository's OIDC token would be accepted by the provider.
  attribute_condition = "assertion.repository == '${var.github_repository}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_impersonation" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# --- What CI is allowed to do ----------------------------------------------

resource "google_artifact_registry_repository_iam_member" "deployer_push" {
  repository = google_artifact_registry_repository.containers.name
  location   = google_artifact_registry_repository.containers.location
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deployer.email}"
}

# Deploying a new revision to both services.
resource "google_project_iam_member" "deployer_run" {
  project = var.project_id
  role    = "roles/run.developer"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}

# A manually dispatched deployment may promote an OAuth credential already held by GitHub Actions
# into Secret Manager. Version-adder cannot read the current value back and is scoped to these two
# secrets rather than every secret in the project.
resource "google_secret_manager_secret_iam_member" "deployer_oauth_version" {
  for_each = {
    github = google_secret_manager_secret.github_client_secret.id
    google = google_secret_manager_secret.google_client_secret.id
  }

  secret_id = each.value
  role      = "roles/secretmanager.secretVersionAdder"
  member    = "serviceAccount:${google_service_account.deployer.email}"
}

# A Cloud Run deploy runs the revision as a service account, which the deployer must be allowed to
# act as — separately for each, since the two services have distinct identities.
resource "google_service_account_iam_member" "deployer_act_as_web" {
  service_account_id = google_service_account.web.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_service_account_iam_member" "deployer_act_as_api" {
  service_account_id = google_service_account.api.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# The deploy workflow writes version.json into the assets bucket alongside the content.
resource "google_storage_bucket_iam_member" "deployer_assets" {
  bucket = google_storage_bucket.assets.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_storage_bucket_iam_member" "deployer_assets_bucket" {
  bucket = google_storage_bucket.assets.name
  role   = "roles/storage.legacyBucketReader"
  member = "serviceAccount:${google_service_account.deployer.email}"
}

# Invalidating the CDN after a release needs compute.urlMaps.invalidateCache, which no predefined
# role carries without also granting broad control of the load balancer. A custom role with exactly
# the two permissions the gcloud command uses keeps the deploy identity from being able to rewrite
# routing as a side effect of being able to purge a cache.
resource "google_project_iam_custom_role" "cdn_invalidator" {
  role_id     = "cdnCacheInvalidator"
  title       = "CDN cache invalidator"
  description = "Purge Cloud CDN content for a URL map, and nothing else."
  permissions = [
    "compute.urlMaps.get",
    "compute.urlMaps.invalidateCache",
  ]
}

resource "google_project_iam_member" "deployer_cdn_invalidate" {
  project = var.project_id
  role    = google_project_iam_custom_role.cdn_invalidator.id
  member  = "serviceAccount:${google_service_account.deployer.email}"
}
