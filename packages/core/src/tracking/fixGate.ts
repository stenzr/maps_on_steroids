import type { LocationFix } from '../types';
import { distanceMeters } from '../geo/distance';

export type FixRejection = 'low-accuracy' | 'out-of-order' | 'implausible-jump';

export interface FixGateOptions {
  /** Discard fixes whose accuracy radius is worse (larger) than this, in metres. */
  maxAccuracyM: number;
  /** Fastest plausible ground speed in m/s; faster implied jumps are discarded. Default 70 m/s ≈ 250 km/h. */
  maxPlausibleSpeedMps?: number;
  /**
   * After this many consecutive jump rejections, trust the new position again
   * (the earlier accepted fix was probably the bad one). Default 3.
   */
  resetAfterJumps?: number;
}

export interface FixGateState {
  last: LocationFix | null;
  consecutiveJumps: number;
}

export const emptyFixGate = (): FixGateState => ({ last: null, consecutiveJumps: 0 });

export interface FixGateResult {
  state: FixGateState;
  accepted: boolean;
  rejection: FixRejection | null;
}

/**
 * Filters GPS noise: poor-accuracy fixes, out-of-order fixes and position jumps that would need
 * an impossible speed. The two accuracy radii are allowed as slack, so a fix doesn't fail only
 * because both fixes are uncertain.
 */
export function gateFix(state: FixGateState, fix: LocationFix, opts: FixGateOptions): FixGateResult {
  const maxSpeed = opts.maxPlausibleSpeedMps ?? 70;
  const resetAfter = opts.resetAfterJumps ?? 3;

  if (fix.accuracy === null || !Number.isFinite(fix.accuracy) || fix.accuracy > opts.maxAccuracyM) {
    return { state, accepted: false, rejection: 'low-accuracy' };
  }
  const prev = state.last;
  if (prev) {
    if (fix.timestamp <= prev.timestamp) return { state, accepted: false, rejection: 'out-of-order' };
    const dtS = (fix.timestamp - prev.timestamp) / 1000;
    const slack = (prev.accuracy ?? 0) + fix.accuracy;
    const d = distanceMeters(prev, fix);
    if (d - slack > maxSpeed * dtS) {
      const jumps = state.consecutiveJumps + 1;
      if (jumps < resetAfter) {
        return { state: { last: prev, consecutiveJumps: jumps }, accepted: false, rejection: 'implausible-jump' };
      }
      // Several fixes in a row agree with each other, not with `prev`: accept and re-anchor.
    }
  }
  return { state: { last: fix, consecutiveJumps: 0 }, accepted: true, rejection: null };
}
