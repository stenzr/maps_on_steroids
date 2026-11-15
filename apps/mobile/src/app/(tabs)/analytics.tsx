import { useCallback, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { BarChart, LineChart } from 'react-native-gifted-charts';
import { costSummary, efficiencySeries, efficiencyUnit, fuelUnit, monthlySpend, priceSeries, tripSummary } from '@roadtrip/core';
import { Card, EmptyState, formatInr, Stat } from '@/components/ui/primitives';
import { listTrips, type TripRow } from '@/db/repositories';
import { useGarage } from '@/state/garageStore';
import { colors, spacing } from '@/theme';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (key: string): string => MONTHS[Number(key.slice(5, 7)) - 1] ?? key;
const shortDate = (ts: number): string => new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

export default function AnalyticsScreen() {
  const vehicle = useGarage((s) => s.active);
  const logs = useGarage((s) => s.logs);
  const range = useGarage((s) => s.range);
  const { width } = useWindowDimensions();
  const chartWidth = width - spacing(8) - spacing(8) - 30;
  const [trips, setTrips] = useState<TripRow[]>([]);

  useFocusEffect(
    useCallback(() => {
      listTrips(30)
        .then(setTrips)
        .catch(() => setTrips([]));
    }, []),
  );

  const eff = useMemo(() => efficiencySeries(logs), [logs]);
  const months = useMemo(() => monthlySpend(logs).slice(-12), [logs]);
  const prices = useMemo(() => priceSeries(logs).slice(-24), [logs]);
  const summary = useMemo(() => costSummary(logs), [logs]);

  if (!vehicle) return <EmptyState title="No vehicle yet" body="Add a vehicle and log fuel to see analytics." />;
  if (logs.length === 0) return <EmptyState title="Nothing to chart yet" body="Log a few fills — mileage needs two full-tank fills in a row." />;

  const effU = efficiencyUnit(vehicle.fuelType);
  const unit = fuelUnit(vehicle.fuelType);
  const kmPerUnit = range?.kmPerUnit ?? 0;
  const lastPrice = logs.at(-1)?.pricePerUnit ?? null;
  const spacingFor = (n: number) => Math.max(18, Math.min(60, chartWidth / Math.max(1, n)));

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Card title="Summary">
        <View style={styles.stats}>
          <Stat label="Cost per km" value={summary.costPerKm !== null ? `₹${summary.costPerKm.toFixed(2)}` : '—'} />
          <Stat label={`Lifetime ${effU}`} value={summary.lifetimeKmPerUnit !== null ? summary.lifetimeKmPerUnit.toFixed(1) : '—'} />
          <Stat label="Total spent" value={formatInr(summary.totalSpend)} sub={`${summary.totalQuantity.toFixed(0)} ${unit}`} />
        </View>
      </Card>

      <Card title={`Mileage (${effU})`}>
        {eff.length < 1 ? (
          <Text style={styles.muted}>Needs two full-tank fills in a row.</Text>
        ) : (
          <>
            <LineChart
              data={eff.map((p) => ({ value: Number(p.kmPerUnit.toFixed(1)), label: shortDate(p.endAt) }))}
              data2={eff.map((p) => ({ value: Number((p.rolling ?? p.kmPerUnit).toFixed(1)) }))}
              color1={colors.primary}
              color2={colors.warning}
              dataPointsColor1={colors.primary}
              hideDataPoints2
              thickness1={2}
              thickness2={2}
              strokeDashArray2={[6, 4]}
              curved
              width={chartWidth}
              height={180}
              spacing={spacingFor(eff.length)}
              initialSpacing={12}
              noOfSections={4}
              yAxisOffset={Math.max(0, Math.floor(Math.min(...eff.map((p) => p.kmPerUnit)) - 3))}
              xAxisLabelTextStyle={styles.axis}
              yAxisTextStyle={styles.axis}
            />
            <Text style={styles.legend}>
              <Text style={{ color: colors.primary }}>●</Text> each full-to-full period <Text style={{ color: colors.warning }}>- -</Text> rolling average (last 5)
            </Text>
          </>
        )}
      </Card>

      <Card title="Fuel spend per month">
        <BarChart
          data={months.map((m) => ({ value: Math.round(m.totalCost), label: monthLabel(m.month) }))}
          frontColor={colors.primary}
          barWidth={Math.min(28, spacingFor(months.length) * 0.6)}
          spacing={spacingFor(months.length) * 0.4}
          width={chartWidth}
          height={180}
          noOfSections={4}
          yAxisLabelPrefix="₹"
          xAxisLabelTextStyle={styles.axis}
          yAxisTextStyle={styles.axis}
        />
      </Card>

      <Card title={`Price per ${unit === 'kg' ? 'kg' : 'litre'}`}>
        <LineChart
          data={prices.map((p) => ({ value: Number(p.price.toFixed(2)), label: shortDate(p.at) }))}
          color1={colors.primaryDark}
          dataPointsColor1={colors.primaryDark}
          thickness1={2}
          width={chartWidth}
          height={160}
          spacing={spacingFor(prices.length)}
          initialSpacing={12}
          noOfSections={4}
          yAxisLabelPrefix="₹"
          yAxisOffset={Math.max(0, Math.floor(Math.min(...prices.map((p) => p.price)) - 5))}
          xAxisLabelTextStyle={styles.axis}
          yAxisTextStyle={styles.axis}
        />
      </Card>

      <Card title="Recent trips">
        {trips.length === 0 ? (
          <Text style={styles.muted}>Trips are recorded while the app tracks your drive.</Text>
        ) : (
          trips.map((t) => {
            const s = tripSummary({ startedAt: t.startedAt, endedAt: t.endedAt, distanceKm: t.distanceKm, stops: t.stops, kmPerUnit, pricePerUnit: lastPrice });
            return (
              <View key={t.id} style={styles.trip}>
                <Text style={styles.tripTitle}>
                  {new Date(t.startedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })} ·{' '}
                  {s.distanceKm.toFixed(1)} km
                </Text>
                <Text style={styles.muted}>
                  {Math.floor(s.durationMin / 60)} h {Math.round(s.durationMin % 60)} min · ≈ {s.estFuel.toFixed(1)} {unit} · {formatInr(s.estCost)} · {s.stops} stop
                  {s.stops === 1 ? '' : 's'}
                </Text>
              </View>
            );
          })
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing(4), gap: spacing(3), paddingBottom: spacing(12) },
  stats: { flexDirection: 'row', gap: spacing(3) },
  muted: { color: colors.textMuted, fontSize: 13 },
  axis: { color: colors.textMuted, fontSize: 10 },
  legend: { color: colors.textMuted, fontSize: 12, marginTop: spacing(2) },
  trip: { paddingVertical: spacing(2), borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tripTitle: { fontWeight: '700', color: colors.text },
});
