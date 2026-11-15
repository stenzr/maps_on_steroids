import type { LatLng, LocationFix } from '../types';
import { distanceMeters } from '../geo/distance';

export interface FixBufferOptions {
  /** Drop fixes older than this (ms before the newest fix). */
  maxAgeMs: number;
  /**
   * Keep history back to (and including) the newest fix that is at least this far from
   * the current position; anything older is redundant.
   */
  keepDistanceM: number;
  /** Hard cap on the number of fixes kept. */
  maxLength: number;
}

/** Append `fix` (newest last) and prune by age, distance and length. Returns a new array. */
export function pushFix(buffer: readonly LocationFix[], fix: LocationFix, opts: FixBufferOptions): LocationFix[] {
  const minTs = fix.timestamp - opts.maxAgeMs;
  let start = 0;
  while (start < buffer.length && buffer[start]!.timestamp < minTs) start++;

  // Walking newest → oldest, the first fix ≥ keepDistanceM away is the oldest one still needed.
  for (let i = buffer.length - 1; i >= start; i--) {
    if (distanceMeters(buffer[i]!, fix) >= opts.keepDistanceM) {
      start = i;
      break;
    }
  }
  const next = [...buffer.slice(start), fix];
  return next.length > opts.maxLength ? next.slice(next.length - opts.maxLength) : next;
}

/**
 * The trend anchor: walking back from the newest buffered fix, the first fix that is at
 * least `minDistanceM` from `current`. That is the most recent point ≥ D metres behind, so
 * the bearing anchor → current covers about the last D metres of travel.
 */
export function findTrendAnchor(
  buffer: readonly LocationFix[],
  current: LatLng,
  minDistanceM: number,
): LocationFix | null {
  for (let i = buffer.length - 1; i >= 0; i--) {
    const f = buffer[i]!;
    if (distanceMeters(f, current) >= minDistanceM) return f;
  }
  return null;
}

/** Newest buffered fix whose timestamp is at or before `timestamp`. */
export function findFixAtOrBefore(buffer: readonly LocationFix[], timestamp: number): LocationFix | null {
  for (let i = buffer.length - 1; i >= 0; i--) {
    if (buffer[i]!.timestamp <= timestamp) return buffer[i]!;
  }
  return null;
}
