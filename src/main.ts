import './styles.css';

import {fetchDepartures} from './api';
import {toDisplayDepartures} from './enrich';
import {renderBoard, renderBuildInfo, renderError} from './render';
import {initTelemetry, Sentry} from './sentry';

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

    const rows = Sentry.startSpan({name: 'prepare rows', op: 'app.transform'}, () =>
      toDisplayDepartures(payload.departures)
    );

    Sentry.startSpan({name: 'render board', op: 'ui.render'}, () => {
      renderBoard(board, rows);
      renderBuildInfo(buildInfo, payload.updatedAt);
    });
  } catch (error) {
    // Surface the failure to the user and to Sentry rather than leaving a
    // spinner on screen forever.
    renderError(board, 'Departures are unavailable right now.');
    Sentry.captureException(error);
  }
}

void boot();
