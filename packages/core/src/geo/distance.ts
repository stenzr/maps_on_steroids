import type { LatLng } from '../types';

/** Mean Earth radius in metres (IUGG). */
export const EARTH_RADIUS_M = 6_371_008.8;

export const toRadians = (deg: number): number => (deg * Math.PI) / 180;
export const toDegrees = (rad: number): number => (rad * 180) / Math.PI;

/** Great-circle distance in metres (haversine). */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const φ1 = toRadians(a.latitude);
  const φ2 = toRadians(b.latitude);
  const Δφ = φ2 - φ1;
  const Δλ = toRadians(b.longitude - a.longitude);
  const h = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
