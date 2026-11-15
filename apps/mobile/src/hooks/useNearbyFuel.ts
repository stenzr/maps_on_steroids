import { useEffect, useRef, useState } from 'react';
import { distanceMeters, rankNearbyStations, type LatLng, type NearbyStation } from '@roadtrip/core';
import { api, errorMessage } from '@/services/api/proxyClient';

const REFRESH_AFTER_M = 3000;
const REFRESH_AFTER_MS = 5 * 60_000;

/**
 * No route and low range: nearby open petrol pumps, preferring ones ahead. Refetches only after
 * moving 3 km or 5 minutes (keeps Places calls low); re-ranks locally on every heading change.
 */
export function useNearbyFuel(enabled: boolean, position: LatLng | null, heading: number | null) {
  const [raw, setRaw] = useState<{ at: number; from: LatLng; places: Awaited<ReturnType<typeof api.nearbyFuel>> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const busy = useRef(false);

  useEffect(() => {
    if (!enabled || !position || busy.current) return;
    const stale = !raw || Date.now() - raw.at > REFRESH_AFTER_MS || distanceMeters(raw.from, position) > REFRESH_AFTER_M;
    if (!stale) return;
    busy.current = true;
    setLoading(true);
    api
      .nearbyFuel({ latitude: position.latitude, longitude: position.longitude, radiusM: 15_000 })
      .then((places) => {
        setRaw({ at: Date.now(), from: position, places });
        setError(null);
      })
      .catch((e: unknown) => setError(errorMessage(e)))
      .finally(() => {
        busy.current = false;
        setLoading(false);
      });
  }, [enabled, position, raw]);

  const stations: NearbyStation[] = enabled && raw && position ? rankNearbyStations(raw.places, position, heading).slice(0, 5) : [];
  return { stations, error: enabled ? error : null, loading };
}
