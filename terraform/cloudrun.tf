# Two Cloud Run services from one image, split by origin:
#
#   hisuiki.com      -> hisuiki-web   APP_ROLE=web   serves the built React frontend, no /api
#   api.hisuiki.com  -> hisuiki-api   APP_ROLE=api   serves Express /api, no static files
#
# One image rather than two because the frontend build and the API build already share a repository,
# a lockfile, and a release; splitting the artifact would mean two pipelines to keep in step for no
# gain. APP_ROLE decides what a revision mounts (see server/src/index.ts).
#
# The split itself is what costs something: the browser now talks to a different origin than it was
# served from, so the session cookie has to be scoped to the parent domain and CORS has to name the
# frontend explicitly. Both are configured below and neither is optional.

# ── Web ───────────────────────────────────────────────────────────────────────────────────────

resource "google_service_account" "web" {
  account_id   = "hisuiki-web"
  display_name = "hisuiki frontend (Cloud Run)"
}

resource "google_cloud_run_v2_service" "web" {
  name     = var.web_service_name
  location = var.region

  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  depends_on = [google_project_service.required]

  template {
    service_account = google_service_account.web.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = 4
    }

    containers {
      name  = "app"
      image = var.app_image

      env {
        name  = "APP_ROLE"
        value = "web"
      }

      # Static files only: no bucket, no database, no secrets. If this service is ever compromised
      # there is nothing behind it to reach.
      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  lifecycle {
    # The deploy workflow owns the deployed image; Terraform owns everything else about the service.
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }
}

# ── API ───────────────────────────────────────────────────────────────────────────────────────

resource "google_service_account" "api" {
  account_id   = "hisuiki-api"
  display_name = "hisuiki API (Cloud Run)"
}

# Read/write: the editor saves markdown here and the photo gallery writes images and its metadata.
resource "google_storage_bucket_iam_member" "api_assets" {
  bucket = google_storage_bucket.assets.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api.email}"
}

# gcloud and the client library read bucket metadata before listing objects, which objectAdmin does
# not carry. legacyBucketReader is the narrowest role that does.
resource "google_storage_bucket_iam_member" "api_assets_bucket" {
  bucket = google_storage_bucket.assets.name
  role   = "roles/storage.legacyBucketReader"
  member = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}

locals {
  api_secrets = {
    database_url         = google_secret_manager_secret.database_url.id
    database_pooled_url  = google_secret_manager_secret.database_pooled_url.id
    database_password    = google_secret_manager_secret.database_password.id
    better_auth_secret   = google_secret_manager_secret.better_auth_secret.id
    github_client_secret = google_secret_manager_secret.github_client_secret.id
    google_client_secret = google_secret_manager_secret.google_client_secret.id
  }
}

resource "google_secret_manager_secret_iam_member" "api" {
  for_each = local.api_secrets

  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_cloud_run_v2_service" "api" {
  name     = var.api_service_name
  location = var.region

  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  # The secret *versions* specifically: Cloud Run resolves secret_key_ref while creating the
  # service, and a secret with no versions fails that outright.
  depends_on = [
    google_project_service.required,
    google_secret_manager_secret_iam_member.api,
    google_secret_manager_secret_version.database_pooled_url,
    google_secret_manager_secret_version.database_password,
    google_secret_manager_secret_version.better_auth_secret,
    google_secret_manager_secret_version.github_client_secret_placeholder,
    google_secret_manager_secret_version.google_client_secret_placeholder,
  ]

  template {
    service_account = google_service_account.api.email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = 4
    }

    containers {
      name       = "app"
      image      = var.app_image
      depends_on = ["pgbouncer"]

      ports {
        container_port = 8080
      }

      env {
        name  = "APP_ROLE"
        value = "api"
      }

      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.assets.name
      }

      env {
        name  = "GCS_PREFIX"
        value = var.assets_prefix
      }

      env {
        name  = "CDN_BASE_URL"
        value = "https://${var.cdn_domain}"
      }

      # The frontend is a different origin now, so this is a real CORS allow-list rather than a
      # formality. It doubles as better-auth's trusted-origin list.
      env {
        name  = "CORS_ALLOWED_ORIGINS"
        value = "https://${var.site_domain}"
      }

      # better-auth builds its callback URLs from this, so it must match what is registered with
      # GitHub and Google: https://api.hisuiki.com/api/auth/callback/{github,google}
      env {
        name  = "BETTER_AUTH_URL"
        value = "https://${var.api_domain}"
      }

      # The session cookie is issued by api.hisuiki.com but has to be readable by hisuiki.com, and
      # later by per-profile subdomains. Scoping it to the parent domain is what makes that work.
      env {
        name  = "AUTH_COOKIE_DOMAIN"
        value = ".${var.site_domain}"
      }

      env {
        name  = "GITHUB_CLIENT_ID"
        value = var.github_client_id
      }

      env {
        name  = "GOOGLE_CLIENT_ID"
        value = var.google_client_id
      }

      env {
        name  = "SITE_OWNER_EMAILS"
        value = var.site_owner_emails
      }

      dynamic "env" {
        for_each = {
          DATABASE_URL         = google_secret_manager_secret.database_pooled_url.secret_id
          BETTER_AUTH_SECRET   = google_secret_manager_secret.better_auth_secret.secret_id
          GITHUB_CLIENT_SECRET = google_secret_manager_secret.github_client_secret.secret_id
          GOOGLE_CLIENT_SECRET = google_secret_manager_secret.google_client_secret.secret_id
        }

        content {
          name = env.key

          value_source {
            secret_key_ref {
              secret  = env.value
              version = "latest"
            }
          }
        }
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }

    containers {
      name    = "pgbouncer"
      image   = var.app_image
      command = ["/usr/local/bin/PgBouncerEntrypoint.sh"]

      env {
        name  = "PGBOUNCER_DATABASE_HOST"
        value = "/cloudsql/${google_sql_database_instance.main.connection_name}"
      }

      env {
        name  = "PGBOUNCER_DATABASE_NAME"
        value = google_sql_database.app.name
      }

      env {
        name  = "PGBOUNCER_DATABASE_USER"
        value = google_sql_user.app.name
      }

      env {
        name = "PGBOUNCER_DATABASE_PASSWORD"

        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.database_password.secret_id
            version = "latest"
          }
        }
      }

      env {
        name  = "PGBOUNCER_DEFAULT_POOL_SIZE"
        value = "4"
      }

      env {
        name  = "PGBOUNCER_RESERVE_POOL_SIZE"
        value = "1"
      }

      env {
        name  = "PGBOUNCER_MAX_CLIENT_CONN"
        value = "100"
      }

      volume_mounts {
        name       = "cloudsql"
        mount_path = "/cloudsql"
      }

      startup_probe {
        failure_threshold = 10
        period_seconds    = 2
        timeout_seconds   = 1

        tcp_socket {
          port = 6432
        }
      }

      resources {
        limits = {
          cpu    = "0.25"
          memory = "128Mi"
        }
      }
    }

    volumes {
      name = "cloudsql"

      cloud_sql_instance {
        instances = [google_sql_database_instance.main.connection_name]
      }
    }

    # Direct VPC egress. The database has no public address, so without an interface on this network
    # the connector has nothing to dial. PRIVATE_RANGES_ONLY keeps ordinary outbound traffic — the
    # GCS API, GitHub and Google's OAuth endpoints — on the public path rather than routing it
    # through the VPC, which would need a NAT gateway to work at all.
    vpc_access {
      egress = "PRIVATE_RANGES_ONLY"

      network_interfaces {
        network    = google_compute_network.main.id
        subnetwork = google_compute_subnetwork.run.id
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].containers[0].image,
      template[0].containers[1].image,
      client,
      client_version,
    ]
  }
}

# ── Migrations ────────────────────────────────────────────────────────────────────────────────
#
# Once the database is private, `cloud-sql-proxy` on a workstation can no longer reach it. This job
# runs the same image from inside the VPC and applies pending migrations:
#
#   gcloud run jobs execute hisuiki-migrate --region <region> --project <project> --wait
#
# It is deliberately a job rather than a startup step in the API: a migration that runs on every
# cold start would race itself across instances, and a failed one would take the service down
# rather than simply reporting.
resource "google_cloud_run_v2_job" "migrate" {
  name     = "hisuiki-migrate"
  location = var.region

  deletion_protection = false

  depends_on = [
    google_project_service.required,
    google_secret_manager_secret_iam_member.api,
    google_secret_manager_secret_version.database_url,
  ]

  template {
    template {
      service_account = google_service_account.api.email
      max_retries     = 0

      containers {
        image   = var.app_image
        command = ["pnpm"]
        args    = ["exec", "prisma", "migrate", "deploy"]

        env {
          name = "DIRECT_DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.database_url.secret_id
              version = "latest"
            }
          }
        }

        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
      }

      volumes {
        name = "cloudsql"

        cloud_sql_instance {
          instances = [google_sql_database_instance.main.connection_name]
        }
      }

      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"

        network_interfaces {
          network    = google_compute_network.main.id
          subnetwork = google_compute_subnetwork.run.id
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].template[0].containers[0].image,
      client,
      client_version,
    ]
  }
}

# Both services are public. Authorization is the application's own session check, not Cloud Run IAM.
resource "google_cloud_run_v2_service_iam_member" "web_public" {
  name     = google_cloud_run_v2_service.web.name
  location = google_cloud_run_v2_service.web.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "api_public" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
