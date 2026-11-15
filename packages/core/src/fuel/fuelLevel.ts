import { sortLogs } from './mileage';
import type { DistanceTick, FuelCorrection, FuelLog } from './types';

/** GPS km driven in (from, to]. */
export function gpsKmBetween(ticks: readonly DistanceTick[], from: number, to: number): number {
  let km = 0;
  for (const t of ticks) if (t.at > from && t.at <= to) km += t.km;
  return km;
}

export interface FuelEstimate {
  /** Estimated fuel in the tank, clamped to [0, capacity]; null if nothing has been logged. */
  quantity: number | null;
  /** quantity ÷ capacity. */
  fraction: number | null;
  /** Unclamped estimate; negative means the estimate is impossible (missed fill or bad mileage). */
  rawQuantity: number | null;
  /** When the estimate was last anchored to a fill or correction. */
  anchoredAt: number | null;
  /** True when the starting level was guessed (first entry was a partial fill). */
  startGuessed: boolean;
}

export interface FuelEstimateInput {
  capacity: number;
  logs: readonly FuelLog[];
  corrections: readonly FuelCorrection[];
  ticks: readonly DistanceTick[];
  kmPerUnit: number;
  now: number;
}

type Event = { kind: 'fill'; at: number; log: FuelLog } | { kind: 'correction'; at: number; c: FuelCorrection };

/**
 * Replays fills and manual corrections in time order.
 * - Full fill → capacity. Partial fill → previous estimate + quantity, capped at capacity.
 * - Manual correction → fraction × capacity.
 * - Between two fills with no correction between them, the odometer difference is used, which
 *   re-syncs the estimate with the odometer at each log. Otherwise GPS distance is used.
 * - After the last event, GPS distance driven since then is subtracted.
 */
export function estimateFuel(input: FuelEstimateInput): FuelEstimate {
  const { capacity, ticks, kmPerUnit, now } = input;
  const events: Event[] = [
    ...sortLogs(input.logs).map((log): Event => ({ kind: 'fill', at: log.filledAt, log })),
    ...input.corrections.map((c): Event => ({ kind: 'correction', at: c.at, c })),
  ].sort((a, b) => a.at - b.at);

  let level: number | null = null;
  let lastAt: number | null = null;
  let lastFill: FuelLog | null = null;
  let correctedSinceFill = false;
  let startGuessed = false;

  const burn = (km: number): void => {
    if (level !== null && kmPerUnit > 0) level -= km / kmPerUnit;
  };

  for (const e of events) {
    if (e.at > now) break;
    if (e.kind === 'fill') {
      if (level !== null && lastAt !== null) {
        const km =
          lastFill && !correctedSinceFill
            ? Math.max(0, e.log.odometerKm - lastFill.odometerKm)
            : gpsKmBetween(ticks, lastAt, e.at);
        burn(km);
      }
      if (e.log.isFullTank) level = capacity;
      else if (level === null) {
        // Unknown starting point: assume the tank held only what we just added.
        level = Math.min(capacity, e.log.quantity);
        startGuessed = true;
      } else level = Math.min(capacity, Math.max(0, level) + e.log.quantity);
      lastFill = e.log;
      correctedSinceFill = false;
    } else {
      level = Math.min(1, Math.max(0, e.c.fraction)) * capacity;
      correctedSinceFill = true;
      startGuessed = false;
    }
    lastAt = e.at;
  }

  if (level === null || lastAt === null) {
    return { quantity: null, fraction: null, rawQuantity: null, anchoredAt: null, startGuessed: false };
  }
  burn(gpsKmBetween(ticks, lastAt, now));
  const clamped = Math.min(capacity, Math.max(0, level));
  return { quantity: clamped, fraction: clamped / capacity, rawQuantity: level, anchoredAt: lastAt, startGuessed };
}

/** Last logged odometer + GPS distance since: a suggestion for the next log's odometer. */
export function estimatedOdometer(logs: readonly FuelLog[], ticks: readonly DistanceTick[], now: number): number | null {
  const last = sortLogs(logs).at(-1);
  if (!last) return null;
  return Math.round(last.odometerKm + gpsKmBetween(ticks, last.filledAt, now));
}
