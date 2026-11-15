import { Pressable, StyleSheet, Text } from 'react-native';
import { formatRange, type RangeEstimate } from '@roadtrip/core';
import { colors, radius, spacing } from '@/theme';

/** "≈ 210 km range" chip on the map. Tap to correct the fuel gauge. */
export function RangeBadge({ range, onPress }: { range: RangeEstimate | null; onPress: () => void }) {
  const km = range?.rangeKm ?? null;
  const tone = range?.atReserve ? colors.danger : km !== null && km < 100 ? colors.warning : colors.text;
  const pct = range?.fuel.fraction != null ? `${Math.round(range.fuel.fraction * 100)}% fuel` : 'Log a fill to see range';
  return (
    <Pressable style={styles.badge} onPress={onPress} accessibilityRole="button" accessibilityLabel={`${formatRange(km)}. ${pct}. Tap to adjust fuel level.`}>
      <Text style={[styles.range, { color: tone }]}>{formatRange(km)}</Text>
      <Text style={styles.sub}>
        {pct}
        {range?.lowConfidence ? ' · estimate (needs 2 full-tank fills)' : ''}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2),
    elevation: 4,
    maxWidth: 230,
  },
  range: { fontSize: 18, fontWeight: '800' },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 1 },
});
