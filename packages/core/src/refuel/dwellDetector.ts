import type { LatLng, LocationFix } from '../types';
import { distanceMeters } from '../geo/distance';

export interface DwellConfig {
  /** Stay within this radius… */
  radiusM: number;
  /** …for at least this long… */
  minDurationMs: number;
  /** …then move at least this far from the centre to count as "drove away". */
  departDistanceM: number;
  /** Ignore fixes worse than this. */
  maxAccuracyM: number;
}

export const DEFAULT_DWELL_CONFIG: DwellConfig = {
  radiusM: 60,
  minDurationMs: 3 * 60_000,
  departDistanceM: 150,
  maxAccuracyM: 35,
};

export interface DwellState {
  /** Running mean of fixes inside the current cluster. */
  center: LatLng | null;
  count: number;
  startedAt: number | null;
  lastInsideAt: number | null;
  /** Became a dwell (stayed ≥ minDuration). */
  confirmed: boolean;
}

export const initialDwellState = (): DwellState => ({ center: null, count: 0, startedAt: null, lastInsideAt: null, confirmed: false });

export type DwellEvent =
  /** Fires once when a stop passes the minimum duration: look up nearby petrol stations now. */
  | { kind: 'dwell-confirmed'; center: LatLng; startedAt: number }
  /** Fires when you drive away after a confirmed dwell: time to ask "did you refuel?". */
  | { kind: 'dwell-ended'; center: LatLng; startedAt: number; endedAt: number };

function startCluster(fix: LocationFix): DwellState {
  return { center: { latitude: fix.latitude, longitude: fix.longitude }, count: 1, startedAt: fix.timestamp, lastInsideAt: fix.timestamp, confirmed: false };
}

/**
 * Detects "stayed within ~60 m for more than 3 minutes, then drove away". Pure: feed each
 * fix, act on the events returned.
 */
export function updateDwell(
  state: DwellState,
  fix: LocationFix,
  cfg: DwellConfig = DEFAULT_DWELL_CONFIG,
): { state: DwellState; event: DwellEvent | null } {
  if (fix.accuracy === null || fix.accuracy > cfg.maxAccuracyM) return { state, event: null };
  if (!state.center || state.startedAt === null) return { state: startCluster(fix), event: null };

  const d = distanceMeters(state.center, fix);
  if (d <= cfg.radiusM) {
    const n = state.count + 1;
    const center = {
      latitude: state.center.latitude + (fix.latitude - state.center.latitude) / n,
      longitude: state.center.longitude + (fix.longitude - state.center.longitude) / n,
    };
    const next: DwellState = { ...state, center, count: n, lastInsideAt: fix.timestamp };
    if (!state.confirmed && fix.timestamp - state.startedAt >= cfg.minDurationMs) {
      return { state: { ...next, confirmed: true }, event: { kind: 'dwell-confirmed', center, startedAt: state.startedAt } };
    }
    return { state: next, event: null };
  }

  if (state.confirmed) {
    // Between radius and departDistance: could be GPS drift or edging out of the forecourt; wait.
    if (d < cfg.departDistanceM) return { state, event: null };
    return {
      state: startCluster(fix),
      event: { kind: 'dwell-ended', center: state.center, startedAt: state.startedAt, endedAt: state.lastInsideAt ?? fix.timestamp },
    };
  }
  return { state: startCluster(fix), event: null };
}

/** Station within the radius (+ a little slack for big forecourts), closest first. */
export function matchStation<T extends { location: LatLng }>(center: LatLng, stations: readonly T[], radiusM = 60, slackM = 40): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const s of stations) {
    const d = distanceMeters(center, s.location);
    if (d <= radiusM + slackM && d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/** Key for "don't prompt again for the same stop". */
export const dwellKey = (placeId: string, startedAt: number): string => `${placeId}@${Math.floor(startedAt / 60_000)}`;
