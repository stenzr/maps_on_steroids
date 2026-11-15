import type { LatLng } from '../types';
import { distanceMeters } from '../geo/distance';
import { trimPathFromEnd } from '../geo/path';

export interface BreadcrumbOptions {
  /** Skip points closer than this to the previous one. */
  minSpacingM: number;
  /** Keep only the most recent stretch of this length. */
  maxLengthM: number;
}

export const DEFAULT_BREADCRUMB_OPTIONS: BreadcrumbOptions = { minSpacingM: 5, maxLengthM: 500 };

/** Add a point to the trail (newest last) and trim it to the last `maxLengthM` metres. */
export function appendBreadcrumb(
  trail: readonly LatLng[],
  point: LatLng,
  opts: BreadcrumbOptions = DEFAULT_BREADCRUMB_OPTIONS,
): LatLng[] {
  const last = trail[trail.length - 1];
  if (last && distanceMeters(last, point) < opts.minSpacingM) return trail as LatLng[];
  const p = { latitude: point.latitude, longitude: point.longitude };
  return trimPathFromEnd([...trail, p], opts.maxLengthM);
}
