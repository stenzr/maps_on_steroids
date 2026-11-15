import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { computeMileagePeriods, efficiencyUnit, fuelUnit, mileageStats } from '@roadtrip/core';
import { Button, Card, EmptyState, formatDate, formatInr, Stat } from '@/components/ui/primitives';
import { listFuelLogs, type StoredFuelLog } from '@/db/repositories';
import { exportFuelLogCsv } from '@/services/export/csvExport';
import { useGarage } from '@/state/garageStore';
import { colors, spacing } from '@/theme';

export default function FuelLogScreen() {
  const vehicle = useGarage((s) => s.active);
  const vehicles = useGarage((s) => s.vehicles);
  const logs = useGarage((s) => s.logs);
  const [exporting, setExporting] = useState(false);

  const stats = useMemo(() => mileageStats(logs), [logs]);
  const periodByEnd = useMemo(() => new Map(computeMileagePeriods(logs).map((p) => [p.endLogId, p])), [logs]);
  const reversed = useMemo(() => [...logs].reverse(), [logs]);

  if (!vehicle) {
    return <EmptyState title="No vehicle yet" body="Add your car or bike to start logging fuel." action={<Button label="Add vehicle" onPress={() => router.push('/vehicles/edit')} />} />;
  }
  const effUnit = efficiencyUnit(vehicle.fuelType);
  const unit = fuelUnit(vehicle.fuelType);
  const fmt = (v: number | null) => (v === null ? '—' : v.toFixed(1));

  const onExport = async (): Promise<void> => {
    setExporting(true);
    try {
      // All vehicles, not just the active one.
      await exportFuelLogCsv(await listFuelLogs(), vehicles);
    } catch (e) {
      Alert.alert('Export failed', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setExporting(false);
    }
  };

  const renderItem = ({ item }: { item: StoredFuelLog }) => {
    const period = periodByEnd.get(item.id);
    return (
      <Pressable style={styles.row} onPress={() => router.push(`/fuel/edit?id=${item.id}`)} accessibilityRole="button">
        <View style={styles.flex}>
          <Text style={styles.title}>
            {item.quantity.toFixed(2)} {unit} · {formatInr(item.totalCost)}
            {item.isFullTank ? '' : ' · partial'}
          </Text>
          <Text style={styles.meta}>
            {formatDate(item.filledAt)} · {item.odometerEstimated ? '~' : ''}
            {item.odometerKm.toLocaleString('en-IN')} km · ₹{item.pricePerUnit.toFixed(2)}/{unit}
          </Text>
          {item.stationName ? <Text style={styles.meta}>{item.stationName}</Text> : null}
          {item.missedPrevious ? <Text style={styles.flag}>Missed fill before this — excluded from mileage</Text> : null}
        </View>
        {period ? (
          <Text style={styles.kmpl}>
            {period.kmPerUnit.toFixed(1)}
            {'\n'}
            <Text style={styles.kmplUnit}>{effUnit}</Text>
          </Text>
        ) : null}
      </Pressable>
    );
  };

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={reversed}
      keyExtractor={(l) => l.id}
      renderItem={renderItem}
      ListHeaderComponent={
        <View style={styles.header}>
          <Card title={vehicle.name} right={<Button compact variant="ghost" label="Change" onPress={() => router.push('/vehicles')} />}>
            <View style={styles.stats}>
              <Stat label={`Latest ${effUnit}`} value={fmt(stats.latest)} />
              <Stat label="Last 5 fills" value={fmt(stats.rolling)} />
              <Stat label="Lifetime" value={fmt(stats.lifetime)} />
            </View>
            {stats.periodCount < 2 && <Text style={styles.note}>Mileage firms up after two full-tank fills in a row.</Text>}
          </Card>
          <View style={styles.actions}>
            <Button label="＋ Add fuel" onPress={() => router.push('/fuel/edit')} style={styles.flex} />
            <Button variant="secondary" label="Export CSV" onPress={() => void onExport()} loading={exporting} disabled={logs.length === 0} />
          </View>
        </View>
      }
      ListEmptyComponent={<EmptyState title="No fuel logged yet" body="Log your next fill — mark it as a full tank to start measuring mileage." />}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing(4), paddingBottom: spacing(12) },
  header: { gap: spacing(3), marginBottom: spacing(3) },
  stats: { flexDirection: 'row', gap: spacing(3) },
  note: { color: colors.textMuted, fontSize: 13, marginTop: spacing(3) },
  actions: { flexDirection: 'row', gap: spacing(3) },
  flex: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing(4),
    marginBottom: spacing(2),
    gap: spacing(3),
  },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  flag: { fontSize: 12, color: colors.warning, marginTop: 3 },
  kmpl: { fontSize: 20, fontWeight: '800', color: colors.primary, textAlign: 'right' },
  kmplUnit: { fontSize: 11, fontWeight: '600', color: colors.textMuted },
});
