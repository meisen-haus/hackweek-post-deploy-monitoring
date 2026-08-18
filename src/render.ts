import type {DisplayDeparture} from './types';

export function renderBoard(root: HTMLElement, departures: DisplayDeparture[]): void {
  root.replaceChildren(
    ...departures.map(departure => {
      const row = document.createElement('article');
      row.className = 'row';

      const flight = document.createElement('span');
      flight.className = 'flight';
      flight.textContent = departure.id;

      const route = document.createElement('span');
      route.className = 'route';
      route.textContent = departure.route;

      const gate = document.createElement('span');
      gate.className = 'gate';
      gate.textContent = `Gate ${departure.gate}`;

      if (departure.gateChanged) {
        gate.classList.add('gate-changed');
        gate.title = 'Gate changed recently';
      }

      const time = document.createElement('span');
      time.className = 'time';
      time.textContent = departure.scheduled;

      const congestion = document.createElement('span');
      congestion.className = 'congestion';
      congestion.title = 'Gate congestion index';
      congestion.textContent = `${departure.congestion}`;

      const status = document.createElement('span');
      status.className = `status-pill status-${departure.status}`;
      status.textContent = departure.statusLabel;

      row.append(flight, route, gate, time, congestion, status);
      return row;
    })
  );
}

export function renderError(root: HTMLElement, message: string): void {
  const notice = document.createElement('p');
  notice.className = 'status status-error';
  notice.textContent = message;
  root.replaceChildren(notice);
}

export function renderBuildInfo(root: HTMLElement, updatedAt: string): void {
  const release = import.meta.env.VITE_RELEASE ?? 'local';
  const environment = import.meta.env.VITE_ENVIRONMENT ?? 'development';
  root.textContent = `${environment} · ${release.slice(0, 7)} · data ${updatedAt}`;
}
