import type { LatLng, LocationFix } from '../types';
import {
  DEFAULT_HEADING_CONFIG,
  initialHeadingState,
  updateHeading,
  type HeadingConfig,
  type HeadingOutput,
  type HeadingState,
} from '../heading/headingEstimator';
import { appendBreadcrumb, DEFAULT_BREADCRUMB_OPTIONS } from './breadcrumb';
import { initialDistanceTracker, trackDistance, type DistanceTrackerState } from './distanceTracker';

/** Everything the live map needs, derived from the stream of location fixes. */
export interface TrackingState {
  /** Latest fix, accepted or not (the blue-dot fallback). */
  lastFix: LocationFix | null;
  /** Latest fix that passed the heading filters; where the car marker is drawn. */
  position: LatLng | null;
  heading: HeadingOutput;
  trail: LatLng[];
  distance: DistanceTrackerState;
  /** Internal heading estimator state. */
  headingState: HeadingState;
  /** When we last became stationary (ms), null while moving. */
  stationarySince: number | null;
}

export const initialTrackingState = (): TrackingState => ({
  lastFix: null,
  position: null,
  heading: { heading: null, stationary: false, source: 'none', accepted: false, rejection: null },
  trail: [],
  distance: initialDistanceTracker(),
  headingState: initialHeadingState(),
  stationarySince: null,
});

/** Feed one fix through heading estimation, breadcrumb trail and odometer tracking. */
export function reduceTracking(
  state: TrackingState,
  fix: LocationFix,
  headingConfig: HeadingConfig = DEFAULT_HEADING_CONFIG,
): TrackingState {
  const h = updateHeading(state.headingState, fix, headingConfig);
  const accepted = h.output.accepted;
  const stationary = accepted ? h.output.stationary : state.heading.stationary;
  return {
    lastFix: fix,
    position: accepted ? { latitude: fix.latitude, longitude: fix.longitude } : state.position,
    heading: accepted ? h.output : { ...h.output, stationary },
    // Don't extend the trail with stationary jitter.
    trail: accepted && !stationary ? appendBreadcrumb(state.trail, fix, DEFAULT_BREADCRUMB_OPTIONS) : state.trail,
    distance: trackDistance(state.distance, fix),
    headingState: h.state,
    stationarySince: stationary ? (state.stationarySince ?? fix.timestamp) : null,
  };
}
