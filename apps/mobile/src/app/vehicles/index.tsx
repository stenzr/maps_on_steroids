import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { fuelUnit } from '@roadtrip/core';
import { Button, EmptyState } from '@/components/ui/primitives';
import { setActiveVehicle } from '@/db/repositories';
import { useGarage } from '@/state/garageStore';
import { colors, radius, spacing } from '@/theme';

export default function VehiclesScreen() {
  const vehicles = useGarage((s) => s.vehicles);
  const active = useGarage((s) => s.active);
  const reload = useGarage((s) => s.reload);

  return (
    <View style={styles.root}>
      <Stack.Screen options={{ title: 'Vehicles' }} />
      <FlatList
        contentContainerStyle={styles.content}
        data={vehicles}
        keyExtractor={(v) => v.id}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Pressable style={styles.flex} onPress={() => router.push(`/vehicles/edit?id=${item.id}`)} accessibilityRole="button">
              <Text style={styles.name}>
                {item.name} {item.id === active?.id ? '· Active' : ''}
              </Text>
              <Text style={styles.meta}>
                {item.vehicleType === 'car' ? 'Car' : 'Two-wheeler'} · {item.fuelType.toUpperCase()} · {item.tankCapacity} {fuelUnit(item.fuelType)} tank
              </Text>
            </Pressable>
            {item.id !== active?.id && (
              <Button
                compact
                variant="secondary"
                label="Make active"
                onPress={async () => {
                  await setActiveVehicle(item.id);
                  await reload();
                }}
              />
            )}
          </View>
        )}
        ListEmptyComponent={<EmptyState title="No vehicles" body="Add the car or bike you drive." />}
        ListFooterComponent={<Button label="＋ Add vehicle" onPress={() => router.push('/vehicles/edit')} style={styles.mt} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing(4) },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(3), backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing(4), marginBottom: spacing(2) },
  flex: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, marginTop: 2 },
  mt: { marginTop: spacing(3) },
});
