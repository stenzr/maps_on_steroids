import type { LocationFix } from '../types';
import { initialBearing } from '../geo/bearing';
import { distanceMeters } from '../geo/distance';
import { emptyFixGate, gateFix, type FixGateState, type FixRejection } from '../tracking/fixGate';
import {
  circularWeightedMean,
  emptyAngleFilter,
  isValidAngle,
  smoothAngle,
  type AngleFilterState,
} from './angles';
import { findFixAtOrBefore, findTrendAnchor, pushFix } from './fixBuffer';

/** Heading window choices offered in Settings (metres). */
export const HEADING_WINDOW_OPTIONS_M = [10, 30, 50, 100] as const;
export const DEFAULT_HEADING_WINDOW_M = 30;

export interface HeadingConfig {
  /** D: trend bearing is measured from the most recent fix at least this far behind. */
  windowMeters: number;
  /** Fixes with a worse accuracy radius are discarded. */
  maxAccuracyM: number;
  /** Above this speed a valid GPS course is blended in (m/s). */
  fastSpeedMps: number;
  /** Below this reported speed we are stationary (m/s). */
  stationarySpeedMps: number;
  /** Look-back period for the "hasn't really moved" test (ms). */
  stationaryWindowMs: number;
  /**
   * Moving less than this in `stationaryWindowMs` counts as stationary. Defaults to
   * min(D, 15 m). The cap keeps a large D from freezing the arrow while driving slowly:
   * with D = 100 m, "moved < D in 10 s" alone would freeze it below 36 km/h.
   */
  stationaryMinMoveM?: number;
  /** Weight of each new sample in the angle smoothing filter (0–1]. */
  smoothingAlpha: number;
  /** Weight of GPS course vs trend bearing when blending at speed (0–1). */
  courseWeight: number;
  /** Buffer age limit (ms). */
  maxBufferAgeMs: number;
  /** Fastest plausible speed for the jump filter (m/s). */
  maxPlausibleSpeedMps: number;
}

export const DEFAULT_HEADING_CONFIG: HeadingConfig = {
  windowMeters: DEFAULT_HEADING_WINDOW_M,
  maxAccuracyM: 20,
  fastSpeedMps: 15 / 3.6,
  stationarySpeedMps: 1.5,
  stationaryWindowMs: 10_000,
  smoothingAlpha: 0.4,
  courseWeight: 0.5,
  maxBufferAgeMs: 120_000,
  maxPlausibleSpeedMps: 70,
};

export type HeadingSource = 'trend' | 'trend+course' | 'course' | 'frozen' | 'none';

export interface HeadingState {
  buffer: LocationFix[];
  gate: FixGateState;
  filter: AngleFilterState;
  /** Last good smoothed heading in degrees, null until we've moved D metres. */
  heading: number | null;
}

export interface HeadingOutput {
  heading: number | null;
  stationary: boolean;
  source: HeadingSource;
  /** False if the fix was discarded (then heading/stationary repeat the previous values). */
  accepted: boolean;
  rejection: FixRejection | null;
}

export const initialHeadingState = (): HeadingState => ({
  buffer: [],
  gate: emptyFixGate(),
  filter: emptyAngleFilter(),
  heading: null,
});

function isStationary(buffer: readonly LocationFix[], fix: LocationFix, cfg: HeadingConfig): boolean {
  if (fix.speed !== null && fix.speed >= 0 && fix.speed < cfg.stationarySpeedMps) return true;
  const minMove = cfg.stationaryMinMoveM ?? Math.min(cfg.windowMeters, 15);
  const ref = findFixAtOrBefore(buffer, fix.timestamp - cfg.stationaryWindowMs);
  return ref !== null && distanceMeters(ref, fix) < minMove;
}

/**
 * Feed one location fix and get the direction-of-travel heading.
 * Pure: returns a new state, never mutates the input.
 */
export function updateHeading(
  state: HeadingState,
  fix: LocationFix,
  cfg: HeadingConfig = DEFAULT_HEADING_CONFIG,
): { state: HeadingState; output: HeadingOutput } {
  const gated = gateFix(state.gate, fix, {
    maxAccuracyM: cfg.maxAccuracyM,
    maxPlausibleSpeedMps: cfg.maxPlausibleSpeedMps,
  });
  if (!gated.accepted) {
    return {
      state: { ...state, gate: gated.state },
      output: {
        heading: state.heading,
        stationary: false,
        source: state.heading === null ? 'none' : 'frozen',
        accepted: false,
        rejection: gated.rejection,
      },
    };
  }

  const stationary = isStationary(state.buffer, fix, cfg);
  const buffer = pushFix(state.buffer, fix, {
    maxAgeMs: cfg.maxBufferAgeMs,
    keepDistanceM: Math.max(2 * cfg.windowMeters, 200),
    maxLength: 600,
  });
  const base = { ...state, gate: gated.state, buffer };

  if (stationary) {
    return {
      state: base,
      output: { heading: state.heading, stationary: true, source: state.heading === null ? 'none' : 'frozen', accepted: true, rejection: null },
    };
  }

  const anchor = findTrendAnchor(state.buffer, fix, cfg.windowMeters);
  const trend = anchor ? initialBearing(anchor, fix) : null;
  const fast = fix.speed !== null && fix.speed > cfg.fastSpeedMps;
  const course = fast && isValidAngle(fix.course) ? fix.course : null;

  let raw: number | null = null;
  let source: HeadingSource;
  if (trend !== null && course !== null) {
    raw = circularWeightedMean([
      { deg: trend, weight: 1 - cfg.courseWeight },
      { deg: course, weight: cfg.courseWeight },
    ]);
    source = 'trend+course';
  } else if (trend !== null) {
    raw = trend;
    source = 'trend';
  } else if (course !== null) {
    raw = course;
    source = 'course';
  } else {
    source = state.heading === null ? 'none' : 'frozen';
  }

  if (raw === null) {
    return { state: base, output: { heading: state.heading, stationary: false, source, accepted: true, rejection: null } };
  }

  const smoothed = smoothAngle(state.filter, raw, cfg.smoothingAlpha);
  return {
    state: { ...base, filter: smoothed.state, heading: smoothed.value },
    output: { heading: smoothed.value, stationary: false, source, accepted: true, rejection: null },
  };
}
