variable "project_id" {
  description = "Google Cloud project ID hosting the whole site."
  type        = string
  default     = "hisuiki"
}

variable "region" {
  description = "Region for Cloud Run and other regional resources."
  type        = string
  default     = "northamerica-northeast1"
}

variable "bucket_location" {
  description = "Location for the GCS buckets. Multi-region ('US', 'EU') or a single region."
  type        = string
  default     = "US"
}

variable "assets_bucket_name" {
  description = "Globally-unique bucket holding the site's markdown and static assets."
  type        = string
  default     = "hisuiki-assets-prod"
}

variable "assets_prefix" {
  description = <<-EOT
    Object-name prefix all content sits under. Carried across every migration so far — Azure
    container, then NukaWorks Prod, now hisuiki — so that every published asset URL stays
    byte-identical. Changing it breaks links inside already-published markdown.
  EOT
  type        = string
  default     = "static"
}

variable "site_domain" {
  description = "Apex domain serving the blog frontend."
  type        = string
  default     = "hisuiki.com"
}

variable "api_domain" {
  description = "Domain serving the API. Separate origin from the frontend, so CORS and cookies are explicit."
  type        = string
  default     = "api.hisuiki.com"
}

variable "cdn_domain" {
  description = "Domain serving static assets straight from the bucket through Cloud CDN."
  type        = string
  default     = "cdn.hisuiki.com"
}

variable "web_service_name" {
  description = "Cloud Run service serving the built React frontend."
  type        = string
  default     = "hisuiki-web"
}

variable "api_service_name" {
  description = "Cloud Run service serving the Express API."
  type        = string
  default     = "hisuiki-api"
}

variable "app_image" {
  description = <<-EOT
    Container image both services run. One image, two roles: the APP_ROLE environment variable
    decides whether a revision serves the frontend or the API.

    Terraform only sets the initial value. The deploy workflow pushes a new digest on every release
    and Cloud Run's revision history owns it from then on, which is why the image field is ignored
    on both services below.
  EOT
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "min_instances" {
  description = <<-EOT
    Minimum warm Cloud Run instances per service. 0 costs nothing while idle but cold-starts the
    first request after a quiet period; 1 removes cold starts for a small monthly cost.
  EOT
  type        = number
  default     = 0
}

variable "cert_version" {
  description = <<-EOT
    Suffix on the managed certificate's name. Bump it to force a reissue — the certificate is
    replaced before the old one is removed, so the load balancer never sits without one.

    This is the remedy when a certificate sticks in FAILED_NOT_VISIBLE, which is what happens when
    it first tried to validate before DNS pointed at this load balancer.
  EOT
  type        = number
  default     = 1
}

variable "db_instance_name" {
  description = "Cloud SQL instance holding accounts and sessions."
  type        = string
  default     = "hisuiki-pg"
}

variable "db_name" {
  description = "Database within the Cloud SQL instance."
  type        = string
  default     = "hisuiki"
}

variable "db_user" {
  description = "Database role the API connects as. Its password is generated and kept in Secret Manager."
  type        = string
  default     = "app"
}

variable "db_tier" {
  description = <<-EOT
    Cloud SQL machine type. Shared-core is deliberate: this database holds accounts and sessions for
    one personal site, and its working set is a few thousand rows. Move to a dedicated-core tier
    when it carries something latency-sensitive.
  EOT
  type        = string
  default     = "db-f1-micro"
}

variable "github_client_id" {
  description = <<-EOT
    Client id of the GitHub OAuth app used for sign-in. Public — it travels in the authorize URL the
    browser follows — so unlike the client secret there is no reason to keep it out of the config.

    This is the same OAuth app the retired NukaWorks stack used; its callback URL now points at
    api.hisuiki.com rather than blog.nuka.works.
  EOT
  type        = string
  default     = "Ov23libBcHbgZHkrxg6D"
}

variable "google_client_id" {
  description = "Client id of the Google OAuth client used for sign-in. Public, like the GitHub one."
  type        = string
  default     = ""
}

variable "site_owner_emails" {
  description = <<-EOT
    Comma-separated email addresses allowed to moderate: delete anyone's photo or comment. Matched on
    the address rather than the provider, so the same person moderates whichever way they signed in.
  EOT
  type        = string
  default     = "hisuiki@hisuiki.com"
}

variable "github_repository" {
  description = <<-EOT
    owner/name of the GitHub repository allowed to deploy via Workload Identity Federation.

    This is matched exactly against the `repository` claim in the Actions OIDC token, so it has to
    track a repository rename. GitHub redirects the old name for git and the API, which hides the
    change from everything except this check — where it surfaces as
    "the given credential is rejected by the attribute condition".
  EOT
  type        = string
  default     = "hisuiki/Hisuiki"
}

variable "wildcard_cert_active" {
  description = <<-EOT
    Whether the load balancer serves the Certificate Manager wildcard certificate instead of the
    classic three-name one.

    Leave false until `gcloud certificate-manager certificates describe hisuiki-wildcard-cert`
    reports ACTIVE. The wildcard cannot issue until its DNS authorization TXT record resolves, and
    attaching a map whose certificate has not issued takes HTTPS down for every hostname.
  EOT
  type        = bool
  default     = false
}
