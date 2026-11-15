import type { LatLng } from '../types';
import { initialBearing } from './bearing';
import { distanceMeters } from './distance';

/** Total length of a polyline in metres. */
export function pathLength(path: readonly LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += distanceMeters(path[i - 1]!, path[i]!);
  return total;
}

/** Linear interpolation between two nearby points (fine for segments of a few km). */
export function lerpLatLng(a: LatLng, b: LatLng, t: number): LatLng {
  return {
    latitude: a.latitude + (b.latitude - a.latitude) * t,
    longitude: a.longitude + (b.longitude - a.longitude) * t,
  };
}

export interface PointAlongPath {
  point: LatLng;
  /** Bearing of the segment the point lies on (degrees), null for a degenerate path. */
  segmentBearing: number | null;
  /** True when `distanceM` reached or passed the end of the path. */
  atEnd: boolean;
}

/** The point `distanceM` metres along `path` from its start. */
export function pointAlongPath(path: readonly LatLng[], distanceM: number): PointAlongPath {
  if (path.length === 0) throw new Error('Empty path');
  if (path.length === 1) return { point: path[0]!, segmentBearing: null, atEnd: true };

  let remaining = Math.max(0, distanceM);
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!;
    const b = path[i]!;
    const seg = distanceMeters(a, b);
    if (seg > 0 && remaining <= seg) {
      return { point: lerpLatLng(a, b, remaining / seg), segmentBearing: initialBearing(a, b), atEnd: false };
    }
    remaining -= seg;
  }
  const last = path[path.length - 1]!;
  return { point: last, segmentBearing: initialBearing(path[path.length - 2]!, last), atEnd: true };
}

/**
 * Keep only the trailing part of `path` whose length is at most `maxLengthM`
 * (the newest point is last). The cut is interpolated so the result is exact.
 */
export function trimPathFromEnd<T extends LatLng>(path: readonly T[], maxLengthM: number): LatLng[] {
  if (path.length < 2) return [...path];
  let acc = 0;
  for (let i = path.length - 1; i > 0; i--) {
    const b = path[i]!;
    const a = path[i - 1]!;
    const seg = distanceMeters(a, b);
    if (acc + seg >= maxLengthM) {
      const t = seg === 0 ? 0 : (maxLengthM - acc) / seg;
      return [lerpLatLng(b, a, t), ...path.slice(i)];
    }
    acc += seg;
  }
  return [...path];
}
