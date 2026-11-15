import { StyleSheet, Text, View } from 'react-native';
import type { TrackingState } from '@roadtrip/core';
import { colors, radius, spacing } from '@/theme';

const SOURCE_LABEL: Record<TrackingState['heading']['source'], string> = {
  trend: 'trend',
  'trend+course': 'trend + GPS course',
  course: 'GPS course',
  frozen: 'frozen',
  none: 'waiting for movement',
};

/** Small readout so the heading logic can be checked on the road or in test mode. */
export function HeadingDebugChip({ tracking, testMode }: { tracking: TrackingState; testMode: boolean }) {
  const fix = tracking.lastFix;
  const h = tracking.heading;
  const kmh = fix?.speed != null ? Math.round(fix.speed * 3.6) : null;
  return (
    <View style={styles.chip} pointerEvents="none">
      {testMode && <Text style={styles.test}>TEST MODE · Pune → Nashik</Text>}
      <Text style={styles.text}>
        {h.heading !== null ? `${Math.round(h.heading)}°` : '—'} · {h.stationary ? 'stationary' : SOURCE_LABEL[h.source]}
      </Text>
      <Text style={styles.sub}>
        {kmh !== null ? `${kmh} km/h` : '— km/h'} · ±{fix?.accuracy != null ? Math.round(fix.accuracy) : '—'} m ·{' '}
        {(tracking.distance.totalMeters / 1000).toFixed(1)} km
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    position: 'absolute',
    top: spacing(3),
    left: spacing(3),
    backgroundColor: 'rgba(16,24,40,0.82)',
    borderRadius: radius.md,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
  },
  test: { color: '#FEC84B', fontSize: 11, fontWeight: '700', marginBottom: 2 },
  text: { color: '#fff', fontWeight: '700', fontSize: 14 },
  sub: { color: colors.border, fontSize: 12, marginTop: 1 },
});
