import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BreadcrumbTrail } from '@/components/map/BreadcrumbTrail';
import { CarMarker } from '@/components/map/CarMarker';
import { HeadingDebugChip } from '@/components/map/HeadingDebugChip';
import { StatusOverlay } from '@/components/map/StatusOverlay';
import { useAnimatedPose } from '@/hooks/useAnimatedPose';
import { useLocationTracking } from '@/hooks/useLocationTracking';
import { useSettings } from '@/state/settingsStore';
import { useTracking } from '@/state/trackingStore';
import { colors, radius, spacing } from '@/theme';

const PUNE_REGION = { latitude: 18.5308, longitude: 73.8475, latitudeDelta: 0.08, longitudeDelta: 0.08 };
const FOLLOW_ZOOM = 17;

export default function MapScreen() {
  const [retryToken, setRetryToken] = useState(0);
  useLocationTracking(retryToken);

  const tracking = useTracking((s) => s.tracking);
  const status = useTracking((s) => s.status);
  const cameraMode = useSettings((s) => s.cameraMode);
  const setCameraMode = useSettings((s) => s.setCameraMode);
  const testModeOn = useSettings((s) => s.testMode.enabled);

  const mapRef = useRef<MapView>(null);
  const [following, setFollowing] = useState(true);

  const heading = tracking.heading.heading;
  const target = useMemo(
    () => (tracking.position ? { position: tracking.position, rotation: heading ?? 0 } : null),
    [tracking.position, heading],
  );
  const pose = useAnimatedPose(target);

  // Camera follows the car: north-up, or rotated so the direction of travel points up.
  useEffect(() => {
    if (!following || !tracking.position) return;
    mapRef.current?.animateCamera(
      {
        center: tracking.position,
        heading: cameraMode === 'heading-up' && heading !== null ? heading : 0,
        pitch: cameraMode === 'heading-up' ? 35 : 0,
        zoom: FOLLOW_ZOOM,
      },
      { duration: 800 },
    );
  }, [following, tracking.position, heading, cameraMode]);

  const recenter = useCallback(() => setFollowing(true), []);
  const toggleCamera = useCallback(
    () => setCameraMode(cameraMode === 'heading-up' ? 'north-up' : 'heading-up'),
    [cameraMode, setCameraMode],
  );

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
        <BreadcrumbTrail trail={tracking.trail} />
        {pose && <CarMarker position={pose.position} rotation={heading === null ? null : pose.rotation} frozen={tracking.heading.stationary} />}
      </MapView>

      <SafeAreaView style={styles.overlay} edges={['top']} pointerEvents="box-none">
        <HeadingDebugChip tracking={tracking} testMode={testModeOn} />
        <View style={styles.controls}>
          <Pressable style={styles.fab} onPress={toggleCamera} accessibilityLabel="Toggle north-up or heading-up">
            <Text style={styles.fabText}>{cameraMode === 'heading-up' ? 'Heading up' : 'North up'}</Text>
          </Pressable>
          {!following && (
            <Pressable style={[styles.fab, styles.fabPrimary]} onPress={recenter} accessibilityLabel="Re-centre on my location">
              <Text style={[styles.fabText, styles.fabPrimaryText]}>Re-centre</Text>
            </Pressable>
          )}
        </View>
      </SafeAreaView>

      {status.kind === 'requesting-permission' && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>Waiting for location permission…</Text>
        </View>
      )}
      {status.kind === 'tracking' && !tracking.position && (
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
  controls: { position: 'absolute', right: spacing(3), top: spacing(14), gap: spacing(2), alignItems: 'flex-end' },
  fab: {
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2.5),
    elevation: 4,
  },
  fabText: { color: colors.text, fontWeight: '700' },
  fabPrimary: { backgroundColor: colors.primary },
  fabPrimaryText: { color: '#fff' },
  banner: {
    position: 'absolute',
    bottom: spacing(6),
    alignSelf: 'center',
    backgroundColor: 'rgba(16,24,40,0.85)',
    borderRadius: radius.pill,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2),
  },
  bannerText: { color: '#fff' },
});
