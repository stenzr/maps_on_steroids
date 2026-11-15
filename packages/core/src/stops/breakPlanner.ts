import type { AlongRouteItem } from '../route/alongRoute';
import { isFoodPlace, restroomEvidence } from '../places/types';

export interface BreakSuggestion {
  /** Planned driving time at which the break falls, hours from now. */
  atHours: number;
  /** Where along the route that is, km ahead. */
  targetKm: number;
  item: AlongRouteItem | null;
}

/**
 * Suggest a stop every `everyHours` of driving, choosing a place with food and a restroom
 * (a restaurant with a reported restroom, or a petrol pump with food) close to each target
 * point. Distance and time are related by the route's average speed.
 */
export function planBreaks(args: {
  candidates: readonly AlongRouteItem[];
  remainingKm: number;
  remainingDurationS: number;
  everyHours: number;
  /** Accept a place this far either side of the target, km. Default: 20 minutes of driving. */
  toleranceKm?: number;
}): BreakSuggestion[] {
  const { candidates, remainingKm, remainingDurationS, everyHours } = args;
  if (remainingDurationS <= 0 || everyHours <= 0) return [];
  const kmPerHour = remainingKm / (remainingDurationS / 3600);
  const tolerance = args.toleranceKm ?? kmPerHour / 3;
  const suitable = candidates.filter((c) => {
    const ev = restroomEvidence(c.place);
    return isFoodPlace(c.place) && (ev === 'reported' || ev === 'public' || ev === 'likely') && c.place.openNow !== false;
  });

  const out: BreakSuggestion[] = [];
  for (let h = everyHours; h < remainingDurationS / 3600; h += everyHours) {
    const targetKm = h * kmPerHour;
    let best: AlongRouteItem | null = null;
    let bestScore = -Infinity;
    for (const c of suitable) {
      const off = Math.abs(c.aheadKm - targetKm);
      if (off > tolerance) continue;
      const score = -off / tolerance - c.detourMin / 10 + ((c.place.rating ?? 3.8) - 3.8) + (c.place.restroom === true ? 0.5 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    out.push({ atHours: h, targetKm, item: best });
  }
  return out;
}
