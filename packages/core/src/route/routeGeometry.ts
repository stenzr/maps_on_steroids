import type { LatLng } from '../types';
import { distanceMeters, EARTH_RADIUS_M, toRadians } from '../geo/distance';

/** A route path with cumulative distances, for "km ahead along the route" queries. */
export interface RouteGeometry {
  path: LatLng[];
  /** cumulative[i] = metres from the start to path[i]. */
  cumulative: number[];
  lengthM: number;
}

export function buildRouteGeometry(path: readonly LatLng[]): RouteGeometry {
  const cumulative = [0];
  for (let i = 1; i < path.length; i++) cumulative.push(cumulative[i - 1]! + distanceMeters(path[i - 1]!, path[i]!));
  return { path: [...path], cumulative, lengthM: cumulative.at(-1) ?? 0 };
}

export interface RouteProjection {
  /** Distance along the route to the closest point, metres. */
  alongM: number;
  /** Straight-line distance from the point to the route, metres. */
  offsetM: number;
  segmentIndex: number;
}

/**
 * Closest point on the route to `p`. Uses a local equirectangular projection per segment
 * (accurate to well under 1% for segments of a few km).
 * `hintAlongM`/`windowM` restrict the search to part of the route (e.g. near the car), which
 * avoids snapping to the wrong carriageway where a route doubles back.
 */
export function projectOntoRoute(
  route: RouteGeometry,
  p: LatLng,
  opts: { hintAlongM?: number; windowM?: number } = {},
): RouteProjection | null {
  const { path, cumulative } = route;
  if (path.length === 0) return null;
  if (path.length === 1) return { alongM: 0, offsetM: distanceMeters(path[0]!, p), segmentIndex: 0 };

  const lo = opts.hintAlongM !== undefined && opts.windowM !== undefined ? opts.hintAlongM - opts.windowM : -Infinity;
  const hi = opts.hintAlongM !== undefined && opts.windowM !== undefined ? opts.hintAlongM + opts.windowM : Infinity;
  const cosLat = Math.cos(toRadians(p.latitude));
  const toXY = (q: LatLng): [number, number] => [
    toRadians(q.longitude - p.longitude) * cosLat * EARTH_RADIUS_M,
    toRadians(q.latitude - p.latitude) * EARTH_RADIUS_M,
  ];

  let best: RouteProjection | null = null;
  for (let i = 1; i < path.length; i++) {
    if (cumulative[i]! < lo || cumulative[i - 1]! > hi) continue;
    const [ax, ay] = toXY(path[i - 1]!);
    const [bx, by] = toXY(path[i]!);
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
    const offset = Math.hypot(ax + t * dx, ay + t * dy);
    if (!best || offset < best.offsetM) {
      const segLen = cumulative[i]! - cumulative[i - 1]!;
      best = { alongM: cumulative[i - 1]! + t * segLen, offsetM: offset, segmentIndex: i - 1 };
    }
  }
  return best;
}

/** Sub-path between two along-route distances (for searching a window of the route). */
export function sliceRoute(route: RouteGeometry, fromM: number, toM: number): LatLng[] {
  const { path, cumulative } = route;
  const out: LatLng[] = [];
  for (let i = 0; i < path.length; i++) {
    const c = cumulative[i]!;
    if (c >= fromM && c <= toM) out.push(path[i]!);
  }
  return out.length >= 2 ? out : path.slice(0, 2);
}

/**
 * Splits [fromM, min(toM, length)] into windows of ~windowM metres. Text Search returns at
 * most 20 places per page, so one search over a 500 km route bunches results; searching
 * ~100 km windows spreads them out.
 */
export function routeWindows(route: RouteGeometry, fromM: number, toM: number, windowM: number): [number, number][] {
  const end = Math.min(toM, route.lengthM);
  const out: [number, number][] = [];
  for (let s = Math.max(0, fromM); s < end; s += windowM) out.push([s, Math.min(end, s + windowM)]);
  return out;
}
