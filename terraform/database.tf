# Postgres behind better-auth: accounts, sessions, and provider links.
#
# The instance has no public IP. It sits on the VPC in network.tf, reachable only from inside it,
# and Cloud Run gets there through Direct VPC egress. IAM still governs who may connect —
# roles/cloudsql.client — so removing the public address narrows the network path rather than
# replacing the authorization model.

resource "google_sql_database_instance" "main" {
  name             = var.db_instance_name
  database_version = "POSTGRES_17"
  region           = var.region

  # Deletion protection disabled for teardown
  deletion_protection = false

  # The peering has to exist before an instance can be given an address inside it.
  depends_on = [
    google_project_service.required,
    google_service_networking_connection.private_services,
  ]

  settings {
    # Pinned, and not a detail: new instances now default to ENTERPRISE_PLUS, which only accepts the
    # db-perf-optimized-N-* tiers and costs an order of magnitude more. Shared-core exists solely on
    # the Enterprise edition, so leaving this unset rejects var.db_tier outright.
    edition = "ENTERPRISE"

    tier              = var.db_tier
    availability_type = "ZONAL"
    disk_size         = 10
    disk_type         = "PD_HDD"
    disk_autoresize   = true

    # Cheap insurance on the one dataset that cannot be rebuilt from the bucket or the repo.
    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = false
    }

    ip_configuration {
      # No public address at all; the instance answers only on its private one.
      ipv4_enabled                                  = false
      private_network                               = google_compute_network.main.id
      enable_private_path_for_google_cloud_services = true
      ssl_mode                                      = "ENCRYPTED_ONLY"
    }

    database_flags {
      # better-auth stores timestamps in UTC and compares them there.
      name  = "timezone"
      value = "UTC"
    }

    insights_config {
      query_insights_enabled = true
    }
  }
}

resource "google_sql_database" "app" {
  name     = var.db_name
  instance = google_sql_database_instance.main.name
}

# Generated here rather than chosen by a human: the value goes straight into Secret Manager and
# never needs to be known by anyone. Rotating it means tainting this resource.
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "google_sql_user" "app" {
  name     = var.db_user
  instance = google_sql_database_instance.main.name
  password = random_password.db.result
}

# ── Secrets ───────────────────────────────────────────────────────────────────────────────────
# The API reads DATABASE_URL as one string, so the assembled URL is the secret rather than the
# password alone. That also keeps the socket path out of the Cloud Run environment, where it would
# otherwise have to be templated alongside a separate password reference.

resource "google_secret_manager_secret" "database_url" {
  secret_id = "database-url"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "database_url" {
  secret = google_secret_manager_secret.database_url.id

  # The unix socket, not a host and port: the connector mounts the instance at
  # /cloudsql/<connection name> and pg connects through it.
  secret_data = format(
    "postgresql://%s:%s@localhost/%s?host=/cloudsql/%s",
    google_sql_user.app.name,
    urlencode(random_password.db.result),
    google_sql_database.app.name,
    google_sql_database_instance.main.connection_name,
  )
}

# Signs session cookies. Rotating it signs everyone out, which is the intended blast radius.
resource "random_password" "better_auth_secret" {
  length  = 48
  special = false
}

resource "google_secret_manager_secret" "better_auth_secret" {
  secret_id = "better-auth-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "better_auth_secret" {
  secret      = google_secret_manager_secret.better_auth_secret.id
  secret_data = random_password.better_auth_secret.result
}

# OAuth client secrets come from the GitHub and Google consoles. Terraform owning their real values
# would mean each one passing through a tfvars file and sitting in the state in plain text, which is
# exactly what Secret Manager exists to avoid — so it owns only a placeholder first version.
#
# The placeholder is not ceremony. Cloud Run resolves secret_key_ref at deploy time and refuses to
# create a service whose secret has no versions, so an empty secret here fails the apply rather than
# waiting politely for a value. Adding the real secret later creates version 2, "latest" follows it,
# and the next revision picks it up:
#
#   gcloud secrets versions add github-oauth-client-secret --data-file=- --project=hisuiki
#
# Terraform keeps managing version 1 and will not fight the newer one.
resource "google_secret_manager_secret" "github_client_secret" {
  secret_id = "github-oauth-client-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "github_client_secret_placeholder" {
  secret      = google_secret_manager_secret.github_client_secret.id
  secret_data = "placeholder-replace-with-real-github-client-secret"

  lifecycle {
    # Once a real secret is added as a later version, the placeholder is disabled by hand so nothing
    # can fall back to it. Terraform would otherwise see enabled=false as drift and switch it back on.
    ignore_changes = [enabled]
  }
}

resource "google_secret_manager_secret" "google_client_secret" {
  secret_id = "google-oauth-client-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "google_client_secret_placeholder" {
  secret      = google_secret_manager_secret.google_client_secret.id
  secret_data = "placeholder-replace-with-real-google-client-secret"

  lifecycle {
    # Once a real secret is added as a later version, the placeholder is disabled by hand so nothing
    # can fall back to it. Terraform would otherwise see enabled=false as drift and switch it back on.
    ignore_changes = [enabled]
  }
}
