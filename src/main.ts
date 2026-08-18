import './styles.css';

import {fetchDepartures, fetchGateChange} from './api';
import {toDisplayDepartures} from './enrich';
import {startGateWatcher} from './gate-watcher';
import {buildGateHistory} from './history';
import {renderBoard, renderBuildInfo, renderError} from './render';
import {initTelemetry, Sentry} from './sentry';
import type {GateChange} from './types';

initTelemetry();

async function boot(): Promise<void> {
  const board = document.querySelector<HTMLElement>('#board');
  const buildInfo = document.querySelector<HTMLElement>('#build-info');

  if (!board || !buildInfo) {
    throw new Error('board markup is missing');
  }

  try {
    const payload = await Sentry.startSpan(
      {name: 'load departures', op: 'app.load'},
      () => fetchDepartures()
    );

    const gateChanges = await Sentry.startSpan(
      {name: 'load gate changes', op: 'app.load'},
      async () => {
        const changes: GateChange[] = [];

        // One request per flight, in order, so the board never shows a gate
        // change out of sequence.
        for (const departure of payload.departures) {
          changes.push(await fetchGateChange(departure.id));
        }

        return changes;
      }
    );

    const rows = Sentry.startSpan({name: 'prepare rows', op: 'app.transform'}, () =>
      toDisplayDepartures(payload.departures, buildGateHistory(), gateChanges)
    );

    Sentry.startSpan({name: 'render board', op: 'ui.render'}, span => {
      renderBoard(board, rows);
      renderBuildInfo(buildInfo, payload.updatedAt);

      span.setAttributes({
        'ui.component_name': 'departure-board',
        'board.row_count': rows.length,
      });
    });

    // One comprehensive log with the state of the board, rather than several
    // scattered ones. Correlated to the pageload trace automatically.
    Sentry.logger.info('Departure board rendered', {
      'board.row_count': rows.length,
      'board.delayed_count': rows.filter(row => row.status === 'delayed').length,
      'board.data_updated_at': payload.updatedAt,
    });
  } catch (error) {
    // Surface the failure to the user and to Sentry rather than leaving a
    // spinner on screen forever.
    renderError(board, 'Departures are unavailable right now.');
    Sentry.logger.error('Departure board failed to load', {
      'error.message': error instanceof Error ? error.message : String(error),
    });
    Sentry.captureException(error);
  }

  // Highlights start after first paint so they cannot delay the board.
  requestAnimationFrame(() => startGateWatcher(board));
}

void boot();
