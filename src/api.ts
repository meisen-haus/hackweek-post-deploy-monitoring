import type {DeparturesPayload} from './types';

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
