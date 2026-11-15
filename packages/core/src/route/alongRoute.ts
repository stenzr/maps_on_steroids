import type { LatLng } from '../types';
import type { Place } from '../places/types';
import { projectOntoRoute, type RouteGeometry } from './routeGeometry';

export interface AlongRouteItem {
  place: Place;
  /** Distance ahead of the car along the route, km. */
  aheadKm: number;
  /** Extra driving time to visit it, minutes. */
  detourMin: number;
  /** Whether the detour came from Google routing (true) or our straight-line estimate (false). */
  detourFromGoogle: boolean;
  /** Distance from the route line, metres. */
  offsetM: number;
}

export interface RouteProgress {
  /** Where the car is along the route, metres. */
  alongM: number;
  /** Remaining drive time to destination from here, seconds. */
  remainingDurationS: number;
}

/** Route duration remaining, assuming constant average speed along the route. */
export function progressOnRoute(route: RouteGeometry, totalDurationS: number, car: LatLng | null, hintAlongM?: number): RouteProgress {
  const proj = car ? projectOntoRoute(route, car, hintAlongM !== undefined ? { hintAlongM, windowM: 20_000 } : {}) : null;
  const alongM = proj?.alongM ?? 0;
  const frac = route.lengthM > 0 ? Math.min(1, alongM / route.lengthM) : 0;
  return { alongM, remainingDurationS: totalDurationS * (1 - frac) };
}

/** Off-route speed used to estimate a detour when Google doesn't return legs (~25 km/h on local roads). */
const LOCAL_SPEED_MPS = 7;

/**
 * Detour = (here → place → destination) − (here → destination). With search-along-route and
 * routingSummaries, Google gives legs[0] = here → place and legs[1] = place → destination.
 * Without both legs, fall back to an out-and-back estimate from the distance off the route.
 */
export function detourMinutes(place: Place, offsetM: number, progress: RouteProgress): { minutes: number; fromGoogle: boolean } {
  if (place.legToPlace && place.legFromPlace) {
    const extra = place.legToPlace.durationS + place.legFromPlace.durationS - progress.remainingDurationS;
    return { minutes: Math.max(0, extra / 60), fromGoogle: true };
  }
  // 2× offset for there-and-back, plus a minute to pull in and out.
  return { minutes: (2 * offsetM) / LOCAL_SPEED_MPS / 60 + 1, fromGoogle: false };
}

/**
 * Places ahead of the car, sorted by distance along the route (not straight-line distance).
 * Places more than `maxOffsetM` from the route, or already behind the car, are dropped.
 */
export function placesAlongRoute(
  route: RouteGeometry,
  places: readonly Place[],
  progress: RouteProgress,
  opts: { maxOffsetM?: number; behindToleranceM?: number } = {},
): AlongRouteItem[] {
  const maxOffset = opts.maxOffsetM ?? 3000;
  const behind = opts.behindToleranceM ?? 200;
  const seen = new Set<string>();
  const items: AlongRouteItem[] = [];
  for (const place of places) {
    if (seen.has(place.placeId)) continue;
    seen.add(place.placeId);
    const proj = projectOntoRoute(route, place.location);
    if (!proj || proj.offsetM > maxOffset) continue;
    const aheadM = proj.alongM - progress.alongM;
    if (aheadM < -behind) continue;
    const d = detourMinutes(place, proj.offsetM, progress);
    items.push({
      place,
      aheadKm: Math.max(0, aheadM) / 1000,
      detourMin: d.minutes,
      detourFromGoogle: d.fromGoogle,
      offsetM: proj.offsetM,
    });
  }
  return items.sort((a, b) => a.aheadKm - b.aheadKm);
}
