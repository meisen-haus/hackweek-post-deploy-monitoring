import {appendFileSync} from 'node:fs';

import {expect, test, type Page} from '@playwright/test';

/**
 * Synthetic checks against a real deploy.
 *
 * Two jobs, deliberately kept separate:
 *
 *  - Hard assertions on things that mean the deploy is broken: the site serves
 *    the commit we just shipped, and the board renders the data it fetched.
 *  - Soft reporting on page-load health (timings, uncaught errors). These are
 *    written to the run summary and never fail the job, because the whole point
 *    of the demo is that Sentry catches a regression CI waved through. Turn the
 *    commented assertions on to make them gates instead.
 *
 * Every test drives a real browser, so the Sentry SDK loads and reports. That
 * is what guarantees each release has telemetry attached before the deploy is
 * registered.
 */

const SITE_URL = process.env.SMOKE_URL;
const EXPECTED_RELEASE = process.env.EXPECTED_RELEASE ?? '';
const LOADS = Number(process.env.SMOKE_LOADS ?? 3);

if (!SITE_URL) {
  throw new Error('SMOKE_URL is required, e.g. https://<user>.github.io/<repo>/');
}

const url = SITE_URL.endsWith('/') ? SITE_URL : `${SITE_URL}/`;

interface LoadResult {
  timeToRowsMs: number;
  rowCount: number;
  pageErrors: string[];
  envelopes: number[];
}

/** Loads the board and waits for it to actually paint rows. */
async function loadBoard(page: Page): Promise<LoadResult> {
  const pageErrors: string[] = [];
  const envelopes: number[] = [];

  page.on('pageerror', error => pageErrors.push(`${error.name}: ${error.message}`));
  page.on('response', response => {
    if (response.url().includes('/envelope/')) {
      envelopes.push(response.status());
    }
  });

  await page.goto(url, {waitUntil: 'commit'});
  await page.locator('.row').first().waitFor({timeout: 60_000});

  const timeToRowsMs = await page.evaluate(() => Math.round(performance.now()));
  const rowCount = await page.locator('.row').count();

  return {timeToRowsMs, rowCount, pageErrors, envelopes};
}

/**
 * Pushes pending events out before the browser goes away. The SDK sends the
 * pageload transaction on an idle timeout, so give it that, then flush
 * explicitly. `window.Sentry` is only there when the deployed build exposes it,
 * so the wait has to stand on its own.
 */
async function flushTelemetry(page: Page): Promise<void> {
  await page.waitForTimeout(2500);
  await page.evaluate(async () => {
    const sentry = (window as Window & {Sentry?: {flush(t: number): Promise<boolean>}})
      .Sentry;
    await sentry?.flush(5000);
  });
}

function report(markdown: string): void {
  console.log(markdown);

  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (summary) {
    appendFileSync(summary, `${markdown}\n`);
  }
}

test('serves the commit that was just deployed', async ({page}) => {
  await loadBoard(page);

  // The footer renders environment · release · data timestamp.
  const buildInfo = await page.locator('#build-info').textContent();
  expect(buildInfo, 'build info footer should be populated').toBeTruthy();

  if (EXPECTED_RELEASE) {
    // Guards against a CDN still serving the previous bundle, which would make
    // every other check here a test of the wrong code.
    expect(buildInfo).toContain(EXPECTED_RELEASE.slice(0, 7));
  }

  await flushTelemetry(page);
});

test('renders every departure it fetched', async ({page}) => {
  const {rowCount} = await loadBoard(page);

  const response = await page.request.get(`${url}api/departures.json`);
  expect(response.ok(), 'departures API should be served').toBeTruthy();
  const payload = (await response.json()) as {departures: unknown[]};

  // Rendered rows should match the data the site itself is serving, so this
  // survives the fixture changing.
  expect(rowCount).toBe(payload.departures.length);

  const firstRow = page.locator('.row').first();
  await expect(firstRow.locator('.flight')).toHaveText(/^[A-Z]{2}\d+$/);
  await expect(firstRow.locator('.route')).toContainText('→');
  await expect(firstRow.locator('.gate')).toContainText('Gate');
  await expect(firstRow.locator('.status-pill')).not.toBeEmpty();

  await flushTelemetry(page);
});

test('reports telemetry to Sentry', async ({page}) => {
  // Registered before navigating, and awaited on its own timeout, so this holds
  // whether or not the deployed build exposes window.Sentry to flush through.
  const firstEnvelope = page
    .waitForResponse(response => response.url().includes('/envelope/'), {
      timeout: 30_000,
    })
    .catch(() => null);

  const {envelopes} = await loadBoard(page);
  const seen = await firstEnvelope;
  await flushTelemetry(page);

  const accepted = envelopes.filter(status => status === 200);
  report(
    [
      '### Telemetry',
      '',
      `Envelopes sent: ${envelopes.length}, accepted: ${accepted.length}.`,
      seen ? `Ingest host: \`${new URL(seen.url()).host}\`.` : 'No envelope observed.',
      '',
    ].join('\n')
  );

  // No DSN at build time means the SDK is tree-shaken out and the release lands
  // in Sentry with nothing attached to it. Worth failing the deploy over.
  expect(seen, 'no envelopes were sent — is SENTRY_DSN set at build time?').not.toBeNull();
  expect(accepted.length, 'Sentry rejected the envelopes').toBeGreaterThan(0);
});

test('records page load health across repeat loads', async ({browser}) => {
  const timings: number[] = [];
  const errors: string[] = [];

  // Several loads so the release has more than a single sample behind it.
  for (let i = 0; i < LOADS; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();

    const result = await loadBoard(page);
    timings.push(result.timeToRowsMs);
    errors.push(...result.pageErrors);

    await flushTelemetry(page);
    await context.close();
  }

  const slowest = Math.max(...timings);
  const median = [...timings].sort((a, b) => a - b)[Math.floor(timings.length / 2)];
  const unique = [...new Set(errors)];

  report(
    [
      '### Page load health',
      '',
      `| Metric | Value |`,
      `| --- | --- |`,
      `| loads | ${LOADS} |`,
      `| median time to first row | ${median}ms |`,
      `| slowest time to first row | ${slowest}ms |`,
      `| uncaught errors per load | ${(errors.length / LOADS).toFixed(1)} |`,
      '',
      unique.length
        ? `Uncaught errors observed:\n\n${unique.map(e => `- \`${e}\``).join('\n')}`
        : 'No uncaught errors observed.',
      '',
    ].join('\n')
  );

  // Reported, not enforced — see the note at the top of this file. Uncomment to
  // turn these into deploy gates:
  // expect(unique, 'uncaught errors on page load').toEqual([]);
  // expect(median, 'median time to first row').toBeLessThan(1500);
});
