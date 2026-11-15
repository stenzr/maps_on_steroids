import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { distanceMeters, type LocationFix } from '@roadtrip/core';
import { BackgroundLocationSource, hasBackgroundPermission } from '@/services/location/backgroundSource';
import { GpsLocationSource } from '@/services/location/gpsSource';
import { SimulatedLocationSource } from '@/services/location/simulatedSource';
import type { LocationSource } from '@/services/location/types';
import { processFix, resetProcessor } from '@/services/tracking/fixProcessor';
import { useRoute } from '@/state/routeStore';
import { useSettings } from '@/state/settingsStore';
import { useTracking } from '@/state/trackingStore';

/** Parked this long → drop to the low-power location mode (unless navigating). */
const IDLE_AFTER_MS = 2 * 60_000;

async function ensureForegroundPermission(): Promise<'granted' | 'denied' | 'services-disabled'> {
  if (!(await Location.hasServicesEnabledAsync())) return 'services-disabled';
  const current = await Location.getForegroundPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'denied';
  const asked = await Location.requestForegroundPermissionsAsync();
  return asked.granted ? 'granted' : 'denied';
}

/**
 * Picks the location source (simulator, background task, or foreground-only GPS), feeds every
 * fix through the processor, and manages power: high accuracy while driving or navigating,
 * low power after 2 minutes parked.
 */
export function useLocationTracking(retryToken = 0): void {
  const testMode = useSettings((s) => s.testMode);
  const backgroundWanted = useSettings((s) => s.backgroundTracking);
  const hydrated = useSettings((s) => s.hydrated);
  // In test mode, simulate along the active route (e.g. the real Pune → Nashik polyline) when there is one.
  const testRouteKey = useRoute((s) => (testMode.enabled ? (s.route?.fetchedAt ?? null) : null));
  const sourceRef = useRef<LocationSource | null>(null);
  const idleRef = useRef(false);

  useEffect(() => {
    if (!hydrated) return;
    let cancelled = false;
    const { setStatus, reset } = useTracking.getState();

    const onFix = (fix: LocationFix): void => {
      const before = useTracking.getState().tracking;
      // Idle fixes are coarse and fail the accuracy filter, so wake on any sign of movement.
      if (idleRef.current) {
        const moved =
          (fix.speed ?? 0) > 2 ||
          (before.position !== null && distanceMeters(before.position, fix) > Math.max(50, fix.accuracy ?? 0));
        if (moved) {
          idleRef.current = false;
          sourceRef.current?.setPowerMode('active');
        }
      }
      void processFix(fix);
      const since = useTracking.getState().tracking.stationarySince;
      const navigating = useRoute.getState().navigating;
      if (!idleRef.current && !navigating && since !== null && fix.timestamp - since > IDLE_AFTER_MS) {
        idleRef.current = true;
        sourceRef.current?.setPowerMode('idle');
      }
    };

    const onError = (message: string): void => setStatus({ kind: 'error', message });

    const start = async (): Promise<void> => {
      reset();
      resetProcessor(testMode.enabled);
      idleRef.current = false;
      let source: LocationSource;
      if (testMode.enabled) {
        const routePath = useRoute.getState().route?.geometry.path;
        source = new SimulatedLocationSource({ path: routePath, speedKmh: testMode.speedKmh, playbackRate: testMode.playbackRate });
      } else {
        setStatus({ kind: 'requesting-permission' });
        let perm: Awaited<ReturnType<typeof ensureForegroundPermission>>;
        try {
          perm = await ensureForegroundPermission();
        } catch (e) {
          if (!cancelled) onError(e instanceof Error ? e.message : 'Location unavailable');
          return;
        }
        if (cancelled) return;
        if (perm === 'services-disabled') return setStatus({ kind: 'services-disabled' });
        if (perm === 'denied') {
          const p = await Location.getForegroundPermissionsAsync();
          return setStatus({ kind: 'permission-denied', canAskAgain: p.canAskAgain });
        }
        const bg = backgroundWanted && (await hasBackgroundPermission().catch(() => false));
        source = bg ? new BackgroundLocationSource() : new GpsLocationSource();
      }
      if (cancelled) return;
      sourceRef.current = source;
      setStatus({ kind: 'tracking', source: source.kind });
      await source.start(onFix, onError);
    };

    void start();

    // Foreground-only GPS pauses in the background; the background source keeps running.
    const appStateSub = AppState.addEventListener('change', (state) => {
      const src = sourceRef.current;
      if (!(src instanceof GpsLocationSource)) return;
      if (state === 'active') void src.start(onFix, onError);
      else src.stop();
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      sourceRef.current?.stop();
      sourceRef.current = null;
    };
  }, [hydrated, testMode.enabled, testMode.speedKmh, testMode.playbackRate, backgroundWanted, retryToken, testRouteKey]);
}
