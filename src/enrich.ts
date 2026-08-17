import type {Departure, DisplayDeparture, DepartureStatus} from './types';

const STATUS_LABELS: Record<DepartureStatus, string> = {
  'on-time': 'On time',
  boarding: 'Boarding',
  delayed: 'Delayed',
};

/**
 * Turns raw API rows into rows the board can render directly. Pure and cheap:
 * the whole list is prepared in a single pass before paint.
 */
export function toDisplayDepartures(departures: Departure[]): DisplayDeparture[] {
  return departures.map(departure => ({
    ...departure,
    statusLabel: STATUS_LABELS[departure.status],
    route: `YYZ → ${departure.destination}`,
  }));
}
