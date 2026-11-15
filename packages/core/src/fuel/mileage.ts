import type { FuelLog } from './types';

/** One full-to-full period. */
export interface MileagePeriod {
  startLogId: string;
  endLogId: string;
  startAt: number;
  endAt: number;
  distanceKm: number;
  /** Fuel added after the starting full fill, up to and including the ending full fill. */
  quantity: number;
  /** ₹ spent on that fuel. */
  cost: number;
  kmPerUnit: number;
}

/** Chronological order; odometer breaks ties. */
export function sortLogs(logs: readonly FuelLog[]): FuelLog[] {
  return [...logs].sort((a, b) => a.filledAt - b.filledAt || a.odometerKm - b.odometerKm);
}

/**
 * Full-to-full mileage:
 *   km/L = (odometer at a full fill − odometer at the previous full fill)
 *          ÷ (all fuel added after the previous full fill, up to and including this one).
 * Partial fills are included in the fuel. A period containing an entry flagged
 * `missedPrevious` is dropped, since some fuel is unaccounted for. The first full fill only
 * starts a period.
 */
export function computeMileagePeriods(logs: readonly FuelLog[]): MileagePeriod[] {
  const sorted = sortLogs(logs);
  const periods: MileagePeriod[] = [];
  let start: FuelLog | null = null;
  let quantity = 0;
  let cost = 0;
  let valid = true;

  for (const log of sorted) {
    if (start) {
      quantity += log.quantity;
      cost += log.totalCost;
      if (log.missedPrevious) valid = false;
    }
    if (!log.isFullTank) continue;

    if (start && valid && quantity > 0) {
      const distanceKm = log.odometerKm - start.odometerKm;
      if (distanceKm > 0) {
        periods.push({
          startLogId: start.id,
          endLogId: log.id,
          startAt: start.filledAt,
          endAt: log.filledAt,
          distanceKm,
          quantity,
          cost,
          kmPerUnit: distanceKm / quantity,
        });
      }
    }
    start = log;
    quantity = 0;
    cost = 0;
    valid = true;
  }
  return periods;
}

/** Distance-weighted efficiency over periods: Σkm ÷ Σfuel (more robust than averaging ratios). */
export function weightedEfficiency(periods: readonly MileagePeriod[]): number | null {
  let km = 0;
  let q = 0;
  for (const p of periods) {
    km += p.distanceKm;
    q += p.quantity;
  }
  return q > 0 ? km / q : null;
}

export const ROLLING_WINDOW = 5;

export interface MileageStats {
  latest: number | null;
  /** Average of the last 5 full-to-full periods. */
  rolling: number | null;
  lifetime: number | null;
  periodCount: number;
}

export function mileageStats(logs: readonly FuelLog[]): MileageStats {
  const periods = computeMileagePeriods(logs);
  return {
    latest: periods.at(-1)?.kmPerUnit ?? null,
    rolling: weightedEfficiency(periods.slice(-ROLLING_WINDOW)),
    lifetime: weightedEfficiency(periods),
    periodCount: periods.length,
  };
}

/** Rolling average (last N periods, inclusive) at each period, for the chart's trend line. */
export function rollingSeries(periods: readonly MileagePeriod[], window = ROLLING_WINDOW): (number | null)[] {
  return periods.map((_, i) => weightedEfficiency(periods.slice(Math.max(0, i - window + 1), i + 1)));
}
