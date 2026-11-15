import type { LatLng, LocationFix } from '../types';
import { distanceMeters } from '../geo/distance';
import { emptyFixGate, gateFix, type FixGateState } from './fixGate';

export interface DistanceTrackerOptions {
  /** Feature 2: ignore fixes with accuracy worse than 25 m. */
  maxAccuracyM: number;
  maxPlausibleSpeedMps: number;
  /** Don't count movement until we're at least this far (or the fix's accuracy radius, if larger) from the last counted point. */
  minStepM: number;
}

export const DEFAULT_DISTANCE_OPTIONS: DistanceTrackerOptions = {
  maxAccuracyM: 25,
  maxPlausibleSpeedMps: 70,
  minStepM: 10,
};

export interface DistanceTrackerState {
  gate: FixGateState;
  lastCounted: LatLng | null;
  totalMeters: number;
}

export const initialDistanceTracker = (): DistanceTrackerState => ({
  gate: emptyFixGate(),
  lastCounted: null,
  totalMeters: 0,
});

/**
 * GPS distance driven, with jitter filtered out. Movement is counted between "committed"
 * points at least max(minStep, accuracy) apart, so a parked phone wandering ±10 m adds nothing.
 */
export function trackDistance(
  state: DistanceTrackerState,
  fix: LocationFix,
  opts: DistanceTrackerOptions = DEFAULT_DISTANCE_OPTIONS,
): DistanceTrackerState {
  const g = gateFix(state.gate, fix, { maxAccuracyM: opts.maxAccuracyM, maxPlausibleSpeedMps: opts.maxPlausibleSpeedMps });
  if (!g.accepted) return { ...state, gate: g.state };
  if (state.lastCounted === null) return { ...state, gate: g.state, lastCounted: fix };

  const d = distanceMeters(state.lastCounted, fix);
  if (d < Math.max(opts.minStepM, fix.accuracy ?? 0)) return { ...state, gate: g.state };
  return { gate: g.state, lastCounted: fix, totalMeters: state.totalMeters + d };
}
