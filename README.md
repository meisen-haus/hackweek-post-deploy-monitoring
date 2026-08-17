# Flight Board — post-deploy monitoring demo

A deliberately tiny static app that exists to demonstrate Sentry's **post-deploy
webhook**: merge a PR, watch it deploy to GitHub Pages, and watch Sentry pick up
the regression the new release introduced.

- **Live:** https://meisen-haus.github.io/hackweek-post-deploy-monitoring/
- **Stack:** Vite + TypeScript, no framework, one static JSON "API"
- **Telemetry:** `@sentry/browser` with tracing and session replay, release =
  deployed commit SHA

## How the demo works

```
push/merge to main
  └─ .github/workflows/deploy.yml
       ├─ build     → vite build, release stamped with github.sha
       ├─ deploy    → GitHub Pages
       └─ notify    → Sentry release + deploy, then POST to the deploy webhook
```

The last job is the point of the demo. Nothing tells Sentry that a deploy
happened until the new bundle is actually serving traffic — so the notify job
runs *after* `actions/deploy-pages`, and only then does the webhook fire.

## Running the demo

1. **Baseline.** Load the live page. It renders eight departures, one fetch, no
   errors. In Sentry the `pageload` transaction is a couple hundred
   milliseconds and the release is clean.
2. **Merge the regression PR** (`feat/gate-change-highlights`). It looks like an
   ordinary feature branch and merges cleanly.
3. **Watch the deploy.** The workflow builds, publishes to Pages, then notifies
   the webhook with the new release SHA.
4. **Watch Sentry.** The new release immediately produces:
   - an unhandled `SyntaxError` on every page load, and
   - a `pageload` transaction several seconds slower than the previous release,
     with the time attributable to one long task and a request waterfall.

That "new release + first errors + regressed p75" is exactly the signal the
post-deploy webhook is meant to act on.

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # typecheck + production build into dist/
npm run preview  # serve the production build
```

Without `VITE_SENTRY_DSN` the app still runs; telemetry is skipped and logs a
note to the console. To exercise telemetry locally:

```bash
VITE_SENTRY_DSN='https://…@….ingest.sentry.io/…' npm run dev
```

## Repository configuration

The workflow degrades gracefully: each optional piece is skipped when its
variable is unset, so the app deploys even with nothing configured.

| Setting | Kind | Purpose |
| --- | --- | --- |
| `SENTRY_DSN` | variable (or secret) | Client DSN baked into the bundle. Without it, no telemetry. |
| `SENTRY_ORG` | variable | Org slug. Enables the Sentry release/deploy step. |
| `SENTRY_PROJECT` | variable | Project slug for the release. |
| `SENTRY_AUTH_TOKEN` | secret | Auth token with `project:releases` scope. |
| `DEPLOY_WEBHOOK_URL` | variable | Endpoint the notify job POSTs to. |
| `DEPLOY_WEBHOOK_TOKEN` | secret | Optional; sent as `Authorization: Bearer …`. |

```bash
gh variable set SENTRY_DSN --body 'https://…'
gh variable set DEPLOY_WEBHOOK_URL --body 'https://…'
gh secret set SENTRY_AUTH_TOKEN
```

### Webhook payload

```json
{
  "version": "<commit sha, matches the Sentry release>",
  "environment": "production",
  "url": "https://meisen-haus.github.io/hackweek-post-deploy-monitoring/",
  "ref": "main",
  "repository": "meisen-haus/hackweek-post-deploy-monitoring",
  "deployed_by": "<github actor>",
  "workflow_run": "<url of the run that deployed it>"
}
```

`version` is the join key: it is the same value as the Sentry release and the
`release` tag on every event the deployed bundle sends. Adjust the payload in
`.github/workflows/deploy.yml` to match the shape your endpoint expects.

## Pages setup (one time)

Settings → Pages → Source → **GitHub Actions**. The workflow needs
`pages: write` and `id-token: write`, which are already declared.
