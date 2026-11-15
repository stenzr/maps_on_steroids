import * as Location from 'expo-location';
import { normalizeFix, type LocationFix } from '@roadtrip/core';
import type { LocationSource, PowerMode } from './types';

const WATCH_OPTIONS: Record<PowerMode, Location.LocationOptions> = {
  active: { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 2 },
  idle: { accuracy: Location.Accuracy.Balanced, timeInterval: 15_000, distanceInterval: 20 },
};

/** Foreground GPS via expo-location. Background tracking arrives in milestone 4. */
export class GpsLocationSource implements LocationSource {
  readonly kind = 'gps' as const;
  private sub: Location.LocationSubscription | null = null;
  private mode: PowerMode = 'active';
  private onFix: ((fix: LocationFix) => void) | null = null;
  private onError: ((message: string) => void) | null = null;
  private generation = 0;

  async start(onFix: (fix: LocationFix) => void, onError: (message: string) => void): Promise<void> {
    this.onFix = onFix;
    this.onError = onError;
    await this.subscribe();
  }

  stop(): void {
    this.generation++;
    this.sub?.remove();
    this.sub = null;
    this.onFix = null;
  }

  setPowerMode(mode: PowerMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.onFix) void this.subscribe();
  }

  private async subscribe(): Promise<void> {
    const gen = ++this.generation;
    this.sub?.remove();
    this.sub = null;
    try {
      const sub = await Location.watchPositionAsync(
        WATCH_OPTIONS[this.mode],
        (loc) => this.onFix?.(normalizeFix(loc)),
        (reason) => this.onError?.(reason),
      );
      // stop() or another subscribe() happened while we were awaiting.
      if (gen !== this.generation) sub.remove();
      else this.sub = sub;
    } catch (e) {
      this.onError?.(e instanceof Error ? e.message : 'Could not start location updates');
    }
  }
}
