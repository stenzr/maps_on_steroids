import type { LatLng, LocationFix } from '../types';
import { destinationPoint } from '../geo/bearing';
import { pathLength, pointAlongPath } from '../geo/path';
import { normalizeDegrees } from '../heading/angles';
import { gaussian, seededRandom } from './random';

export interface SimStop {
  /** Where along the path the stop happens (metres from start). */
  atDistanceM: number;
  durationMs: number;
}

export interface DriveSimOptions {
  /** Cruise speed. */
  speedKmh: number;
  /** Time between fixes. */
  intervalMs: number;
  /** 1-sigma horizontal position noise, metres. */
  noiseM: number;
  /** Reported accuracy radius, metres. */
  accuracyM: number;
  startTime: number;
  seed: number;
  /** Acceleration/braking, m/s². */
  accelMps2: number;
  stops: readonly SimStop[];
}

export const DEFAULT_SIM_OPTIONS: DriveSimOptions = {
  speedKmh: 70,
  intervalMs: 1000,
  noiseM: 3,
  accuracyM: 6,
  startTime: 0,
  seed: 42,
  accelMps2: 1.5,
  stops: [],
};

/**
 * Simulates a drive along `path`, producing fixes with realistic GPS noise.
 * While stopped it emits jittery positions with near-zero speed and a random course,
 * like a real receiver, to exercise the stationary freeze and jitter filters.
 *
 * Stateful iterator: call `next()` once per simulated tick.
 */
export class DriveSimulator {
  readonly totalMeters: number;
  private readonly opts: DriveSimOptions;
  private readonly rand: () => number;
  private readonly stops: SimStop[];
  private distanceM = 0;
  private speedMps = 0;
  private time: number;
  private stopUntil: number | null = null;

  constructor(
    private readonly path: readonly LatLng[],
    options: Partial<DriveSimOptions> = {},
  ) {
    if (path.length < 2) throw new Error('Path needs at least two points');
    this.opts = { ...DEFAULT_SIM_OPTIONS, ...options };
    this.rand = seededRandom(this.opts.seed);
    this.stops = [...this.opts.stops].sort((a, b) => a.atDistanceM - b.atDistanceM);
    this.totalMeters = pathLength(path);
    this.time = this.opts.startTime;
  }

  get progressMeters(): number {
    return this.distanceM;
  }

  get finished(): boolean {
    return this.distanceM >= this.totalMeters && this.stopUntil === null;
  }

  next(): LocationFix {
    const { intervalMs, accelMps2, noiseM, accuracyM } = this.opts;
    const dt = intervalMs / 1000;
    this.time += intervalMs;
    const target = this.opts.speedKmh / 3.6;

    // Begin a scheduled stop once we reach it.
    const nextStop = this.stops[0];
    if (this.stopUntil === null && nextStop && this.distanceM >= nextStop.atDistanceM) {
      this.stopUntil = this.time + nextStop.durationMs;
      this.stops.shift();
      this.speedMps = 0;
    }

    const stopped = this.stopUntil !== null && this.time < this.stopUntil;
    if (!stopped) {
      this.stopUntil = null;
      // Brake ahead of the next stop / end of route, otherwise accelerate to cruise.
      const brakeTarget = this.stops[0]?.atDistanceM ?? this.totalMeters;
      const toGo = brakeTarget - this.distanceM;
      const brakingSpeed = Math.sqrt(Math.max(0, 2 * accelMps2 * toGo));
      const desired = Math.max(2, Math.min(target, brakingSpeed));
      this.speedMps =
        desired > this.speedMps
          ? Math.min(desired, this.speedMps + accelMps2 * dt)
          : Math.max(desired, this.speedMps - accelMps2 * dt);
      this.distanceM = Math.min(this.totalMeters, this.distanceM + this.speedMps * dt);
    }

    const { point, segmentBearing } = pointAlongPath(this.path, this.distanceM);
    const noisy = destinationPoint(point, this.rand() * 360, Math.abs(gaussian(this.rand)) * noiseM);
    const atRest = stopped || this.finished;
    const speed = atRest ? Math.abs(gaussian(this.rand)) * 0.3 : Math.max(0, this.speedMps + gaussian(this.rand) * 0.3);
    const course = atRest
      ? this.rand() * 360
      : segmentBearing === null
        ? null
        : normalizeDegrees(segmentBearing + gaussian(this.rand) * 3);

    return {
      timestamp: this.time,
      latitude: noisy.latitude,
      longitude: noisy.longitude,
      accuracy: accuracyM,
      speed,
      course,
    };
  }
}
