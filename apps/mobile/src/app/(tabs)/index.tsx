import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { googleMapsNavigationUrl } from '@roadtrip/core';
import { RangeBadge } from '@/components/fuel/RangeBadge';
import { BreadcrumbTrail } from '@/components/map/BreadcrumbTrail';
import { CarMarker } from '@/components/map/CarMarker';
import { HeadingDebugChip } from '@/components/map/HeadingDebugChip';
import { StatusOverlay } from '@/components/map/StatusOverlay';
import { AlongRoutePanel, usePanelItems, type PanelTab } from '@/components/route/AlongRoutePanel';
import { DestinationSearch } from '@/components/route/DestinationSearch';
import { Button } from '@/components/ui/primitives';
import { useAnimatedPose } from '@/hooks/useAnimatedPose';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import { useNearbyFuel } from '@/hooks/useNearbyFuel';
import { computeFuelPlan } from '@/services/routing/fuelPlan';
import { useGarage } from '@/state/garageStore';
import { useRoute } from '@/state/routeStore';
import { useSettings } from '@/state/settingsStore';
import { useTracking } from '@/state/trackingStore';
import { colors, radius, spacing } from '@/theme';

const PUNE_REGION = { latitude: 18.5308, longitude: 73.8475, latitudeDelta: 0.08, longitudeDelta: 0.08 };
const FOLLOW_ZOOM = 17;
const TAB_PIN: Record<PanelTab, string> = { petrol: '#B54708', restroom: '#0E9384', restaurant: '#C11574' };

export default function MapScreen() {
  const [retryToken, setRetryToken] = useState(0);
  useLocationTracking(retryToken);

  const tracking = useTracking((s) => s.tracking);
  const status = useTracking((s) => s.status);
  const cameraMode = useSettings((s) => s.cameraMode);
  const setCameraMode = useSettings((s) => s.setCameraMode);
  const testModeOn = useSettings((s) => s.testMode.enabled);
  const showDebug = useSettings((s) => s.showDebugChip);
  const lowRangeKm = useSettings((s) => s.lowRangeKm);
  const vehicle = useGarage((s) => s.active);
  const garageLoaded = useGarage((s) => s.loaded);
  const range = useGarage((s) => s.range);
  const { route, destination, waypoints, navigating, results } = useRoute();
  const setDestination = useRoute((s) => s.setDestination);
  const clearRoute = useRoute((s) => s.clear);

  const mapRef = useRef<MapView>(null);
  const [following, setFollowing] = useState(true);
  const [tab, setTab] = useState<PanelTab>('petrol');

  const position = tracking.position;
  const heading = tracking.heading.heading;
  const target = useMemo(() => (position ? { position, rotation: heading ?? 0 } : null), [position, heading]);
  const pose = useAnimatedPose(target);

  const noRouteLowRange = !navigating && range?.rangeKm != null && range.rangeKm < lowRangeKm;
  const nearby = useNearbyFuel(noRouteLowRange, position, heading);
  const { items: tabItems } = usePanelItems(tab, position);
  const plan = useMemo(
    () => computeFuelPlan({ route, petrol: results.petrol, position, range, vehicle }),
    [route, results.petrol, position, range, vehicle],
  );

  useEffect(() => {
    if (!following || !position) return;
    mapRef.current?.animateCamera(
      {
        center: position,
        heading: cameraMode === 'heading-up' && heading !== null ? heading : 0,
        pitch: cameraMode === 'heading-up' ? 35 : 0,
        zoom: FOLLOW_ZOOM,
      },
      { duration: 800 },
    );
  }, [following, position, heading, cameraMode]);

  const openGoogleMaps = useCallback(() => {
    if (!destination) return;
    const url = googleMapsNavigationUrl({
      origin: position,
      destination: { location: destination.location, placeId: destination.placeId },
      waypoints: waypoints.map((w) => ({ location: w.location, placeId: w.placeId })),
    });
    void Linking.openURL(url);
  }, [destination, position, waypoints]);

  return (
    <View style={styles.root}>
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFill}
        provider={PROVIDER_GOOGLE}
        initialRegion={PUNE_REGION}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        toolbarEnabled={false}
        onPanDrag={() => setFollowing(false)}
      >
        {route && <Polyline coordinates={route.geometry.path} strokeColor="rgba(11,95,255,0.55)" strokeWidth={7} zIndex={5} />}
        {destination && <Marker coordinate={destination.location} title={destination.name} pinColor={colors.primary} />}
        {navigating &&
          tabItems.slice(0, 40).map(({ item, highlight }) => (
            <Marker
              key={`${tab}-${item.place.placeId}`}
              coordinate={item.place.location}
              title={item.place.name}
              description={`${item.aheadKm.toFixed(0)} km ahead · +${Math.round(item.detourMin)} min · tap to add stop`}
              pinColor={highlight ? colors.danger : TAB_PIN[tab]}
              onCalloutPress={() => void useRoute.getState().addStop({ name: item.place.name, location: item.place.location, placeId: item.place.placeId }, position)}
            />
          ))}
        {nearby.stations.map((s) => (
          <Marker key={`near-${s.place.placeId}`} coordinate={s.place.location} title={s.place.name} description={`${s.distanceKm.toFixed(1)} km${s.ahead ? ' ahead' : ' behind'}`} pinColor={TAB_PIN.petrol} />
        ))}
        <BreadcrumbTrail trail={tracking.trail} />
        {pose && <CarMarker position={pose.position} rotation={heading === null ? null : pose.rotation} frozen={tracking.heading.stationary} />}
      </MapView>

      <SafeAreaView style={styles.overlay} edges={['top']} pointerEvents="box-none">
        <View style={styles.topRow} pointerEvents="box-none">
          {navigating && destination ? (
            <View style={styles.navBar}>
              <Text style={styles.navTitle} numberOfLines={1}>
                To {destination.name}
                {waypoints.length ? ` · ${waypoints.length} stop${waypoints.length > 1 ? 's' : ''}` : ''}
              </Text>
              {plan?.plan.warning === 'none-reachable' && <Text style={styles.warn}>No open pump reachable before reserve — check Petrol tab</Text>}
            </View>
          ) : (
            <DestinationSearch
              near={position}
              onPick={(d) => {
                const origin = position ? { name: 'Current location', location: position, placeId: null } : null;
                if (!origin) return;
                void setDestination({ name: d.name, location: d.location, placeId: d.placeId }, origin, vehicle?.vehicleType === 'two-wheeler' ? 'TWO_WHEELER' : 'DRIVE');
                router.push('/route-preview');
              }}
            />
          )}
        </View>
        <View style={styles.secondRow} pointerEvents="box-none">
          {vehicle ? (
            <RangeBadge range={range} onPress={() => router.push('/fuel-level')} />
          ) : garageLoaded ? (
            <Pressable style={styles.setup} onPress={() => router.push('/vehicles/edit')} accessibilityRole="button">
              <Text style={styles.setupText}>Add your vehicle to see range →</Text>
            </Pressable>
          ) : null}
          <View style={styles.controls}>
            <Pressable style={styles.fab} onPress={() => setCameraMode(cameraMode === 'heading-up' ? 'north-up' : 'heading-up')} accessibilityLabel="Toggle north-up or heading-up">
              <Text style={styles.fabText}>{cameraMode === 'heading-up' ? 'Heading up' : 'North up'}</Text>
            </Pressable>
            {!following && (
              <Pressable style={[styles.fab, styles.fabPrimary]} onPress={() => setFollowing(true)} accessibilityLabel="Re-centre on my location">
                <Text style={[styles.fabText, styles.fabPrimaryText]}>Re-centre</Text>
              </Pressable>
            )}
          </View>
        </View>
        {(showDebug || testModeOn) && (
          <View style={styles.debug} pointerEvents="none">
            <HeadingDebugChip tracking={tracking} testMode={testModeOn} />
          </View>
        )}
      </SafeAreaView>

      {navigating ? (
        <AlongRoutePanel
          position={position}
          tab={tab}
          onTab={setTab}
          header={
            <View style={styles.navActions}>
              <Button compact label="Navigate in Google Maps" onPress={openGoogleMaps} style={styles.flex} />
              <Button compact variant="secondary" label="Add fuel" onPress={() => router.push('/fuel/edit?quick=1')} />
              <Button compact variant="danger" label="End" onPress={clearRoute} />
            </View>
          }
        />
      ) : (
        <>
          {noRouteLowRange && (
            <View style={styles.nearbyCard}>
              <Text style={styles.nearbyTitle}>Low range — petrol pumps nearby</Text>
              {nearby.error ? <Text style={styles.warn}>{nearby.error}</Text> : null}
              {nearby.stations.slice(0, 3).map((s) => (
                <Text key={s.place.placeId} style={styles.nearbyRow} numberOfLines={1}>
                  {s.place.name} · {s.distanceKm.toFixed(1)} km {s.ahead ? 'ahead' : 'behind'}
                </Text>
              ))}
              {!nearby.loading && !nearby.error && nearby.stations.length === 0 && <Text style={styles.nearbyRow}>No open pumps found within 15 km.</Text>}
            </View>
          )}
          <Pressable style={styles.addFuel} onPress={() => router.push('/fuel/edit?quick=1')} accessibilityRole="button" accessibilityLabel="Add fuel">
            <Text style={styles.addFuelText}>＋ Add fuel</Text>
          </Pressable>
        </>
      )}

      {status.kind === 'requesting-permission' && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Waiting for location permission…</Text>
        </View>
      )}
      {status.kind === 'tracking' && !position && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Getting a GPS fix… (go outdoors or near a window)</Text>
        </View>
      )}
      <StatusOverlay status={status} onRetry={() => setRetryToken((n) => n + 1)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  topRow: { flexDirection: 'row', paddingHorizontal: spacing(3), paddingTop: spacing(2), zIndex: 10 },
  secondRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: spacing(3), marginTop: spacing(2) },
  navBar: { flex: 1, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing(3), elevation: 4 },
  navTitle: { fontWeight: '800', fontSize: 16, color: colors.text },
  warn: { color: colors.danger, fontSize: 13, marginTop: 2 },
  setup: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing(3), elevation: 4 },
  setupText: { color: colors.primary, fontWeight: '700' },
  controls: { gap: spacing(2), alignItems: 'flex-end' },
  fab: { backgroundColor: colors.surface, borderRadius: radius.pill, paddingHorizontal: spacing(4), paddingVertical: spacing(2.5), elevation: 4 },
  fabText: { color: colors.text, fontWeight: '700' },
  fabPrimary: { backgroundColor: colors.primary },
  fabPrimaryText: { color: '#fff' },
  debug: { paddingHorizontal: spacing(3), marginTop: spacing(2) },
  navActions: { flexDirection: 'row', gap: spacing(2), marginBottom: spacing(2) },
  flex: { flex: 1 },
  nearbyCard: {
    position: 'absolute',
    left: spacing(3),
    right: spacing(3),
    bottom: spacing(24),
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing(4),
    elevation: 6,
  },
  nearbyTitle: { fontWeight: '800', color: colors.warning, marginBottom: spacing(1) },
  nearbyRow: { color: colors.text, paddingVertical: 2 },
  addFuel: {
    position: 'absolute',
    right: spacing(4),
    bottom: spacing(6),
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(3.5),
    elevation: 6,
  },
  addFuelText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  banner: {
    position: 'absolute',
    bottom: spacing(24),
    alignSelf: 'center',
    backgroundColor: 'rgba(16,24,40,0.85)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2),
  },
  bannerText: { color: '#fff' },
});
