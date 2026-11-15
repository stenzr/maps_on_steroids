import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  filterRestaurants,
  isFoodPlace,
  restroomItems,
  type AlongRouteItem,
  type LatLng,
  type RestaurantFilters,
  type RestroomEvidence,
} from '@roadtrip/core';
import { PlaceRow } from '@/components/route/PlaceRow';
import type { AlongRouteCategory } from '@/services/api/proxyClient';
import { computeFuelPlan } from '@/services/routing/fuelPlan';
import { useGarage } from '@/state/garageStore';
import { itemsAheadOf, useRoute } from '@/state/routeStore';
import { useSettings } from '@/state/settingsStore';
import { colors, radius, spacing } from '@/theme';

export type PanelTab = 'restroom' | 'restaurant' | 'petrol';
const TABS: { key: PanelTab; label: string }[] = [
  { key: 'restroom', label: 'Restrooms' },
  { key: 'restaurant', label: 'Restaurants' },
  { key: 'petrol', label: 'Petrol' },
];

/** Which proxy searches each tab needs. Restrooms reuse petrol + restaurant results (restroom attribute). */
const SEARCHES: Record<PanelTab, AlongRouteCategory[]> = {
  restroom: ['restroom', 'petrol', 'restaurant'],
  restaurant: ['restaurant'],
  petrol: ['petrol'],
};

export interface PanelItem {
  item: AlongRouteItem;
  evidence?: RestroomEvidence;
  highlight?: string;
}

/** Items for a tab, re-anchored to the car's position. Shared with the map markers and the car screen. */
export function usePanelItems(tab: PanelTab, position: LatLng | null): { items: PanelItem[]; loading: boolean; error: string | null } {
  const route = useRoute((s) => s.route);
  const results = useRoute((s) => s.results);
  const filters = useSettings((s) => s.restaurantFilters);
  const includeLikely = useSettings((s) => s.includeLikelyRestrooms);
  const range = useGarage((s) => s.range);
  const vehicle = useGarage((s) => s.active);

  return useMemo(() => {
    const ahead = (c: AlongRouteCategory) =>
      route ? itemsAheadOf(results[c].items, route.geometry, position, results[c].fromAlongM) : [];
    const states = SEARCHES[tab].map((c) => results[c].state);
    const loading = states.some((s) => s.status === 'loading');
    const err = states.find((s) => s.status === 'error');
    const error = err && err.status === 'error' ? err.message : null;

    if (tab === 'petrol') {
      const planned = computeFuelPlan({ route, petrol: results.petrol, position, range, vehicle });
      const suggested = new Set(planned?.plan.stops.map((s) => s.item.place.placeId));
      const items = ahead('petrol').map((item) => ({ item, highlight: suggested.has(item.place.placeId) ? 'SUGGESTED FUEL STOP' : undefined }));
      return { items, loading, error };
    }
    if (tab === 'restaurant') {
      const items = filterRestaurants(ahead('restaurant').filter((i) => isFoodPlace(i.place)), filters).map((item) => ({ item }));
      return { items, loading, error };
    }
    const merged = new Map<string, AlongRouteItem>();
    for (const c of SEARCHES.restroom) for (const i of ahead(c)) if (!merged.has(i.place.placeId)) merged.set(i.place.placeId, i);
    const items = restroomItems([...merged.values()].sort((a, b) => a.aheadKm - b.aheadKm), includeLikely).map((i) => ({ item: i, evidence: i.evidence }));
    return { items, loading, error };
  }, [tab, route, results, position, filters, includeLikely, range, vehicle]);
}

function FilterChips({ filters, onChange }: { filters: RestaurantFilters; onChange: (f: RestaurantFilters) => void }) {
  const chips: { label: string; on: boolean; toggle: () => RestaurantFilters }[] = [
    { label: 'Open now', on: filters.openNow, toggle: () => ({ ...filters, openNow: !filters.openNow }) },
    { label: '★ 4+', on: filters.minRating === 4, toggle: () => ({ ...filters, minRating: filters.minRating === 4 ? null : 4 }) },
    { label: 'Veg-friendly', on: filters.vegetarianOnly, toggle: () => ({ ...filters, vegetarianOnly: !filters.vegetarianOnly }) },
    { label: '₹₹ or less', on: filters.maxPriceLevel === 'MODERATE', toggle: () => ({ ...filters, maxPriceLevel: filters.maxPriceLevel ? null : 'MODERATE' }) },
    { label: 'Next 50 km', on: filters.withinKm === 50, toggle: () => ({ ...filters, withinKm: filters.withinKm === 50 ? null : 50 }) },
    {
      label: `Detour ≤ ${filters.maxDetourMin ?? '∞'} min`,
      on: filters.maxDetourMin !== null,
      toggle: () => ({ ...filters, maxDetourMin: filters.maxDetourMin === 10 ? 15 : filters.maxDetourMin === 15 ? 30 : filters.maxDetourMin === 30 ? null : 10 }),
    },
  ];
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {chips.map((c) => (
        <Pressable key={c.label} onPress={() => onChange(c.toggle())} style={[styles.chip, c.on && styles.chipOn]} accessibilityRole="switch" accessibilityState={{ checked: c.on }}>
          <Text style={[styles.chipText, c.on && styles.chipTextOn]}>{c.label}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

export function AlongRoutePanel({
  position,
  tab,
  onTab,
  header,
}: {
  position: LatLng | null;
  tab: PanelTab;
  onTab: (t: PanelTab) => void;
  header?: ReactNode;
}) {
  const [expanded, setExpanded] = useState(true);
  const fetchAlong = useRoute((s) => s.fetchAlong);
  const addStop = useRoute((s) => s.addStop);
  const waypoints = useRoute((s) => s.waypoints);
  const rangeKm = useGarage((s) => s.range?.rangeKm ?? null);
  const filters = useSettings((s) => s.restaurantFilters);
  const update = useSettings((s) => s.update);
  const { items, loading, error } = usePanelItems(tab, position);

  // Fetch what this tab needs; the store skips calls if results are still fresh (debounce).
  useEffect(() => {
    for (const c of SEARCHES[tab]) void fetchAlong(c, position, rangeKm);
    // Only refire when the tab changes or we've moved on ~1 km; position updates every second.
  }, [tab, fetchAlong, rangeKm, Math.round((position?.latitude ?? 0) * 100), Math.round((position?.longitude ?? 0) * 100)]); // eslint-disable-line react-hooks/exhaustive-deps

  const added = new Set(waypoints.map((w) => w.placeId));

  return (
    <View style={styles.panel}>
      <Pressable onPress={() => setExpanded((e) => !e)} style={styles.handleArea} accessibilityRole="button" accessibilityLabel={expanded ? 'Collapse along-route panel' : 'Expand along-route panel'}>
        <View style={styles.handle} />
      </Pressable>
      {header}
      <View style={styles.tabs}>
        {TABS.map((t) => (
          <Pressable key={t.key} onPress={() => (onTab(t.key), setExpanded(true))} style={[styles.tab, tab === t.key && styles.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: tab === t.key }}>
            <Text style={[styles.tabText, tab === t.key && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>
      {expanded && (
        <>
          {tab === 'restaurant' && <FilterChips filters={filters} onChange={(f) => update({ restaurantFilters: f })} />}
          <ScrollView style={styles.list} nestedScrollEnabled>
            {loading && items.length === 0 && <ActivityIndicator style={styles.pad} color={colors.primary} />}
            {error && (
              <Pressable onPress={() => SEARCHES[tab].forEach((c) => void fetchAlong(c, position, rangeKm, true))}>
                <Text style={styles.error}>{error} Tap to retry.</Text>
              </Pressable>
            )}
            {!loading && !error && items.length === 0 && <Text style={styles.empty}>Nothing found along the next stretch of your route.</Text>}
            {items.map(({ item, evidence, highlight }) => (
              <PlaceRow
                key={item.place.placeId}
                item={item}
                evidence={evidence}
                highlight={highlight}
                added={added.has(item.place.placeId)}
                onAddStop={() => void addStop({ name: item.place.name, location: item.place.location, placeId: item.place.placeId }, position)}
              />
            ))}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingHorizontal: spacing(4),
    paddingBottom: spacing(2),
    elevation: 12,
  },
  handleArea: { alignItems: 'center', paddingVertical: spacing(2) },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border },
  tabs: { flexDirection: 'row', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 3 },
  tab: { flex: 1, alignItems: 'center', paddingVertical: spacing(2), borderRadius: radius.sm },
  tabOn: { backgroundColor: colors.surface, elevation: 2 },
  tabText: { fontWeight: '600', color: colors.textMuted },
  tabTextOn: { color: colors.primary },
  chips: { gap: spacing(2), paddingVertical: spacing(2) },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.pill, paddingHorizontal: spacing(3), paddingVertical: spacing(1.5) },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  chipTextOn: { color: '#fff' },
  list: { maxHeight: 280 },
  pad: { padding: spacing(4) },
  error: { color: colors.danger, padding: spacing(3) },
  empty: { color: colors.textMuted, padding: spacing(3), textAlign: 'center' },
});
