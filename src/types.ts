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

/** A departure plus the presentation-only fields the board needs. */
export interface DisplayDeparture extends Departure {
  statusLabel: string;
  route: string;
}
