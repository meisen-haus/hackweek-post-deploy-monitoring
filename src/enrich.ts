import {congestionIndex} from './history';
import type {
  Departure,
  DepartureStatus,
  DisplayDeparture,
  GateChange,
  GateSample,
} from './types';

const STATUS_LABELS: Record<DepartureStatus, string> = {
  'on-time': 'On time',
  boarding: 'Boarding',
  delayed: 'Delayed',
};

/**
 * Turns raw API rows into rows the board can render directly, including the gate
 * congestion index and whether the gate changed recently.
 */
export function toDisplayDepartures(
  departures: Departure[],
  history: GateSample[],
  gateChanges: GateChange[]
): DisplayDeparture[] {
  return departures.map(departure => ({
    ...departure,
    statusLabel: STATUS_LABELS[departure.status],
    route: `YYZ → ${departure.destination}`,
    congestion: congestionIndex(departure, history),
    gateChanged: gateChanges.some(
      change => change.id === departure.id && change.previousGate !== null
    ),
  }));
}
