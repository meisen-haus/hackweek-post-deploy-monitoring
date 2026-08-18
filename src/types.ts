export type DepartureStatus = 'on-time' | 'boarding' | 'delayed';

export interface Departure {
  id: string;
  destination: string;
  gate: string;
  scheduled: string;
  status: DepartureStatus;
}

export interface DeparturesPayload {
  updatedAt: string;
  departures: Departure[];
}

/** One historical observation of how busy a gate was. */
export interface GateSample {
  gate: string;
  minute: number;
  passengers: number;
}

/** Per-flight gate change feed. */
export interface GateChange {
  id: string;
  previousGate: string | null;
}

/** A departure plus the presentation-only fields the board needs. */
export interface DisplayDeparture extends Departure {
  statusLabel: string;
  route: string;
  congestion: number;
  gateChanged: boolean;
}
