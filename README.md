# Flight Board — post-deploy monitoring demo

A deliberately tiny static app: merge a PR, watch it deploy to GitHub Pages, and
watch Sentry pick up the regression the new release introduced.

> **Branch note.** This branch (`demo/no-deploy-steps`) omits every deploy-
> registration step. There is no `sentry-cli`, no release object, no sourcemap
> upload, and no `deploys new` — so Sentry never fires a post-deploy webhook
> here. What is left is the app, the Pages deploy, and the synthetic smoke run
> that puts real telemetry on each build. See `main` for the full webhook demo.

- **Live:** https://meisen-haus.github.io/hackweek-post-deploy-monitoring/
- **Stack:** Vite + TypeScript, no framework, one static JSON "API"
- **Telemetry:** `@sentry/browser` with tracing and session replay, release =
  deployed commit SHA + run number

## How the demo works

```
push/merge to main
  └─ .github/workflows/deploy.yml
       ├─ build   → vite build, DSN + release inlined
       ├─ deploy  → GitHub Pages
       └─ smoke   → Playwright against the live site (generates telemetry)
                                    ↓
                       events arrive in Sentry tagged
                       with the release that produced them
```

The release is never registered as an object in Sentry — it exists only as the
`release` tag on the events the bundle sends, which Sentry creates implicitly on
first sight. That is enough to compare one build against the previous one; it is
not enough for release health, suspect commits, sourcemap resolution, or the
post-deploy webhook. Those need the steps on `main`.

Because no sourcemaps are uploaded, stack traces in Sentry show the minified
bundle. `vite build` still emits sourcemaps into `dist/` and Pages serves them,
so the browser devtools resolve fine — Sentry itself will not.

## Synthetic smoke tests

`tests/smoke.spec.ts` runs a real Chromium against the deployed site after every
deploy. Two jobs at once:

- **Catch a broken deploy.** Hard assertions: the site serves the commit that was
  just built (guards against a CDN still handing out the old bundle), and the
  board renders exactly the departures it fetched.
- **Guarantee the release has telemetry.** Driving a real browser is what makes
  the SDK load and report — a `curl` check would execute no JavaScript and
  produce no events. It loads the page several times so the release has more than
  a single sample behind it.

Timings and uncaught errors are **reported to the run summary, not enforced**:

```
| median time to first row | 283ms |
| uncaught errors per load | 0.0   |
```

Which is deliberate. The regression branch still passes every hard assertion —
the board does render, just three seconds late with an error thrown after paint
— so CI goes green and Sentry is what catches it. That is the demo. Two commented
assertions at the bottom of the spec turn those metrics into deploy gates if you
want the opposite behaviour.

```bash
SMOKE_URL='https://meisen-haus.github.io/hackweek-post-deploy-monitoring/' npm run smoke
```

`EXPECTED_RELEASE` (a commit SHA) enables the release check; `SMOKE_LOADS`
controls how many loads the health pass does.

## Running the demo

1. **Baseline.** Load the live page. It renders eight departures, one fetch, no
   errors. In Sentry the `pageload` transaction is a couple hundred
   milliseconds and the release is clean.
2. **Merge the regression PR** (`feat/gate-change-highlights`). It looks like an
   ordinary feature branch and merges cleanly.
3. **Watch the deploy.** The workflow builds, publishes to Pages, and smoke-tests
   the live site.
4. **Watch Sentry.** The new release immediately produces:
   - an unhandled `SyntaxError` on every page load, and
   - a `pageload` transaction several seconds slower than the previous release,
     with the time attributable to one long task and a request waterfall.

Nothing pushes that at you on this branch — you go look. Filtering by the
`release` tag is what separates the new build's events from the old one's.

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
cp .env.example .env.local   # already carries this branch's DSN
npm run dev                  # http://localhost:5173/hackweek-post-deploy-monitoring/
```

`.env.local` is gitignored; see `.env.example` for the annotated list. The three
that matter for the browser SDK:

| Variable | Value |
| --- | --- |
| `VITE_SENTRY_DSN` | `https://df43c498197c27d3cc649d36e923422f@o676634.ingest.us.sentry.io/4511933085188096` — copy verbatim from Settings → Client Keys (DSN). |
| `VITE_RELEASE` | Anything that identifies the build. `local-dev`, or `$(git rev-parse HEAD)`. |
| `VITE_ENVIRONMENT` | `development` |

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

One setting, and the app deploys without it — just with no telemetry.

| Setting | Kind | Purpose |
| --- | --- | --- |
| `SENTRY_DSN` | variable (or secret) | Client DSN baked into the bundle. Must be reachable over https from the deployed site. Without it, no telemetry. |

```bash
gh variable set SENTRY_DSN --body 'https://df43c498197c27d3cc649d36e923422f@o676634.ingest.us.sentry.io/4511933085188096'
```

Repository variables are **repo-wide, not per-branch**, so setting this also
repoints `main`'s deploys at the same project. If `main` needs to keep reporting
somewhere else, leave the variable alone and run this branch locally off
`.env.local` instead.

`SENTRY_URL`, `SENTRY_ORG`, `SENTRY_PROJECT` and `SENTRY_DEV_TOKEN` are unused on
this branch — nothing here talks to the Sentry API.

### What identifies a build

| Attribute | Value |
| --- | --- |
| release version | `<github.sha>+<run_number>` — the commit that produced the bundle, plus the run that deployed it |
| environment | `production` |

The release version is the join key: the same value is the `release` tag on every
event the deployed bundle sends, so "which build is this from?" is answerable
from any event.

The `+<run_number>` suffix guarantees **every deploy is a distinct release**.
Without it, re-running the workflow on an unchanged commit piles the new run's
telemetry onto the release that already carries the previous run's, which ruins
any "this release introduced it" comparison. The SHA stays as the prefix, so a
release is still traceable to its code and the short SHA still shows in the page
footer.

## Pages setup (one time)

Settings → Pages → Source → **GitHub Actions**. The workflow needs
`pages: write` and `id-token: write`, which are already declared.
