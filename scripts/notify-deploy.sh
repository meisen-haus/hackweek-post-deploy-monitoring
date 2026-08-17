#!/usr/bin/env bash
#
# Does locally what the notify-deploy job does in CI: registers a release and a
# deploy with Sentry, then POSTs to the post-deploy webhook.
#
# GitHub Actions cannot reach a devserver on localhost, so this script is how you
# exercise the webhook against local Sentry.
#
#   cp .env.example .env.local   # fill in DSN, org, project, token, webhook URL
#   ./scripts/notify-deploy.sh
#
# Override the release or environment inline:
#
#   VITE_RELEASE=my-test-release ./scripts/notify-deploy.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

VERSION="${VITE_RELEASE:-$(git rev-parse HEAD)}"
ENVIRONMENT="${VITE_ENVIRONMENT:-development}"
APP_URL="${APP_URL:-http://localhost:5173/}"

echo "release:     $VERSION"
echo "environment: $ENVIRONMENT"

# --- Release + deploy --------------------------------------------------------

if [ -n "${SENTRY_ORG:-}" ] && [ -n "${SENTRY_AUTH_TOKEN:-}" ]; then
  # SENTRY_URL, SENTRY_ORG, SENTRY_PROJECT and SENTRY_AUTH_TOKEN are read from
  # the environment by sentry-cli.
  echo "==> registering release with ${SENTRY_URL:-https://sentry.io/}"
  npx @sentry/cli releases new "$VERSION"
  npx @sentry/cli releases set-commits "$VERSION" --auto --ignore-missing
  npx @sentry/cli releases files "$VERSION" upload-sourcemaps dist --rewrite
  npx @sentry/cli releases finalize "$VERSION"
  npx @sentry/cli releases deploys "$VERSION" new --env "$ENVIRONMENT" --url "$APP_URL"
else
  echo "==> skipping release registration (set SENTRY_ORG and SENTRY_AUTH_TOKEN)"
fi

# --- Post-deploy webhook -----------------------------------------------------

if [ -z "${DEPLOY_WEBHOOK_URL:-}" ]; then
  echo "==> skipping webhook (set DEPLOY_WEBHOOK_URL)"
  exit 0
fi

payload=$(
  jq -n \
    --arg version "$VERSION" \
    --arg environment "$ENVIRONMENT" \
    --arg url "$APP_URL" \
    --arg ref "$(git rev-parse --abbrev-ref HEAD)" \
    --arg repository "meisen-haus/hackweek-post-deploy-monitoring" \
    --arg actor "$(git config user.email)" \
    '{
       version: $version,
       environment: $environment,
       url: $url,
       ref: $ref,
       repository: $repository,
       deployed_by: $actor,
       workflow_run: "local"
     }'
)

echo "==> POST $DEPLOY_WEBHOOK_URL"
echo "$payload"

auth=()
if [ -n "${DEPLOY_WEBHOOK_TOKEN:-}" ]; then
  auth=(--header "Authorization: Bearer $DEPLOY_WEBHOOK_TOKEN")
fi

curl --fail-with-body --silent --show-error --dump-header - \
  --request POST "$DEPLOY_WEBHOOK_URL" \
  --header 'Content-Type: application/json' \
  "${auth[@]}" \
  --data "$payload"

echo
