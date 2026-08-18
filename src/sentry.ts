import * as Sentry from '@sentry/browser';

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

    dataCollection: {
      userInfo: true,
    },
  });

  // Exposed so the synthetic smoke tests can flush pending events before the
  // browser closes, instead of guessing at a sleep long enough to cover it.
  (window as Window & {Sentry?: typeof Sentry}).Sentry = Sentry;
}

export {Sentry};
