import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { formatRange, fuelUnit } from '@roadtrip/core';
import { FuelGaugeSlider } from '@/components/fuel/FuelGaugeSlider';
import { Button } from '@/components/ui/primitives';
import { useGarage } from '@/state/garageStore';
import { colors, spacing } from '@/theme';

/** Manual fuel-gauge correction (E → F). Re-syncs with the odometer at the next fuel log. */
export default function FuelLevelScreen() {
  const vehicle = useGarage((s) => s.active);
  const range = useGarage((s) => s.range);
  const correctFuel = useGarage((s) => s.correctFuel);
  const [value, setValue] = useState(range?.fuel.fraction ?? 0.5);
  const [saving, setSaving] = useState(false);

  if (!vehicle) {
    return (
      <View style={styles.root}>
        <Text style={styles.help}>Add a vehicle first.</Text>
      </View>
    );
  }
  const unit = fuelUnit(vehicle.fuelType);
  const qty = value * vehicle.tankCapacity;
  const km = range ? qty * range.kmPerUnit : null;

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await correctFuel(value);
      router.back();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Fuel level' }} />
      <Text style={styles.help}>Set the needle to match your fuel gauge. Range and refuel suggestions update straight away.</Text>
      <FuelGaugeSlider value={value} onChange={setValue} />
      <Text style={styles.big}>
        ≈ {qty.toFixed(1)} {unit} · {formatRange(km)}
      </Text>
      {range?.fuel.rawQuantity != null && range.fuel.rawQuantity < 0 && (
        <Text style={styles.warn}>The current estimate is below empty — a fill was probably not logged. Setting the gauge fixes it.</Text>
      )}
      <Button label="Save fuel level" onPress={() => void save()} loading={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: spacing(5), gap: spacing(5), backgroundColor: colors.surface },
  help: { color: colors.textMuted, fontSize: 15, lineHeight: 21 },
  big: { fontSize: 20, fontWeight: '800', color: colors.text, textAlign: 'center' },
  warn: { color: colors.warning, fontSize: 14 },
});
