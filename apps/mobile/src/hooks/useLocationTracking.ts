import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { distanceMeters, type LocationFix } from '@roadtrip/core';
import { GpsLocationSource } from '@/services/location/gpsSource';
import { SimulatedLocationSource } from '@/services/location/simulatedSource';
import type { LocationSource } from '@/services/location/types';
import { useSettings } from '@/state/settingsStore';
import { useTracking } from '@/state/trackingStore';

/** Parked this long → drop to the low-power location mode. */
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
 * Starts the right location source (GPS or the test-mode simulator), feeds fixes into the
 * tracking store, and switches GPS power mode: low power after 2 min parked, high accuracy
 * again as soon as we start moving. Pauses while the app is in the background (milestone 1).
 */
export function useLocationTracking(retryToken = 0): void {
  const testMode = useSettings((s) => s.testMode);
  const sourceRef = useRef<LocationSource | null>(null);
  const idleRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const { pushFix, setStatus, reset } = useTracking.getState();

    const onFix = (fix: LocationFix): void => {
      const windowM = useSettings.getState().headingWindowM;
      const before = useTracking.getState().tracking;
      // While idle, fixes are coarse (they fail the 20 m accuracy filter), so wake up on any
      // sign of real movement instead of waiting for an accepted fix.
      if (idleRef.current) {
        const moved =
          (fix.speed ?? 0) > 2 ||
          (before.position !== null && distanceMeters(before.position, fix) > Math.max(50, fix.accuracy ?? 0));
        if (moved) {
          idleRef.current = false;
          sourceRef.current?.setPowerMode('active');
        }
      }
      pushFix(fix, windowM);
      const since = useTracking.getState().tracking.stationarySince;
      if (!idleRef.current && since !== null && fix.timestamp - since > IDLE_AFTER_MS) {
        idleRef.current = true;
        sourceRef.current?.setPowerMode('idle');
      }
    };

    const onError = (message: string): void => setStatus({ kind: 'error', message });

    const start = async (): Promise<void> => {
      reset();
      idleRef.current = false;
      let source: LocationSource;
      if (testMode.enabled) {
        source = new SimulatedLocationSource({ speedKmh: testMode.speedKmh, playbackRate: testMode.playbackRate });
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
        source = new GpsLocationSource();
      }
      if (cancelled) return;
      sourceRef.current = source;
      setStatus({ kind: 'tracking', source: source.kind });
      await source.start(onFix, onError);
    };

    void start();

    // Foreground-only for now: stop GPS in the background, resume on return.
    const appStateSub = AppState.addEventListener('change', (state) => {
      const src = sourceRef.current;
      if (!src || src.kind !== 'gps') return;
      if (state === 'active') void src.start(onFix, onError);
      else src.stop();
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      sourceRef.current?.stop();
      sourceRef.current = null;
    };
  }, [testMode.enabled, testMode.speedKmh, testMode.playbackRate, retryToken]);
}
