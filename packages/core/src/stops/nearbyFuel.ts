import type { LatLng } from '../types';
import { initialBearing } from '../geo/bearing';
import { distanceMeters } from '../geo/distance';
import { angleDelta } from '../heading/angles';
import type { Place } from '../places/types';

export interface NearbyStation {
  place: Place;
  distanceKm: number;
  /** 0 = dead ahead, 180 = directly behind; null without a heading. */
  angleOffHeading: number | null;
  ahead: boolean;
  /** Sort key: distance stretched for stations behind you (you'd need to turn around). */
  effectiveKm: number;
}

/**
 * No route: nearby open stations, preferring ones ahead (by direction of travel) over ones
 * behind. A station 90° off counts as 1.5× its distance, one directly behind as 3×.
 */
export function rankNearbyStations(places: readonly Place[], here: LatLng, headingDeg: number | null): NearbyStation[] {
  return places
    .filter((p) => p.openNow !== false)
    .map((place) => {
      const distanceKm = distanceMeters(here, place.location) / 1000;
      const brg = initialBearing(here, place.location);
      const angle = headingDeg === null || brg === null ? null : Math.abs(angleDelta(headingDeg, brg));
      const factor = angle === null ? 1 : 1 + (angle / 180) * 2;
      return { place, distanceKm, angleOffHeading: angle, ahead: angle === null || angle <= 90, effectiveKm: distanceKm * factor };
    })
    .sort((a, b) => a.effectiveKm - b.effectiveKm);
}

/** Below this range with no route, show nearby stations. */
export const DEFAULT_LOW_RANGE_KM = 60;
