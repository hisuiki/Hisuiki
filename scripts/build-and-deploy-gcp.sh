#!/usr/bin/env bash
#
# Builds the production image, pushes it to Artifact Registry, and deploys that exact digest to the
# API and frontend Cloud Run services. Terraform owns the services' configuration; this script only
# advances their image, matching the division of responsibility in deploy-web.yml.
#
# Usage:
#   scripts/build-and-deploy-gcp.sh [--tag TAG] [--dry-run]
#
# Defaults can be overridden without editing the script:
#   GCP_PROJECT_ID, GCP_REGION, GCP_REPOSITORY, GCP_IMAGE_NAME,
#   GCP_API_SERVICE, GCP_WEB_SERVICE, GCP_URL_MAP,
#   API_BASE_URL, ASSET_BASE_URL, DOCKER_PLATFORM, SKIP_CDN_INVALIDATION

set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd)"

PROJECT_ID="${GCP_PROJECT_ID:-hisuiki}"
REGION="${GCP_REGION:-northamerica-northeast1}"
REPOSITORY="${GCP_REPOSITORY:-containers}"
IMAGE_NAME="${GCP_IMAGE_NAME:-hisuiki}"
API_SERVICE="${GCP_API_SERVICE:-hisuiki-api}"
WEB_SERVICE="${GCP_WEB_SERVICE:-hisuiki-web}"
URL_MAP="${GCP_URL_MAP:-hisuiki-url-map}"
API_BASE_URL="${API_BASE_URL:-https://api.hisuiki.com}"
ASSET_BASE_URL="${ASSET_BASE_URL:-https://cdn.hisuiki.com/static}"
DOCKER_PLATFORM="${DOCKER_PLATFORM:-linux/amd64}"
SKIP_CDN_INVALIDATION="${SKIP_CDN_INVALIDATION:-0}"

DRY_RUN=0
IMAGE_TAG="${IMAGE_TAG:-}"

usage() {
  cat <<'EOF'
Usage: scripts/build-and-deploy-gcp.sh [--tag TAG] [--dry-run]

Build and push one production image, then deploy its immutable digest to hisuiki-api followed by
hisuiki-web. The API is deployed first so a new frontend never points at an older API revision.

Options:
  --tag TAG   Override the image tag. Defaults to the current Git commit SHA; a dirty tree receives
              a unique <short-sha>-dirty-<UTC timestamp> tag.
  --dry-run   Print the commands without authenticating, building, pushing, or deploying.
  -h, --help  Show this help.
EOF
}

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33mWARNING:\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '  +'
    printf ' %q' "$@"
    printf '\n'
    return 0
  fi

  "$@"
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --tag)
      [ "$#" -ge 2 ] || die "--tag requires a value."
      IMAGE_TAG="$2"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      die "Unknown argument: $1"
      ;;
  esac
done

command -v git >/dev/null || die "git is not installed."
command -v gcloud >/dev/null || die "google-cloud-cli is not installed."
command -v docker >/dev/null || die "Docker is not installed."

cd "$REPO_ROOT"

GIT_SHA="$(git rev-parse HEAD 2>/dev/null)" || die "The repository has no Git commit to tag."
if [ -z "$IMAGE_TAG" ]; then
  if [ -n "$(git status --porcelain)" ]; then
    IMAGE_TAG="${GIT_SHA:0:12}-dirty-$(date -u +%Y%m%d%H%M%S)"
    warn "The working tree is dirty; using unique image tag $IMAGE_TAG."
  else
    IMAGE_TAG="$GIT_SHA"
  fi
fi

case "$IMAGE_TAG" in
  [A-Za-z0-9_]* ) ;;
  * ) die "Invalid Docker tag '$IMAGE_TAG': it must begin with an alphanumeric character or underscore." ;;
esac
[ "${#IMAGE_TAG}" -le 128 ] || die "Invalid Docker tag: tags cannot exceed 128 characters."
case "$IMAGE_TAG" in
  *[!A-Za-z0-9_.-]* ) die "Invalid Docker tag '$IMAGE_TAG': unsupported character." ;;
esac

REGISTRY_HOST="${REGION}-docker.pkg.dev"
IMAGE="${REGISTRY_HOST}/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}:${IMAGE_TAG}"

log "Project : $PROJECT_ID"
log "Region  : $REGION"
log "Image   : $IMAGE"

if [ "$DRY_RUN" -eq 0 ]; then
  gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q . \
    || die "Not logged in to Google Cloud. Run: gcloud auth login"

  [ "$(gcloud projects describe "$PROJECT_ID" --format='value(lifecycleState)')" = "ACTIVE" ] \
    || die "Google Cloud project '$PROJECT_ID' is not active."

  gcloud artifacts repositories describe "$REPOSITORY" \
    --project="$PROJECT_ID" --location="$REGION" >/dev/null 2>&1 \
    || die "Artifact Registry repository '$REPOSITORY' is unavailable. Apply Terraform before deploying."

  for service in "$API_SERVICE" "$WEB_SERVICE"; do
    gcloud run services describe "$service" \
      --project="$PROJECT_ID" --region="$REGION" >/dev/null 2>&1 \
      || die "Cloud Run service '$service' is unavailable. Apply Terraform before deploying."
  done

  docker info >/dev/null 2>&1 || die "The Docker daemon is not running."
fi

log "Configuring Docker authentication…"
run gcloud auth configure-docker "$REGISTRY_HOST" --quiet

log "Building production image…"
run docker build \
  --platform "$DOCKER_PLATFORM" \
  --build-arg "VITE_API_BASE_URL=$API_BASE_URL" \
  --build-arg "VITE_ASSET_BASE_URL=$ASSET_BASE_URL" \
  --label "org.opencontainers.image.revision=$GIT_SHA" \
  -f server/Dockerfile \
  -t "$IMAGE" \
  .

log "Pushing image…"
run docker push "$IMAGE"

DEPLOY_IMAGE="$IMAGE"
if [ "$DRY_RUN" -eq 0 ]; then
  IMAGE_DIGEST="$(
    gcloud artifacts docker images describe "$IMAGE" \
      --project="$PROJECT_ID" --format='value(image_summary.digest)'
  )"
  [ -n "$IMAGE_DIGEST" ] || die "The pushed image exists, but Artifact Registry returned no digest."
  DEPLOY_IMAGE="${REGISTRY_HOST}/${PROJECT_ID}/${REPOSITORY}/${IMAGE_NAME}@${IMAGE_DIGEST}"
fi

# Both services receive the same immutable digest. Deploying the API first is the recoverable order:
# the old frontend can call a newer compatible API while the frontend revision is rolling out.
log "Deploying API service from $DEPLOY_IMAGE…"
run gcloud run deploy "$API_SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$DEPLOY_IMAGE" \
  --quiet

log "Deploying frontend service from $DEPLOY_IMAGE…"
run gcloud run deploy "$WEB_SERVICE" \
  --project="$PROJECT_ID" \
  --region="$REGION" \
  --image="$DEPLOY_IMAGE" \
  --quiet

if [ "$SKIP_CDN_INVALIDATION" = "1" ]; then
  warn "Skipping Cloud CDN invalidation because SKIP_CDN_INVALIDATION=1."
else
  log "Invalidating the frontend CDN cache…"
  run gcloud compute url-maps invalidate-cdn-cache "$URL_MAP" \
    --project="$PROJECT_ID" \
    --path='/*' \
    --async
fi

log "Deployment complete: $DEPLOY_IMAGE"
