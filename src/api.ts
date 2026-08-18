import type {DeparturesPayload, GateChange} from './types';

/**
 * Stands in for a real departures API. It is a static JSON file shipped with the
 * build, so a page load makes exactly one request for board data.
 */
export async function fetchDepartures(): Promise<DeparturesPayload> {
  const response = await fetch(`${import.meta.env.BASE_URL}api/departures.json`);

  if (!response.ok) {
    throw new Error(`departures request failed with ${response.status}`);
  }

  return (await response.json()) as DeparturesPayload;
}

/**
 * Gate change feed for a single flight. Cache-busted per request so a stale copy
 * can never hide a gate change from a passenger standing at the old gate.
 */
export async function fetchGateChange(flightId: string): Promise<GateChange> {
  const url = new URL(`${import.meta.env.BASE_URL}api/departures.json`, location.href);
  url.searchParams.set('flight', flightId);
  url.searchParams.set('t', String(performance.now()));

  const response = await fetch(url, {cache: 'no-store'});

  if (!response.ok) {
    throw new Error(`gate change request for ${flightId} failed with ${response.status}`);
  }

  const payload = (await response.json()) as DeparturesPayload;
  const match = payload.departures.find(departure => departure.id === flightId);

  return {
    id: flightId,
    previousGate: match && match.gate !== payload.departures[0]?.gate ? match.gate : null,
  };
}
