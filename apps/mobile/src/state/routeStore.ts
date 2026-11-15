import { create } from 'zustand';
import {
  buildRouteGeometry,
  decodePolyline,
  encodePolyline,
  placesAlongRoute,
  progressOnRoute,
  projectOntoRoute,
  routeWindows,
  sliceRoute,
  type AlongRouteItem,
  type LatLng,
  type Place,
  type RouteGeometry,
} from '@roadtrip/core';
import { api, errorMessage, type AlongRouteCategory, type RouteResult, type TravelMode, type Waypoint } from '@/services/api/proxyClient';

export interface NamedStop {
  name: string;
  location: LatLng;
  placeId: string | null;
}

export interface ActiveRoute {
  result: RouteResult;
  geometry: RouteGeometry;
  fetchedAt: number;
}

type FetchState = { status: 'idle' } | { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; at: number };

interface CategoryResults {
  items: AlongRouteItem[];
  state: FetchState;
  /** Where along the route (m) the search was made from; refetch after moving on. */
  fromAlongM: number;
}

const emptyResults = (): CategoryResults => ({ items: [], state: { status: 'idle' }, fromAlongM: 0 });

/** Search the next ~this many km ahead (or the range, whichever is larger). */
const LOOKAHEAD_KM = 150;
/** Text Search caps at 20 per page; search the route in windows of this size. */
const WINDOW_KM = 100;
/** Refetch once we've moved this far beyond the last search point. */
const REFETCH_AFTER_KM = 30;

interface RouteStore {
  origin: NamedStop | null;
  destination: NamedStop | null;
  waypoints: NamedStop[];
  travelMode: TravelMode;
  route: ActiveRoute | null;
  routeState: FetchState;
  /** True once the user taps "Start" in route preview; shows the along-route panel. */
  navigating: boolean;
  results: Record<AlongRouteCategory, CategoryResults>;

  setDestination: (d: NamedStop, origin: NamedStop | null, travelMode: TravelMode) => Promise<void>;
  addStop: (p: NamedStop, currentPosition: LatLng | null) => Promise<void>;
  removeStop: (placeId: string | null, index: number) => Promise<void>;
  start: () => void;
  clear: () => void;
  fetchAlong: (category: AlongRouteCategory, position: LatLng | null, rangeKm: number | null, force?: boolean) => Promise<void>;
}

/** In-memory session cache of identical route requests (Google terms allow session caching). */
const routeCache = new Map<string, RouteResult>();

const toWaypoint = (s: NamedStop): Waypoint => (s.placeId ? { placeId: s.placeId } : s.location);

async function fetchRoute(origin: NamedStop, destination: NamedStop, waypoints: NamedStop[], travelMode: TravelMode): Promise<RouteResult> {
  const req = { origin: origin.location, destination: toWaypoint(destination), intermediates: waypoints.map(toWaypoint), travelMode };
  const key = JSON.stringify(req);
  const cached = routeCache.get(key);
  if (cached) return cached;
  const r = await api.route(req);
  if (!r) throw new Error('No route found between these places.');
  routeCache.set(key, r);
  return r;
}

export const useRoute = create<RouteStore>((set, get) => {
  const recompute = async (originOverride?: LatLng | null): Promise<void> => {
    const { origin, destination, waypoints, travelMode } = get();
    if (!origin || !destination) return;
    const from = originOverride ? { ...origin, location: originOverride } : origin;
    set({ routeState: { status: 'loading' } });
    try {
      const result = await fetchRoute(from, destination, waypoints, travelMode);
      set({
        origin: from,
        route: { result, geometry: buildRouteGeometry(decodePolyline(result.encodedPolyline)), fetchedAt: Date.now() },
        routeState: { status: 'ready', at: Date.now() },
        results: { petrol: emptyResults(), restroom: emptyResults(), restaurant: emptyResults() },
      });
    } catch (e) {
      set({ routeState: { status: 'error', message: errorMessage(e) } });
    }
  };

  const inflight = new Map<AlongRouteCategory, Promise<void>>();

  return {
    origin: null,
    destination: null,
    waypoints: [],
    travelMode: 'DRIVE',
    route: null,
    routeState: { status: 'idle' },
    navigating: false,
    results: { petrol: emptyResults(), restroom: emptyResults(), restaurant: emptyResults() },

    setDestination: async (destination, origin, travelMode) => {
      set({ destination, origin, waypoints: [], travelMode, navigating: false, route: null });
      await recompute();
    },

    addStop: async (p, currentPosition) => {
      const { route, waypoints } = get();
      // Insert in along-route order so Google visits stops in sequence.
      const along = (s: NamedStop) => (route ? (projectOntoRoute(route.geometry, s.location)?.alongM ?? 0) : 0);
      const next = [...waypoints.filter((w) => w.placeId !== p.placeId || p.placeId === null), p].sort((a, b) => along(a) - along(b));
      set({ waypoints: next });
      await recompute(currentPosition);
    },

    removeStop: async (_placeId, index) => {
      set((s) => ({ waypoints: s.waypoints.filter((_, i) => i !== index) }));
      await recompute();
    },

    start: () => set({ navigating: true }),

    clear: () =>
      set({
        origin: null,
        destination: null,
        waypoints: [],
        route: null,
        routeState: { status: 'idle' },
        navigating: false,
        results: { petrol: emptyResults(), restroom: emptyResults(), restaurant: emptyResults() },
      }),

    fetchAlong: async (category, position, rangeKm, force = false) => {
      const existing = inflight.get(category);
      if (existing) return existing;
      const { route, travelMode } = get();
      if (!route) return;
      const progress = progressOnRoute(route.geometry, route.result.durationS, position);
      const prev = get().results[category];
      const fresh = prev.state.status === 'ready' && Date.now() - prev.state.at < 10 * 60_000;
      if (!force && fresh && progress.alongM - prev.fromAlongM < REFETCH_AFTER_KM * 1000) return;

      const run = (async () => {
        set((s) => ({ results: { ...s.results, [category]: { ...s.results[category], state: { status: 'loading' } } } }));
        try {
          const lookaheadM = Math.max(LOOKAHEAD_KM, (rangeKm ?? 0) + 30) * 1000;
          const windows = routeWindows(route.geometry, progress.alongM, progress.alongM + lookaheadM, WINDOW_KM * 1000);
          const lengthM = route.geometry.lengthM || 1;
          const batches = await Promise.all(
            windows.map(async ([from, to]) => {
              const res = await api.alongRoute({
                category,
                encodedPolyline: encodePolyline(sliceRoute(route.geometry, from, to)),
                origin: position,
                travelMode,
              });
              // Detour reference: drive time from the car to the end of this searched slice.
              const toEndS = route.result.durationS * Math.max(0, (to - progress.alongM) / lengthM);
              return placesAlongRoute(route.geometry, res.places, { alongM: progress.alongM, remainingDurationS: toEndS });
            }),
          );
          const seen = new Set<string>();
          const items = batches
            .flat()
            .filter((i) => (seen.has(i.place.placeId) ? false : (seen.add(i.place.placeId), true)))
            .sort((a, b) => a.aheadKm - b.aheadKm);
          set((s) => ({
            results: { ...s.results, [category]: { items, state: { status: 'ready', at: Date.now() }, fromAlongM: progress.alongM } },
          }));
        } catch (e) {
          set((s) => ({ results: { ...s.results, [category]: { ...s.results[category], state: { status: 'error', message: errorMessage(e) } } } }));
        } finally {
          inflight.delete(category);
        }
      })();
      inflight.set(category, run);
      return run;
    },
  };
});

/** Re-anchor items to the car's current position without refetching (km ahead shrinks as we drive). */
export function itemsAheadOf(items: readonly AlongRouteItem[], geometry: RouteGeometry, position: LatLng | null, searchedFromAlongM: number): AlongRouteItem[] {
  if (!position) return [...items];
  const now = progressOnRoute(geometry, 0, position).alongM;
  const delta = (now - searchedFromAlongM) / 1000;
  return items.map((i) => ({ ...i, aheadKm: i.aheadKm - delta })).filter((i) => i.aheadKm > -0.2);
}

export type { Place };
