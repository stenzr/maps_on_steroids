import { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { router, Stack } from 'expo-router';
import { googleMapsNavigationUrl, isFoodPlace, planBreaks, progressOnRoute } from '@roadtrip/core';
import { PlaceRow } from '@/components/route/PlaceRow';
import { Button, Card, formatInr, Stat } from '@/components/ui/primitives';
import { computeFuelPlan } from '@/services/routing/fuelPlan';
import { useGarage } from '@/state/garageStore';
import { itemsAheadOf, useRoute } from '@/state/routeStore';
import { useSettings } from '@/state/settingsStore';
import { useTracking } from '@/state/trackingStore';
import { colors, radius, spacing } from '@/theme';

const fmtDuration = (s: number): string => {
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
};

export default function RoutePreviewScreen() {
  const { route, routeState, destination, waypoints, results, fetchAlong, addStop, removeStop, start } = useRoute();
  const position = useTracking((s) => s.tracking.position);
  const range = useGarage((s) => s.range);
  const vehicle = useGarage((s) => s.active);
  const lastPrice = useGarage((s) => s.logs.at(-1)?.pricePerUnit ?? null);
  const breakOn = useSettings((s) => s.breakPlannerEnabled);
  const breakEvery = useSettings((s) => s.breakEveryHours);
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    if (!route) return;
    void fetchAlong('petrol', position, range?.rangeKm ?? null);
    if (breakOn) void fetchAlong('restaurant', position, range?.rangeKm ?? null);
    mapRef.current?.fitToCoordinates(route.geometry.path, { edgePadding: { top: 40, bottom: 40, left: 40, right: 40 }, animated: false });
  }, [route]); // eslint-disable-line react-hooks/exhaustive-deps

  const plan = useMemo(() => computeFuelPlan({ route, petrol: results.petrol, position, range, vehicle }), [route, results.petrol, position, range, vehicle]);

  const breaks = useMemo(() => {
    if (!route || !breakOn) return [];
    const progress = progressOnRoute(route.geometry, route.result.durationS, position);
    const restaurants = itemsAheadOf(results.restaurant.items, route.geometry, position, results.restaurant.fromAlongM).filter((i) => isFoodPlace(i.place));
    return planBreaks({
      candidates: restaurants,
      remainingKm: (route.geometry.lengthM - progress.alongM) / 1000,
      remainingDurationS: progress.remainingDurationS,
      everyHours: breakEvery,
    });
  }, [route, results.restaurant, position, breakOn, breakEvery]);

  if (routeState.status === 'loading' || (!route && routeState.status === 'idle')) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Route' }} />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.muted}>Finding the route…</Text>
      </View>
    );
  }
  if (routeState.status === 'error' || !route || !destination) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Route' }} />
        <Text style={styles.error}>{routeState.status === 'error' ? routeState.message : 'No route.'}</Text>
        <Button label="Back" onPress={() => router.back()} />
      </View>
    );
  }

  const km = route.result.distanceMeters / 1000;
  const fuelNeeded = range ? km / range.kmPerUnit : null;
  const cost = fuelNeeded !== null && lastPrice !== null ? fuelNeeded * lastPrice : null;
  const added = new Set(waypoints.map((w) => w.placeId));

  const openGoogleMaps = (): void => {
    void Linking.openURL(
      googleMapsNavigationUrl({
        origin: position,
        destination: { location: destination.location, placeId: destination.placeId },
        waypoints: waypoints.map((w) => ({ location: w.location, placeId: w.placeId })),
      }),
    );
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: `To ${destination.name}` }} />
      <View style={styles.mapWrap}>
        <MapView ref={mapRef} style={StyleSheet.absoluteFill} provider={PROVIDER_GOOGLE} toolbarEnabled={false}>
          <Polyline coordinates={route.geometry.path} strokeColor={colors.primary} strokeWidth={5} />
          <Marker coordinate={destination.location} title={destination.name} />
          {plan?.plan.stops.map((s) => (
            <Marker key={s.item.place.placeId} coordinate={s.item.place.location} title={`Fuel: ${s.item.place.name}`} pinColor={colors.warning} />
          ))}
          {breaks.map((b) =>
            b.item ? <Marker key={`b-${b.item.place.placeId}`} coordinate={b.item.place.location} title={`Break: ${b.item.place.name}`} pinColor="#C11574" /> : null,
          )}
        </MapView>
      </View>

      <Card>
        <View style={styles.stats}>
          <Stat label="Distance" value={`${km.toFixed(0)} km`} />
          <Stat label="Drive time" value={fmtDuration(route.result.durationS)} />
          <Stat label="Est. fuel cost" value={formatInr(cost)} sub={cost === null ? 'Log a fill to estimate' : `${fuelNeeded!.toFixed(1)} ${vehicle?.fuelType === 'cng' ? 'kg' : 'L'}`} />
        </View>
      </Card>

      <Card title="Fuel stops">
        {results.petrol.state.status === 'loading' && <ActivityIndicator color={colors.primary} />}
        {results.petrol.state.status === 'error' && <Text style={styles.error}>{results.petrol.state.message}</Text>}
        {!range || range.rangeKm === null ? (
          <Text style={styles.muted}>Log a fuel fill (or set the fuel gauge) to plan fuel stops.</Text>
        ) : plan?.plan.noStopNeeded ? (
          <Text style={styles.ok}>No fuel stop needed — you'll arrive with more than the reserve.</Text>
        ) : plan?.plan.warning === 'none-reachable' ? (
          <Text style={styles.error}>No open petrol pump found within your range before reserve. Refuel early or check the Petrol tab.</Text>
        ) : (
          plan?.plan.stops.map((s) => (
            <PlaceRow
              key={s.item.place.placeId}
              item={s.item}
              highlight={`Arrive with ≈ ${Math.round(s.arrivalRangeKm)} km range`}
              added={added.has(s.item.place.placeId)}
              onAddStop={() => void addStop({ name: s.item.place.name, location: s.item.place.location, placeId: s.item.place.placeId }, position)}
            />
          ))
        )}
      </Card>

      {breakOn && breaks.length > 0 && (
        <Card title={`Breaks every ${breakEvery} h`}>
          {breaks.map((b) =>
            b.item ? (
              <PlaceRow
                key={`${b.atHours}-${b.item.place.placeId}`}
                item={b.item}
                highlight={`After ~${b.atHours} h · food + restroom`}
                added={added.has(b.item.place.placeId)}
                onAddStop={() => void addStop({ name: b.item!.place.name, location: b.item!.place.location, placeId: b.item!.place.placeId }, position)}
              />
            ) : (
              <Text key={b.atHours} style={styles.muted}>
                After ~{b.atHours} h (≈ {Math.round(b.targetKm)} km): no place with food and a restroom found nearby.
              </Text>
            ),
          )}
        </Card>
      )}

      {waypoints.length > 0 && (
        <Card title="Your stops">
          {waypoints.map((w, i) => (
            <View key={`${w.placeId}-${i}`} style={styles.stopRow}>
              <Text style={styles.stopName}>{w.name}</Text>
              <Button compact variant="danger" label="Remove" onPress={() => void removeStop(w.placeId, i)} />
            </View>
          ))}
        </Card>
      )}

      <Button
        label="Start"
        onPress={() => {
          start();
          router.back();
        }}
      />
      <Button variant="secondary" label="Navigate in Google Maps" onPress={openGoogleMaps} />
      <Text style={styles.attribution}>Route and places from Google Maps</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing(4), gap: spacing(3), paddingBottom: spacing(12) },
  mapWrap: { height: 260, borderRadius: radius.lg, overflow: 'hidden' },
  stats: { flexDirection: 'row', gap: spacing(3) },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing(4), padding: spacing(6) },
  muted: { color: colors.textMuted },
  error: { color: colors.danger },
  ok: { color: '#027A48', fontWeight: '600' },
  stopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing(2) },
  stopName: { flex: 1, fontWeight: '600', color: colors.text },
  attribution: { textAlign: 'center', color: colors.textMuted, fontSize: 12 },
});
