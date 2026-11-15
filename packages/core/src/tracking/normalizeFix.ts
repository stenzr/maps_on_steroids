import type { LocationFix } from '../types';

/** Shape of a platform location (expo-location's LocationObject is structurally compatible). */
export interface RawPlatformLocation {
  timestamp: number;
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    speed: number | null;
    /** On expo-location this is the GPS course over ground (direction of travel), not the compass. */
    heading: number | null;
  };
}

const finiteOrNull = (v: number | null | undefined): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/** Convert a platform location to a LocationFix, mapping "unknown" sentinels (negative values) to null. */
export function normalizeFix(raw: RawPlatformLocation): LocationFix {
  const accuracy = finiteOrNull(raw.coords.accuracy);
  const speed = finiteOrNull(raw.coords.speed);
  const course = finiteOrNull(raw.coords.heading);
  return {
    timestamp: raw.timestamp,
    latitude: raw.coords.latitude,
    longitude: raw.coords.longitude,
    accuracy: accuracy !== null && accuracy >= 0 ? accuracy : null,
    speed: speed !== null && speed >= 0 ? speed : null,
    course: course !== null && course >= 0 ? course % 360 : null,
  };
}
