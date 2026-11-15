import type { LatLng } from '../types';
import { EARTH_RADIUS_M, toDegrees, toRadians } from './distance';
import { normalizeDegrees } from '../heading/angles';

/**
 * Great-circle initial bearing from `from` to `to`, in degrees [0, 360)
 * clockwise from true north.
 *   θ = atan2(sin Δλ · cos φ2, cos φ1 · sin φ2 − sin φ1 · cos φ2 · cos Δλ)
 * Returns null when the points coincide (bearing undefined).
 */
export function initialBearing(from: LatLng, to: LatLng): number | null {
  if (from.latitude === to.latitude && from.longitude === to.longitude) return null;
  const φ1 = toRadians(from.latitude);
  const φ2 = toRadians(to.latitude);
  const Δλ = toRadians(to.longitude - from.longitude);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return normalizeDegrees(toDegrees(Math.atan2(y, x)));
}

/** Point reached by travelling `distanceM` metres from `origin` on initial bearing `bearingDeg`. */
export function destinationPoint(origin: LatLng, bearingDeg: number, distanceM: number): LatLng {
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = toRadians(bearingDeg);
  const φ1 = toRadians(origin.latitude);
  const λ1 = toRadians(origin.longitude);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { latitude: toDegrees(φ2), longitude: ((toDegrees(λ2) + 540) % 360) - 180 };
}
