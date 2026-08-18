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
  let weighted = 0;

  for (const sample of history) {
    const window = history.filter(other => Math.abs(other.minute - sample.minute) <= 90);
    const load = window.reduce((sum, other) => sum + other.passengers, 0) / window.length;

    const gateMatch = sample.gate === departure.gate ? 1.5 : 0.25;
    const proximity = 1 / (1 + Math.abs(sample.minute - scheduledMinute) / 120);

    weighted += load * gateMatch * proximity;
  }

  return Math.min(100, Math.round(weighted / history.length));
}

function toMinutes(scheduled: string): number {
  const [hours, minutes] = scheduled.split(':').map(Number);
  return hours * 60 + minutes;
}
