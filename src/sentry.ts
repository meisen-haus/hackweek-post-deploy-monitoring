import * as Sentry from '@sentry/browser';

const ORG_ADJECTIVES = [
  'amber', 'brisk', 'cobalt', 'crimson', 'dusky', 'eager', 'fabled', 'gilded',
  'hollow', 'ivory', 'jagged', 'keen', 'lucid', 'mellow', 'nimble', 'opal',
  'quiet', 'rustic', 'silent', 'tidal',
];

const ORG_NOUNS = [
  'anchor', 'beacon', 'canyon', 'delta', 'ember', 'falcon', 'grove', 'harbor',
  'isle', 'junction', 'kestrel', 'lantern', 'meadow', 'nebula', 'orchard',
  'pillar', 'quarry', 'ridge', 'summit', 'thicket',
];

/**
 * A synthetic organization for feedback to be attributed to — a fresh one per
 * page load, so submissions spread across many orgs instead of piling onto one.
 *
 * `Math.random()` is [0, 1), so the id lands in 100000–999999: always six
 * digits, never a leading zero. The slug is *derived* from the id rather than
 * drawn separately, so one org never shows up under two different slugs.
 *
 * The reverse is not true. 20 x 20 words is 400 slugs against 900000 ids, so
 * distinct orgs do collide on a slug — fine for grouping a demo's feedback,
 * not something to treat as a key. Append the id to the slug if you need it
 * unique. To keep a visitor on one org across reloads, cache the result in
 * sessionStorage.
 */
function organization(): {id: string; slug: string} {
  const id = Math.floor(100_000 + Math.random() * 900_000);
  const adjective = ORG_ADJECTIVES[id % ORG_ADJECTIVES.length];
  const noun = ORG_NOUNS[Math.floor(id / ORG_ADJECTIVES.length) % ORG_NOUNS.length];

  return {id: String(id), slug: `${adjective}-${noun}`};
}

/**
 * The synthetic end user behind the page load. Eight digits so it reads
 * distinctly from the six-digit organization id above.
 *
 * Only ever used as `user.id`. Setting an email or username here would defeat
 * showEmail/showName: the feedback widget reads exactly those two off the
 * scope user, via the `useSentryUser` mapping, and would put contact_email and
 * name back into a linked ticket. `user.id` is not in Sentry's evidence
 * allowlist, so it stays out of the ticket body.
 */
function userId(): string {
  return String(Math.floor(10_000_000 + Math.random() * 90_000_000));
}

/**
 * Telemetry setup. The DSN and release are injected at build time by the deploy
 * workflow so that every error, span and log is attributed to the exact commit
 * that produced it — that attribution is what the post-deploy webhook relies on.
 *
 * Signals wired up here: errors, tracing, session replay, structured logs, and
 * the user feedback widget. Browser profiling is deliberately absent — it needs
 * a `Document-Policy: js-profiling` response header on the document, and GitHub
 * Pages cannot set custom response headers, so it would silently collect
 * nothing.
 */
export function initTelemetry(): void {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  const org = organization();

  if (!dsn) {
    // Local dev without a DSN should still boot; just skip telemetry.
    console.info('[telemetry] no VITE_SENTRY_DSN set, skipping Sentry init');
    return;
  }

  Sentry.init({
    dsn,
    release: import.meta.env.VITE_RELEASE,
    environment: import.meta.env.VITE_ENVIRONMENT ?? 'development',

    integrations: [
      Sentry.browserTracingIntegration(),
      // The board shows public flight data, so replays are left unmasked on
      // purpose — a masked replay of this page would be unreadable and there is
      // nothing here worth redacting.
      Sentry.replayIntegration({maskAllText: false, blockAllMedia: false}),
      // console.* calls become structured Sentry logs, correlated to the trace.
      Sentry.consoleLoggingIntegration({levels: ['log', 'warn', 'error']}),
      Sentry.feedbackIntegration({
        colorScheme: 'system',
        triggerLabel: 'Report a problem',
        formTitle: 'Report a problem',
        submitButtonLabel: 'Send report',
        // The ticket body Sentry generates for a linked issue is a table of
        // `evidence_display`, which make_evidence() builds from a fixed
        // allowlist — associated_event_id, contact_email, message, name,
        // is_spam, spam_detection_enabled — each row guarded by a presence
        // check. Not collecting name or email is therefore what keeps those
        // two rows out of the ticket; there is no formatting knob.
        showName: false,
        showEmail: false,
        // Merged into the feedback event by the integration, so the tags land
        // on submitted feedback only — not on errors or transactions.
        tags: {organization: org.id, 'organization.slug': org.slug},
      }),
    ],

    // Demo app: capture everything so a single page load is enough to see a
    // regression in Sentry. Lower these for anything with real traffic.
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 1.0,
    replaysOnErrorSampleRate: 1.0,

    // Structured logs — off by default, so Sentry.logger.* would be a no-op
    // without this.
    enableLogs: true,

    // Off (the default) on purpose. Auto-populating `user.*` would put an
    // email on the scope, and the widget still picks that up for
    // contact_email even with showEmail: false — which would put the row
    // back in the ticket.
    dataCollection: {
      userInfo: false,
    },
  });

  // Applies to every event — errors, transactions and feedback alike — not
  // just the feedback the organization tags are scoped to.
  Sentry.setUser({id: userId()});

  // Exposed so the synthetic smoke tests can flush pending events before the
  // browser closes, instead of guessing at a sleep long enough to cover it.
  (window as Window & {Sentry?: typeof Sentry}).Sentry = Sentry;
}

export {Sentry};
