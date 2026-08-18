# Flight Board — post-deploy monitoring demo

A deliberately tiny static app that exists to demonstrate Sentry's **post-deploy
webhook**: merge a PR, watch it deploy to GitHub Pages, and watch Sentry pick up
the regression the new release introduced.

- **Live:** https://meisen-haus.github.io/hackweek-post-deploy-monitoring/
- **Stack:** Vite + TypeScript, no framework, one static JSON "API"
- **Telemetry:** `@sentry/browser` with tracing and session replay, release =
  deployed commit SHA + run number

## How the demo works

```
push/merge to main
  └─ .github/workflows/deploy.yml
       ├─ build           → vite build, release, sourcemaps injected + uploaded
       ├─ deploy          → GitHub Pages
       └─ sentry-deploy   → deploys new
                                    ↓
                            Sentry fires the post-deploy webhook
```

The webhook is not sent by CI — CI only registers the deploy, and **Sentry** emits
the webhook off the back of that. Which means the ordering matters: nothing tells
Sentry a deploy happened until the new bundle is actually serving traffic, so
`sentry-deploy` runs *after* `actions/deploy-pages`. Registering the deploy
first would fire the webhook while the old bundle was still live.

## Running the demo

1. **Baseline.** Load the live page. It renders eight departures, one fetch, no
   errors. In Sentry the `pageload` transaction is a couple hundred
   milliseconds and the release is clean.
2. **Merge the regression PR** (`feat/gate-change-highlights`). It looks like an
   ordinary feature branch and merges cleanly.
3. **Watch the deploy.** The workflow builds, publishes to Pages, then registers
   the release and deploy — and Sentry fires the post-deploy webhook.
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

## Pointing the demo at Sentry

```bash
cp .env.example .env.local   # already carries the project's DSN
npm run dev                  # http://localhost:5173/hackweek-post-deploy-monitoring/
```

`.env.local` is gitignored; see `.env.example` for the annotated list. The three
that matter for the browser SDK:

| Variable | Value |
| --- | --- |
| `VITE_SENTRY_DSN` | `https://df43c498197c27d3cc649d36e923422f@o676634.ingest.us.sentry.io/4511933085188096` — copy verbatim from Settings → Client Keys (DSN). |
| `VITE_RELEASE` | Anything, as long as it matches the release CI registers. `local-dev`, or `$(git rev-parse HEAD)`. |
| `VITE_ENVIRONMENT` | `development` |

Releases and deploys are registered from CI only. There is no local
`register-deploy.sh` counterpart — to fire the webhook, push and let the
workflow run.

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

The workflow degrades gracefully: the release and deploy steps are skipped when
`SENTRY_PROJECT` is unset, so the app deploys even with nothing configured.

| Setting | Kind | Purpose |
| --- | --- | --- |
| `SENTRY_DSN` | variable (or secret) | Client DSN baked into the bundle. Without it, no telemetry. |
| `SENTRY_ORG` | variable | Org slug that owns the project. |
| `SENTRY_PROJECT` | variable | Project slug. **Enables the release and deploy steps** — unset means both are skipped. |
| `SENTRY_AUTH_TOKEN` | secret | Org auth token with `project:releases` (and `org:read` for `set-commits --auto`). From Settings → Auth Tokens. |
| `SENTRY_URL` | variable | *Optional.* Base URL of the Sentry install: **trailing slash, no `/api/0`**. Defaults to `https://sentry.io/`; only set it for self-hosted or a devserver. |

```bash
gh variable set SENTRY_DSN --body 'https://df43c498197c27d3cc649d36e923422f@o676634.ingest.us.sentry.io/4511933085188096'
gh variable set SENTRY_ORG --body '<org-slug>'
gh variable set SENTRY_PROJECT --body '<project-slug>'
gh secret   set SENTRY_AUTH_TOKEN
```

Repository variables and secrets are **repo-wide, not per-branch**, so these also
apply to `main`'s deploys.

Nothing here configures the webhook itself — that is set up on the Sentry side,
against the project this workflow registers deploys for.

### What the deploy carries

The `sentry-deploy` job registers a deploy with these attributes, which are what
the webhook has to work with:

| Attribute | Value |
| --- | --- |
| release version | `<github.sha>+<run_number>` — the commit that produced the bundle, plus the run that deployed it |
| environment | `production` |
| url | the Pages URL, from `actions/deploy-pages` |
| commits | associated via `set-commits --auto` when the repo is linked to the org through Sentry's GitHub integration |
| sourcemaps | debug IDs injected into `dist/` before Pages publishes, uploaded against the release |

The release version is the join key: the same value is the `release` tag on every
event the deployed bundle sends, so a webhook consumer can go straight from
"deploy happened" to "errors and transactions belonging to that deploy".

The `+<run_number>` suffix guarantees **every deploy is a net-new release**.
Without it, re-running the workflow on an unchanged commit reuses the existing
release — `POST /releases/` answers `208 Already Reported` — and the new deploy
attaches to a release that already carries telemetry from the previous run,
which ruins any "this release introduced it" comparison. The SHA stays as the
prefix, so a release is still traceable to its code and the short SHA still
shows in the page footer.

## No synthetic traffic

CI does not drive a browser at the deploy, which has one consequence worth
knowing: **a release has no telemetry at the moment its webhook fires.** Events show up only once real traffic hits the page, and a webhook
consumer that reads the release immediately will find it empty. `tests/smoke.spec.ts`
still works if you want to generate that traffic by hand:

```bash
SMOKE_URL='https://meisen-haus.github.io/hackweek-post-deploy-monitoring/' npm run smoke
```

`EXPECTED_RELEASE` (a commit SHA) enables the release check; `SMOKE_LOADS`
controls how many loads the health pass does.

## Pages setup (one time)

Settings → Pages → Source → **GitHub Actions**. The workflow needs
`pages: write` and `id-token: write`, which are already declared.
