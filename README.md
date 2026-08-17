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
note to the console. Note that Vite *inlines* the DSN at build time, so an unset
DSN makes `Sentry.init` dead code and the SDK is tree-shaken out entirely
(279 kB → 33 kB bundle). No DSN at build time means no telemetry, full stop.

## Pointing the demo at a local Sentry devserver

```bash
cp .env.example .env.local   # fill in the DSN, org, project, token, webhook URL
npm run dev                  # http://localhost:5173/hackweek-post-deploy-monitoring/
```

Everything is driven by `.env.local` (gitignored); see `.env.example` for the
full annotated list. The three that matter for the browser SDK:

| Variable | Local devserver value |
| --- | --- |
| `VITE_SENTRY_DSN` | `http://<public_key>@localhost:8000/<project_id>` — copy verbatim from Settings → Client Keys (DSN). `http`, not `https`. |
| `VITE_RELEASE` | Anything, as long as it matches the release you register. `local-dev`, or `$(git rev-parse HEAD)`. |
| `VITE_ENVIRONMENT` | `development` |

A raw `localhost` DSN only works for a locally-served app: Pages is https, so the
browser blocks an http DSN as mixed content, and GitHub Actions can't route to
`localhost` at all. Tunnelling the devserver fixes both.

### Full end-to-end against a local devserver, via ngrok

```bash
ngrok http 8000
sentry devserver --ngrok=<you>.ngrok.app   # host only, no protocol
```

`--ngrok` sets `SENTRY_DEVSERVER_NGROK`, which rewrites `system.url-prefix`,
`ALLOWED_HOSTS` and the CSRF trusted origins to the tunnel host — without it the
devserver rejects the forwarded requests. Then point both halves at the tunnel:

```bash
gh variable set SENTRY_URL --body 'https://<you>.ngrok.app/'   # trailing slash
gh variable set SENTRY_DSN --body 'https://<key>@<you>.ngrok.app/<project_id>'
gh variable set SENTRY_PROJECT --body '<project_slug>'
gh secret   set SENTRY_DEV_TOKEN
```

Now the deployed Pages site reports events to your local Sentry through the
tunnel, and the workflow's release/deploy step and webhook POST reach it too.
The ngrok host changes every restart on the free tier, so these are variables
rather than anything hardcoded.

### Firing the deploy webhook locally

If you'd rather not tunnel, the CI notify job has a local counterpart:

```bash
./scripts/notify-deploy.sh
```

It registers the release and a deploy against `SENTRY_URL` via `sentry-cli`,
then POSTs the same payload the workflow sends to `DEPLOY_WEBHOOK_URL`. Set
`DEPLOY_WEBHOOK_URL=http://localhost:8000/<your-webhook-path>` in `.env.local`.
Both halves are skipped when their variables are unset, so you can run just the
webhook POST if that's all you're testing.

### Reproducing the regression locally

```bash
git checkout feat/gate-change-highlights
npm run dev
```

Leave `VITE_FEATURE_FLAGS` **unset** — that unset variable *is* the bug. The
board still renders, ~3s late, and throws an uncaught `SyntaxError` on every
load. Setting `VITE_FEATURE_FLAGS={"gateHighlights":true,"countdownSeconds":8}`
fixes the error but not the slowdown.

## Repository configuration

The workflow degrades gracefully: each optional piece is skipped when its
variable is unset, so the app deploys even with nothing configured.

| Setting | Kind | Purpose |
| --- | --- | --- |
| `SENTRY_DSN` | variable (or secret) | Client DSN baked into the bundle. Must be reachable over https from the deployed site — sentry.io, or your ngrok host. Without it, no telemetry. |
| `SENTRY_URL` | variable | Base URL of the Sentry install: **trailing slash, no `/api/0`**. Enables the release/deploy step. `https://<you>.ngrok.app/` for a devserver. |
| `SENTRY_ORG` | variable | Org slug. Defaults to `sentry`. |
| `SENTRY_PROJECT` | variable | Project slug for the release. |
| `SENTRY_DEV_TOKEN` | secret | Auth token with `project:releases`. From `/settings/account/api/auth-tokens/` on whichever install `SENTRY_URL` points at. |
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
