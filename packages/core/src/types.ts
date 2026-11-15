export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * One location sample from the device (or the simulator).
 * Units: metres, metres/second, degrees clockwise from true north, epoch milliseconds.
 */
export interface LocationFix extends LatLng {
  timestamp: number;
  /** Horizontal accuracy radius in metres; null when the platform doesn't report it. */
  accuracy: number | null;
  /** Ground speed in m/s; null or negative means unknown. */
  speed: number | null;
  /** GPS course over ground in degrees; null or negative means unknown. */
  course: number | null;
}
