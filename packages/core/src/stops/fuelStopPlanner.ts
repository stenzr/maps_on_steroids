import type { AlongRouteItem } from '../route/alongRoute';

export interface FuelPlanInput {
  /** Stations along the route, ahead of the car (from placesAlongRoute). */
  stations: readonly AlongRouteItem[];
  /** Current range to empty, km. */
  rangeKm: number;
  /** Fuel the user wants left on arrival, as km of driving (reserve level × km/L). */
  reserveKm: number;
  /** Range on a full tank, km (for planning stops after the first refuel). */
  fullTankRangeKm: number;
  /** Remaining route distance, km. */
  remainingKm: number;
}

export interface SuggestedFuelStop {
  item: AlongRouteItem;
  /** Range left when arriving, km. */
  arrivalRangeKm: number;
  score: number;
}

export interface FuelPlan {
  stops: SuggestedFuelStop[];
  /** True when you can finish the route and still keep the reserve. */
  noStopNeeded: boolean;
  /** No open station reachable before dropping to reserve. */
  warning: 'none-reachable' | null;
}

/** Preferred window: refuel after using 60–85% of the range you have. */
export const PREFERRED_WINDOW: readonly [number, number] = [0.6, 0.85];

/**
 * Score a candidate (higher is better). Inside the 60–85% window scores best, falling off
 * outside it; long detours, closed or unknown hours, and poor ratings all cost points.
 */
export function scoreStation(item: AlongRouteItem, rangeKm: number): number {
  const frac = rangeKm > 0 ? item.aheadKm / rangeKm : 1;
  const [lo, hi] = PREFERRED_WINDOW;
  const windowPenalty = frac < lo ? (lo - frac) * 2.5 : frac > hi ? (frac - hi) * 4 : 0;
  const detourPenalty = Math.min(item.detourMin, 30) / 10; // −1 per 10 min
  const openPenalty = item.place.openNow === false ? 3 : item.place.openNow === null ? 0.3 : 0;
  const rating = item.place.rating ?? 3.8;
  const confidence = Math.min(1, (item.place.userRatingCount ?? 0) / 50);
  const ratingBonus = (rating - 3.8) * 0.8 * confidence;
  return 3 - windowPenalty - detourPenalty - openPenalty + ratingBonus;
}

/**
 * Pick stops so you always arrive with at least the reserve. Repeats for long routes,
 * assuming a full tank after each stop.
 */
export function planFuelStops(input: FuelPlanInput): FuelPlan {
  const { stations, reserveKm, fullTankRangeKm, remainingKm } = input;
  if (input.rangeKm - reserveKm >= remainingKm) return { stops: [], noStopNeeded: true, warning: null };

  const stops: SuggestedFuelStop[] = [];
  let fromKm = 0;
  let range = input.rangeKm;
  let warning: FuelPlan['warning'] = null;

  for (let guard = 0; guard < 20; guard++) {
    const usable = range - reserveKm;
    const candidates = stations.filter(
      (s) => s.aheadKm > fromKm + 1 && s.aheadKm - fromKm <= usable && s.place.openNow !== false,
    );
    if (candidates.length === 0) {
      warning = 'none-reachable';
      break;
    }
    const rel = (s: AlongRouteItem): AlongRouteItem => ({ ...s, aheadKm: s.aheadKm - fromKm });
    let best = candidates[0]!;
    let bestScore = -Infinity;
    for (const c of candidates) {
      const sc = scoreStation(rel(c), range);
      if (sc > bestScore) {
        bestScore = sc;
        best = c;
      }
    }
    stops.push({ item: best, arrivalRangeKm: range - (best.aheadKm - fromKm), score: bestScore });
    fromKm = best.aheadKm;
    range = fullTankRangeKm;
    if (range - reserveKm >= remainingKm - fromKm) break;
  }
  return { stops, noStopNeeded: false, warning };
}
