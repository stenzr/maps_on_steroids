import { Linking } from 'react-native';
import { HybridAutoPlay, ListTemplate, type AutoText, type DefaultRow, type MultiSection, type TextRow } from '@iternio/react-native-auto-play';
import {
  formatRange,
  googleMapsNavigationUrl,
  rankNearbyStations,
  restroomItems,
  type AlongRouteItem,
  type LatLng,
  type Place,
} from '@roadtrip/core';
import { api } from '@/services/api/proxyClient';
import { computeFuelPlan } from '@/services/routing/fuelPlan';
import { useGarage } from '@/state/garageStore';
import { itemsAheadOf, useRoute } from '@/state/routeStore';
import { useSettings } from '@/state/settingsStore';
import { useTracking } from '@/state/trackingStore';

/**
 * Android Auto screens (POI category, template UI — the car host draws everything).
 * Google Places data shown without a Google map must carry Google Maps attribution.
 */
const t = (text: string): AutoText => ({ text });
const ATTRIBUTION: TextRow = { type: 'text', title: t('Results from Google Maps') };
const UPDATE_EVERY_MS = 5000;

type Category = 'petrol' | 'restroom' | 'restaurant';

const position = (): LatLng | null => useTracking.getState().tracking.position;

async function navigateTo(place: Place): Promise<void> {
  const store = useRoute.getState();
  let url: string;
  if (store.navigating && store.destination) {
    // Mid-route: add it as a stop (the store keeps stops in along-route order), then hand off.
    await store.addStop({ name: place.name, location: place.location, placeId: place.placeId }, position());
    const { destination, waypoints } = useRoute.getState();
    url = googleMapsNavigationUrl({
      origin: position(),
      destination: { location: destination!.location, placeId: destination!.placeId },
      waypoints: waypoints.map((w) => ({ location: w.location, placeId: w.placeId })),
    });
  } else {
    url = googleMapsNavigationUrl({ origin: position(), destination: { location: place.location, placeId: place.placeId } });
  }
  // Opens Google Maps; with Android Auto connected its navigation shows on the car screen.
  await Linking.openURL(url).catch(() => undefined);
}

const describe = (i: AlongRouteItem): string => {
  const open = i.place.openNow === true ? 'Open' : i.place.openNow === false ? 'Closed' : '';
  const rating = i.place.rating !== null ? `★${i.place.rating.toFixed(1)}` : '';
  return [`${i.aheadKm.toFixed(0)} km ahead`, `+${Math.round(i.detourMin)} min`, rating, open].filter(Boolean).join(' · ');
};

function routeRows(category: Category): DefaultRow<ListTemplate>[] {
  const { route, results } = useRoute.getState();
  if (!route) return [];
  const ahead = (c: Category) => itemsAheadOf(results[c].items, route.geometry, position(), results[c].fromAlongM);
  let items: AlongRouteItem[];
  if (category === 'restroom') {
    const merged = new Map<string, AlongRouteItem>();
    for (const c of ['restroom', 'petrol', 'restaurant'] as const) for (const i of ahead(c)) if (!merged.has(i.place.placeId)) merged.set(i.place.placeId, i);
    items = restroomItems([...merged.values()].sort((a, b) => a.aheadKm - b.aheadKm), useSettings.getState().includeLikelyRestrooms);
  } else items = ahead(category);
  return items.slice(0, 12).map((i) => ({ type: 'default', title: t(i.place.name), detailedText: t(describe(i)), onPress: () => void navigateTo(i.place) }));
}

async function nearbyRows(): Promise<DefaultRow<ListTemplate>[]> {
  const p = position();
  if (!p) return [];
  const places = await api.nearbyFuel({ latitude: p.latitude, longitude: p.longitude, radiusM: 15_000 });
  return rankNearbyStations(places, p, useTracking.getState().tracking.heading.heading)
    .slice(0, 10)
    .map((s) => ({
      type: 'default',
      title: t(s.place.name),
      detailedText: t(`${s.distanceKm.toFixed(1)} km ${s.ahead ? 'ahead' : 'behind'}${s.place.rating !== null ? ` · ★${s.place.rating.toFixed(1)}` : ''}`),
      onPress: () => void navigateTo(s.place),
    }));
}

function listSections(rows: DefaultRow<ListTemplate>[], empty: string): MultiSection<ListTemplate>[] {
  return [
    { type: 'default', title: '', items: rows.length ? rows : [{ type: 'text', title: t(empty) }] },
    { type: 'default', title: '', items: [ATTRIBUTION] },
  ];
}

function pushCategory(category: Category, title: string): void {
  const { route } = useRoute.getState();
  if (route) {
    const pos = position();
    const rangeKm = useGarage.getState().range?.rangeKm ?? null;
    const cats: Category[] = category === 'restroom' ? ['restroom', 'petrol', 'restaurant'] : [category];
    cats.forEach((c) => void useRoute.getState().fetchAlong(c, pos, rangeKm));
  }
  const tpl = new ListTemplate({ title: { text: title }, sections: listSections(routeRows(category), route ? 'Searching along your route…' : 'Start a route on your phone to see places ahead.') });
  void tpl.push();
  // Fill in as results arrive.
  const unsub = useRoute.subscribe(() => void tpl.updateSections(listSections(routeRows(category), 'Nothing found ahead.')).catch(() => unsub()));
  setTimeout(unsub, 120_000);
}

async function pushNearby(): Promise<void> {
  const tpl = new ListTemplate({ title: { text: 'Petrol pumps nearby' } }); // no sections = loading indicator
  void tpl.push();
  try {
    await tpl.updateSections(listSections(await nearbyRows(), 'No open pumps within 15 km.'));
  } catch {
    await tpl.updateSections(listSections([], 'No connection — try again shortly.')).catch(() => undefined);
  }
}

function rootSections(): MultiSection<ListTemplate>[] {
  const { range, active } = useGarage.getState();
  const routeState = useRoute.getState();
  const plan = computeFuelPlan({ route: routeState.route, petrol: routeState.results.petrol, position: position(), range, vehicle: active });
  const next = plan?.plan.stops[0];
  const status: TextRow = {
    type: 'text',
    title: t(active ? formatRange(range?.rangeKm ?? null) : 'Add a vehicle on your phone'),
    detailedText: t(
      range?.fuel.fraction != null
        ? `${Math.round(range.fuel.fraction * 100)}% fuel${range.atReserve ? ' · RESERVE' : ''}${next ? ` · next pump ${Math.round(next.item.aheadKm)} km: ${next.item.place.name}` : ''}`
        : 'Log a fill to see range',
    ),
  };
  const rows: DefaultRow<ListTemplate>[] = routeState.navigating
    ? [
        { type: 'default', title: t('Petrol ahead'), browsable: true, onPress: () => pushCategory('petrol', 'Petrol ahead') },
        { type: 'default', title: t('Restrooms ahead'), browsable: true, onPress: () => pushCategory('restroom', 'Restrooms ahead') },
        { type: 'default', title: t('Food ahead'), browsable: true, onPress: () => pushCategory('restaurant', 'Food ahead') },
      ]
    : [{ type: 'default', title: t('Petrol pumps nearby'), browsable: true, onPress: () => void pushNearby() }];
  return [
    { type: 'default', title: 'Fuel', items: [status] },
    { type: 'default', title: routeState.navigating && routeState.destination ? `To ${routeState.destination.name}` : 'Find', items: rows },
  ];
}

let cleanup: (() => void) | null = null;

/** Register Android Auto handlers. Safe to call once at startup; the root is (re)built on each connect. */
export function registerCarScreens(): void {
  try {
    registerListeners();
  } catch (e) {
    console.warn('Android Auto not available in this build', e);
  }
}

function registerListeners(): void {
  HybridAutoPlay.addListener('didConnect', (sessionId) => {
    cleanup?.();
    const root = new ListTemplate({ title: { text: 'RoadTrip Companion' }, sections: rootSections() });
    void root.setRootTemplate();
    const timer = setInterval(() => {
      if (HybridAutoPlay.getCurrentSessionId() !== sessionId) return;
      void root.updateSections(rootSections()).catch(() => undefined);
    }, UPDATE_EVERY_MS);
    cleanup = () => clearInterval(timer);
  });
  HybridAutoPlay.addListener('didDisconnect', () => {
    cleanup?.();
    cleanup = null;
  });
}
