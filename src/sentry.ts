import * as Sentry from '@sentry/browser';

/**
 * Telemetry setup. The DSN and release are injected at build time by the deploy
 * workflow so that every error and transaction is attributed to the exact commit
 * that produced it — that attribution is what the post-deploy webhook relies on.
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
      Sentry.replayIntegration({maskAllText: false, blockAllMedia: false}),
    ],
    // Demo app: capture everything so a single page load is enough to see the
    // regression in Sentry.
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 1.0,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: true,
  });
}

export {Sentry};
