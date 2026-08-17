#!/usr/bin/env bash
#
# Does locally what the sentry-release job does in CI: registers a release, its
# sourcemaps, and a deploy. Registering the deploy is what makes Sentry fire its
# post-deploy webhook, so this is how you trigger that webhook against a local
# devserver without involving GitHub Actions at all.
#
#   cp .env.example .env.local   # fill in SENTRY_URL, org, project, token
#   npm run build
#   ./scripts/register-deploy.sh
#
# Override the release or environment inline:
#
#   VITE_RELEASE=my-test-release ./scripts/register-deploy.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env.local ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

if [ -z "${SENTRY_ORG:-}" ] || [ -z "${SENTRY_AUTH_TOKEN:-}" ]; then
  echo "SENTRY_ORG and SENTRY_AUTH_TOKEN are required; see .env.example" >&2
  exit 1
fi

VERSION="${VITE_RELEASE:-$(git rev-parse HEAD)}"
ENVIRONMENT="${VITE_ENVIRONMENT:-development}"
APP_URL="${APP_URL:-http://localhost:5173/hackweek-post-deploy-monitoring/}"

echo "sentry:      ${SENTRY_URL:-https://sentry.io/}"
echo "release:     $VERSION"
echo "environment: $ENVIRONMENT"

# SENTRY_URL, SENTRY_ORG, SENTRY_PROJECT and SENTRY_AUTH_TOKEN are read from the
# environment by sentry-cli.
cli() { npx --yes @sentry/cli "$@"; }

cli releases new "$VERSION"

cli releases set-commits "$VERSION" --auto \
  || echo "warning: set-commits --auto failed; release has no commits"

if [ -d dist/assets ]; then
  cli sourcemaps upload dist/assets --release "$VERSION" --url-prefix '~/assets'
else
  echo "warning: no dist/assets, skipping sourcemaps (run npm run build first)"
fi

cli releases finalize "$VERSION"

# The deploy is the trigger: Sentry sends the post-deploy webhook from here.
cli deploys new --release "$VERSION" -e "$ENVIRONMENT" --url "$APP_URL"

echo
echo "Deploy registered. Sentry should now have fired its post-deploy webhook."
