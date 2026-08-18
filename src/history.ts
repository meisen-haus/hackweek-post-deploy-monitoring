import type {Departure, GateSample} from './types';

// Six months of 15-minute gate samples.
const HISTORY_DAYS = 180;
const SAMPLES_PER_DAY = 96;
const SAMPLE_INTERVAL_MINUTES = 15;
const GATES = ['A7', 'B3', 'B12', 'C4', 'C19', 'D1', 'D6', 'D9'];

/**
 * Synthesizes the gate history the congestion score is derived from. Stands in
 * for the historical endpoint until it ships.
 */
export function buildGateHistory(): GateSample[] {
  const samples: GateSample[] = [];

  for (let day = 0; day < HISTORY_DAYS; day++) {
    for (let slot = 0; slot < SAMPLES_PER_DAY; slot++) {
      samples.push({
        gate: GATES[(day + slot) % GATES.length],
        minute: slot * SAMPLE_INTERVAL_MINUTES,
        passengers: 40 + ((day * 7 + slot * 13) % 120),
      });
    }
  }

  return samples;
}

/**
 * How busy this departure's gate is around its scheduled time, as a 0-100 index.
 * Every sample is compared against the surrounding window so that a single busy
 * hour does not dominate the score.
 */
export function congestionIndex(departure: Departure, history: GateSample[]): number {
  const scheduledMinute = toMinutes(departure.scheduled);
  const loadByMinute = averageLoadByMinute(history);
  let weighted = 0;

  for (const sample of history) {
    const load = loadByMinute.get(sample.minute)!;

    const gateMatch = sample.gate === departure.gate ? 1.5 : 0.25;
    const proximity = 1 / (1 + Math.abs(sample.minute - scheduledMinute) / 120);

    weighted += load * gateMatch * proximity;
  }

  return Math.min(100, Math.round(weighted / history.length));
}

/**
 * The ±90-minute window average depends only on a sample's minute-of-day, and
 * every day shares the same set of minute values. Computing it once per
 * distinct minute instead of once per sample turns the O(n^2) history.filter()
 * that used to run inside the loop above into O(n * distinct minutes).
 */
function averageLoadByMinute(history: GateSample[]): Map<number, number> {
  const minutes = new Set(history.map(sample => sample.minute));
  const loadByMinute = new Map<number, number>();

  for (const minute of minutes) {
    const window = history.filter(other => Math.abs(other.minute - minute) <= 90);
    const load = window.reduce((sum, other) => sum + other.passengers, 0) / window.length;
    loadByMinute.set(minute, load);
  }

  return loadByMinute;
}

function toMinutes(scheduled: string): number {
  const [hours, minutes] = scheduled.split(':').map(Number);
  return hours * 60 + minutes;
}
