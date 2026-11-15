import { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { fuelUnit, matchStation, pricePerUnit, validateFuelLog } from '@roadtrip/core';
import { Button, Field, formatDate, ToggleRow } from '@/components/ui/primitives';
import { deleteFuelLog, saveFuelLog } from '@/db/repositories';
import { api } from '@/services/api/proxyClient';
import { useGarage } from '@/state/garageStore';
import { useTracking } from '@/state/trackingStore';
import { colors, radius, spacing } from '@/theme';

type Params = { id?: string; quick?: string; stationName?: string; stationPlaceId?: string; filledAt?: string };

const num = (s: string): number => (s.trim() === '' ? NaN : Number(s.replace(/,/g, '')));

export default function FuelEditScreen() {
  const params = useLocalSearchParams<Params>();
  const vehicle = useGarage((s) => s.active);
  const logs = useGarage((s) => s.logs);
  const estOdometer = useGarage((s) => s.estOdometer);
  const reload = useGarage((s) => s.reload);
  const existing = params.id ? logs.find((l) => l.id === params.id) : undefined;
  const quick = params.quick === '1' && !existing;

  const [filledAt, setFilledAt] = useState<number>(existing?.filledAt ?? (params.filledAt ? Number(params.filledAt) : Date.now()));
  const [odometer, setOdometer] = useState(existing ? String(existing.odometerKm) : estOdometer !== null ? String(estOdometer) : '');
  const [odometerTouched, setOdometerTouched] = useState(!!existing);
  const [quantity, setQuantity] = useState(existing ? String(existing.quantity) : '');
  const [amount, setAmount] = useState(existing ? String(existing.totalCost) : '');
  const [price, setPrice] = useState(existing ? String(existing.pricePerUnit) : '');
  const [priceEdited, setPriceEdited] = useState(!!existing);
  const [full, setFull] = useState(existing?.isFullTank ?? true);
  const [missed, setMissed] = useState(existing?.missedPrevious ?? false);
  const [stationName, setStationName] = useState(existing?.stationName ?? params.stationName ?? '');
  const [stationPlaceId, setStationPlaceId] = useState<string | null>(existing?.stationPlaceId ?? params.stationPlaceId ?? null);
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [more, setMore] = useState(!quick);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const unit = vehicle ? fuelUnit(vehicle.fuelType) : 'L';

  // Price per unit = amount ÷ quantity, unless the user typed their own.
  useEffect(() => {
    if (priceEdited) return;
    const p = pricePerUnit(num(amount), num(quantity));
    setPrice(p === null ? '' : p.toFixed(2));
  }, [amount, quantity, priceEdited]);

  // New entry without a station: if we're at a petrol pump right now, fill it in.
  useEffect(() => {
    if (existing || stationName) return;
    const pos = useTracking.getState().tracking.position;
    if (!pos) return;
    let cancelled = false;
    api
      .nearbyFuel({ latitude: pos.latitude, longitude: pos.longitude, radiusM: 100, maxResults: 5 })
      .then((places) => {
        const m = matchStation(pos, places);
        if (!cancelled && m) {
          setStationName((cur) => cur || m.name);
          setStationPlaceId(m.placeId);
        }
      })
      .catch(() => undefined); // offline: just leave it blank
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pickDateTime = (): void => {
    if (Platform.OS !== 'android') return;
    DateTimePickerAndroid.open({
      value: new Date(filledAt),
      mode: 'date',
      maximumDate: new Date(),
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        DateTimePickerAndroid.open({
          value: d,
          mode: 'time',
          is24Hour: true,
          onChange: (e2, t) => {
            if (e2.type === 'set' && t) setFilledAt(Math.min(Date.now(), t.getTime()));
          },
        });
      },
    });
  };

  const draft = useMemo(
    () => ({
      id: existing?.id,
      filledAt,
      odometerKm: num(odometer),
      quantity: num(quantity),
      totalCost: num(amount),
      pricePerUnit: num(price),
      isFullTank: full,
      missedPrevious: missed,
    }),
    [existing?.id, filledAt, odometer, quantity, amount, price, full, missed],
  );

  if (!vehicle) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Add fuel' }} />
        <Text style={styles.help}>Add your vehicle first, so mileage and range can be worked out.</Text>
        <Button label="Add vehicle" onPress={() => router.replace('/vehicles/edit')} />
      </View>
    );
  }

  const doSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await saveFuelLog({
        id: existing?.id,
        vehicleId: vehicle.id,
        filledAt: draft.filledAt,
        odometerKm: draft.odometerKm,
        odometerEstimated: !odometerTouched && !existing,
        quantity: draft.quantity,
        totalCost: draft.totalCost,
        pricePerUnit: Number.isFinite(draft.pricePerUnit) ? draft.pricePerUnit : (pricePerUnit(draft.totalCost, draft.quantity) ?? 0),
        isFullTank: full,
        missedPrevious: missed,
        stationName: stationName.trim() || null,
        stationPlaceId: stationName.trim() ? stationPlaceId : null,
        notes: notes.trim() || null,
      });
      await reload();
      router.back();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const onSave = (): void => {
    const v = validateFuelLog(
      { ...draft, pricePerUnit: Number.isFinite(draft.pricePerUnit) ? draft.pricePerUnit : (pricePerUnit(draft.totalCost, draft.quantity) ?? 0) },
      logs,
      vehicle,
    );
    // Quick log: an empty odometer with no estimate is the only thing we can't infer.
    const errs = v.errors.map((e) =>
      quick && e.startsWith('Enter the odometer') ? 'No odometer estimate yet — enter the odometer reading for this fill.' : e,
    );
    setErrors(errs);
    if (errs.length) return;
    if (v.warnings.length) {
      Alert.alert('Please check', v.warnings.map((w) => `• ${w.message}`).join('\n\n'), [
        { text: 'Edit', style: 'cancel' },
        { text: 'Save anyway', onPress: () => void doSave() },
      ]);
      return;
    }
    void doSave();
  };

  const onDelete = (): void => {
    if (!existing) return;
    Alert.alert('Delete this entry?', 'Mileage and range will be recalculated.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteFuelLog(existing.id);
          await reload();
          router.back();
        },
      },
    ]);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: existing ? 'Edit fuel entry' : 'Add fuel' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.row}>
          <View style={styles.flex}>
            <Field label={`${unit === 'kg' ? 'Kilograms' : 'Litres'} *`} value={quantity} onChangeText={setQuantity} keyboardType="decimal-pad" placeholder="e.g. 32.5" autoFocus={quick} />
          </View>
          <View style={styles.flex}>
            <Field label="Amount (₹) *" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="e.g. 3400" />
          </View>
        </View>
        <Field
          label={`Price per ${unit === 'kg' ? 'kg' : 'litre'} (₹)`}
          value={price}
          onChangeText={(t) => {
            setPrice(t);
            setPriceEdited(true);
          }}
          keyboardType="decimal-pad"
          hint={priceEdited ? 'Edited by you' : 'Worked out from amount ÷ quantity'}
        />
        <Field
          label="Odometer (km)"
          value={odometer}
          onChangeText={(t) => {
            setOdometer(t);
            setOdometerTouched(true);
          }}
          keyboardType="number-pad"
          hint={!odometerTouched && estOdometer !== null ? 'Suggested from GPS distance since your last fill — correct it if you can' : undefined}
        />
        <ToggleRow label="Filled to full tank" hint="Mileage is measured between full-tank fills" value={full} onChange={setFull} />

        <Pressable onPress={pickDateTime} style={styles.dateRow} accessibilityRole="button" accessibilityLabel="Change date and time">
          <Text style={styles.label}>Date & time</Text>
          <Text style={styles.dateValue}>{formatDate(filledAt)} ›</Text>
        </Pressable>
        <Field label="Station" value={stationName} onChangeText={(t) => { setStationName(t); setStationPlaceId(null); }} placeholder="e.g. HP, Chakan" />

        {more ? (
          <>
            <ToggleRow
              label="I missed logging a fill before this"
              hint="Leaves this stretch out of the mileage average so it isn't skewed"
              value={missed}
              onChange={setMissed}
            />
            <Field label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Optional" />
          </>
        ) : (
          <Button variant="ghost" label="More details" onPress={() => setMore(true)} />
        )}

        {errors.length > 0 && (
          <View style={styles.errors} accessibilityRole="alert">
            {errors.map((e) => (
              <Text key={e} style={styles.errorText}>
                {e}
              </Text>
            ))}
          </View>
        )}
        <Button label="Save" onPress={onSave} loading={saving} />
        {existing ? <Button variant="danger" label="Delete entry" onPress={onDelete} style={styles.mt} /> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: spacing(4), paddingBottom: spacing(12), backgroundColor: colors.surface },
  row: { flexDirection: 'row', gap: spacing(3) },
  dateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing(3),
    marginVertical: spacing(3),
  },
  label: { fontSize: 15, fontWeight: '600', color: colors.text },
  dateValue: { fontSize: 15, color: colors.primary, fontWeight: '600' },
  errors: { backgroundColor: '#FEF3F2', borderRadius: radius.md, padding: spacing(3), marginBottom: spacing(3), gap: spacing(1) },
  errorText: { color: colors.danger },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing(6), gap: spacing(4) },
  help: { color: colors.textMuted, textAlign: 'center', fontSize: 15 },
  mt: { marginTop: spacing(3) },
});
