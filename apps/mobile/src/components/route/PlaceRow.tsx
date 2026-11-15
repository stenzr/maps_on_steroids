import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { RESTROOM_LABEL, type AlongRouteItem, type FuelPrice, type RestroomEvidence } from '@roadtrip/core';
import { Button } from '@/components/ui/primitives';
import { colors, spacing } from '@/theme';

const FUEL_LABEL: Record<string, string> = {
  REGULAR_UNLEADED: 'Petrol',
  PREMIUM: 'Premium',
  DIESEL: 'Diesel',
  DIESEL_PLUS: 'Diesel+',
  LPG: 'LPG',
  METHANE: 'CNG',
  E85: 'E85',
  E100: 'E100',
};

const prices = (p: FuelPrice[]): string =>
  p
    .slice(0, 3)
    .map((f) => `${FUEL_LABEL[f.type] ?? f.type} ₹${f.price.toFixed(2)}`)
    .join(' · ');

interface Props {
  item: AlongRouteItem;
  evidence?: RestroomEvidence;
  highlight?: string;
  onAddStop?: () => void;
  added?: boolean;
}

/** Name, km ahead, detour, rating, open/closed and "Add stop". */
function PlaceRowImpl({ item, evidence, highlight, onAddStop, added }: Props) {
  const p = item.place;
  const open = p.openNow === true ? 'Open' : p.openNow === false ? 'Closed' : 'Hours unknown';
  const detour = `${item.detourFromGoogle ? '+' : '~+'}${Math.max(0, Math.round(item.detourMin))} min`;
  return (
    <View style={styles.row}>
      <View style={styles.main}>
        {highlight ? <Text style={styles.highlight}>{highlight}</Text> : null}
        <Text style={styles.name} numberOfLines={1}>
          {p.name}
        </Text>
        <Text style={styles.meta}>
          {item.aheadKm.toFixed(item.aheadKm < 10 ? 1 : 0)} km ahead · {detour} · {p.rating !== null ? `★ ${p.rating.toFixed(1)}` : 'No rating'} ·{' '}
          <Text style={{ color: p.openNow === false ? colors.danger : p.openNow ? '#027A48' : colors.textMuted }}>{open}</Text>
        </Text>
        {evidence ? <Text style={styles.tag}>{RESTROOM_LABEL[evidence]}</Text> : null}
        {p.fuelPrices.length > 0 ? <Text style={styles.meta}>{prices(p.fuelPrices)}</Text> : null}
      </View>
      {onAddStop ? <Button compact label={added ? 'Added' : 'Add stop'} variant={added ? 'ghost' : 'secondary'} onPress={onAddStop} disabled={added} /> : null}
    </View>
  );
}

export const PlaceRow = memo(PlaceRowImpl);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing(3),
    paddingVertical: spacing(3),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  main: { flex: 1 },
  highlight: { color: colors.primary, fontWeight: '800', fontSize: 12, marginBottom: 2 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  tag: { fontSize: 12, color: colors.primaryDark, fontWeight: '600', marginTop: 3 },
});
