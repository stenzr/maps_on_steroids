import { DriveSimulator, PUNE_NASHIK_WAYPOINTS, type LatLng, type LocationFix } from '@roadtrip/core';
import type { LocationSource } from './types';

export interface SimulatedSourceOptions {
  path?: readonly LatLng[];
  speedKmh: number;
  /** Simulated seconds per real second. */
  playbackRate: number;
}

/**
 * Test mode: replays a drive (default Pune → Nashik) through the same pipeline as real GPS.
 * Includes a 4-minute stop near Chakan (~25 km) to show the stationary freeze.
 */
export class SimulatedLocationSource implements LocationSource {
  readonly kind = 'simulator' as const;
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly sim: DriveSimulator;

  constructor(private readonly opts: SimulatedSourceOptions) {
    this.sim = new DriveSimulator(opts.path ?? PUNE_NASHIK_WAYPOINTS, {
      speedKmh: opts.speedKmh,
      intervalMs: 1000,
      startTime: Date.now(),
      seed: Date.now() % 100_000,
      stops: [{ atDistanceM: 25_000, durationMs: 4 * 60_000 }],
    });
  }

  async start(onFix: (fix: LocationFix) => void): Promise<void> {
    this.stop();
    const tickMs = 1000 / Math.max(0.1, this.opts.playbackRate);
    this.timer = setInterval(() => {
      if (this.sim.finished) {
        this.stop();
        return;
      }
      onFix(this.sim.next());
    }, tickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  setPowerMode(): void {
    // Simulator has no power modes.
  }
}
