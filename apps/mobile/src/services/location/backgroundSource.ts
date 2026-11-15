import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { normalizeFix, type LocationFix } from '@roadtrip/core';
import { processFix } from '@/services/tracking/fixProcessor';
import type { LocationSource, PowerMode } from './types';

export const BACKGROUND_LOCATION_TASK = 'roadtrip-background-location';

/**
 * Must run at startup (imported from the entry file), so Android can deliver locations to the
 * task even when the OS restarts the JS runtime for it.
 */
TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error) {
    console.warn('Background location error', error.message);
    return;
  }
  for (const loc of data?.locations ?? []) {
    const fix = normalizeFix(loc);
    if (listener) listener(fix);
    else await processFix(fix);
  }
});

let listener: ((fix: LocationFix) => void) | null = null;

const OPTIONS: Record<PowerMode, Location.LocationTaskOptions> = {
  active: {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 2,
  },
  // Parked: only wake for real movement (≥ 100 m) — kind to the battery.
  idle: {
    accuracy: Location.Accuracy.Balanced,
    timeInterval: 60_000,
    distanceInterval: 100,
  },
};

const FOREGROUND_SERVICE: Location.LocationTaskOptions['foregroundService'] = {
  notificationTitle: 'RoadTrip Companion',
  notificationBody: 'Tracking your trip for range, fuel stops and refuel prompts.',
  notificationColor: '#0B5FFF',
  killServiceOnDestroy: false,
};

/**
 * Location via a background task + Android foreground service. Keeps working with the screen
 * off or the app in the background. Requires "Allow all the time".
 */
export class BackgroundLocationSource implements LocationSource {
  readonly kind = 'gps' as const;
  private mode: PowerMode = 'active';
  private running = false;

  async start(onFix: (fix: LocationFix) => void, onError: (message: string) => void): Promise<void> {
    listener = onFix;
    try {
      await this.restart();
    } catch (e) {
      onError(e instanceof Error ? e.message : 'Could not start background location');
    }
  }

  stop(): void {
    listener = null;
    this.running = false;
    void Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)
      .then((started) => (started ? Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK) : undefined))
      .catch(() => undefined);
  }

  setPowerMode(mode: PowerMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (this.running) void this.restart().catch(() => undefined);
  }

  private async restart(): Promise<void> {
    if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
    }
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      ...OPTIONS[this.mode],
      pausesUpdatesAutomatically: false,
      activityType: Location.ActivityType.AutomotiveNavigation,
      showsBackgroundLocationIndicator: true,
      foregroundService: FOREGROUND_SERVICE,
    });
    this.running = true;
  }
}

export async function hasBackgroundPermission(): Promise<boolean> {
  return (await Location.getBackgroundPermissionsAsync()).granted;
}

/** Foreground permission must already be granted. Android shows a settings page for "Allow all the time". */
export async function requestBackgroundPermission(): Promise<boolean> {
  return (await Location.requestBackgroundPermissionsAsync()).granted;
}
