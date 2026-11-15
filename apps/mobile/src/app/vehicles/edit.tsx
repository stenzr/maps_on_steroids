import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { DEFAULT_RESERVE_FRACTION, fuelUnit, type FuelType, type VehicleType } from '@roadtrip/core';
import { Segmented } from '@/components/ui/Segmented';
import { Button, Field } from '@/components/ui/primitives';
import { deleteVehicle, saveVehicle } from '@/db/repositories';
import { useGarage } from '@/state/garageStore';
import { colors, spacing } from '@/theme';

const FUEL_OPTIONS: { value: FuelType; label: string }[] = [
  { value: 'petrol', label: 'Petrol' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'cng', label: 'CNG' },
];
const TYPE_OPTIONS: { value: VehicleType; label: string }[] = [
  { value: 'car', label: 'Car' },
  { value: 'two-wheeler', label: 'Two-wheeler' },
];

export default function VehicleEditScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useGarage((s) => s.vehicles.find((v) => v.id === id));
  const reload = useGarage((s) => s.reload);

  const [name, setName] = useState(existing?.name ?? '');
  const [vehicleType, setVehicleType] = useState<VehicleType>(existing?.vehicleType ?? 'car');
  const [fuelType, setFuelType] = useState<FuelType>(existing?.fuelType ?? 'petrol');
  const [tank, setTank] = useState(existing ? String(existing.tankCapacity) : '');
  const [reservePct, setReservePct] = useState(String(Math.round((existing?.reserveFraction ?? DEFAULT_RESERVE_FRACTION) * 100)));
  const [claimed, setClaimed] = useState(existing?.claimedKmPerUnit ? String(existing.claimedKmPerUnit) : '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const unit = fuelUnit(fuelType);

  const save = async (): Promise<void> => {
    const e: Record<string, string> = {};
    const tankN = Number(tank);
    const reserveN = Number(reservePct);
    const claimedN = claimed.trim() ? Number(claimed) : null;
    if (!name.trim()) e.name = 'Give it a name, e.g. "Swift" or "Activa".';
    if (!(tankN > 0 && tankN < 200)) e.tank = `Enter the tank size in ${unit}.`;
    if (!(reserveN >= 5 && reserveN <= 40)) e.reserve = 'Between 5% and 40%.';
    if (claimedN !== null && !(claimedN > 0 && claimedN < 150)) e.claimed = 'Leave blank or enter a realistic value.';
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      await saveVehicle({
        id: existing?.id,
        name: name.trim(),
        vehicleType,
        fuelType,
        tankCapacity: tankN,
        reserveFraction: reserveN / 100,
        claimedKmPerUnit: claimedN,
      });
      await reload();
      router.back();
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Unknown error');
    }
  };

  const remove = (): void => {
    if (!existing) return;
    Alert.alert(`Delete ${existing.name}?`, 'Its fuel log is kept but hidden.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          await deleteVehicle(existing.id);
          await reload();
          router.back();
        },
      },
    ]);
  };

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: existing ? 'Edit vehicle' : 'Add vehicle' }} />
      <Field label="Name" value={name} onChangeText={setName} placeholder="e.g. Swift" error={errors.name} />
      <Text style={styles.label}>Type</Text>
      <Segmented options={TYPE_OPTIONS} value={vehicleType} onChange={setVehicleType} />
      <Text style={[styles.label, styles.mt]}>Fuel</Text>
      <Segmented options={FUEL_OPTIONS} value={fuelType} onChange={setFuelType} />
      <Field label={`Tank capacity (${unit})`} value={tank} onChangeText={setTank} keyboardType="decimal-pad" error={errors.tank} style={styles.mt} />
      <Field label="Reserve warning (%)" value={reservePct} onChangeText={setReservePct} keyboardType="number-pad" hint="Default 15% of the tank" error={errors.reserve} />
      <Field
        label={`Claimed mileage (km/${unit}, optional)`}
        value={claimed}
        onChangeText={setClaimed}
        keyboardType="decimal-pad"
        hint="Used as a starting estimate until you've logged two full tanks"
        error={errors.claimed}
      />
      <Button label="Save" onPress={() => void save()} />
      {existing ? <Button variant="danger" label="Delete vehicle" onPress={remove} style={styles.mt} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing(4), backgroundColor: colors.surface, paddingBottom: spacing(12) },
  label: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: spacing(1) },
  mt: { marginTop: spacing(3) },
});
