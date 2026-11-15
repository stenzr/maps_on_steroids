import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { HEADING_WINDOW_OPTIONS_M } from '@roadtrip/core';
import { Segmented } from '@/components/ui/Segmented';
import { useSettings, type CameraMode } from '@/state/settingsStore';
import { colors, radius, spacing } from '@/theme';

const WINDOW_OPTIONS = HEADING_WINDOW_OPTIONS_M.map((m) => ({ value: m as number, label: `${m} m` }));
const CAMERA_OPTIONS: { value: CameraMode; label: string }[] = [
  { value: 'heading-up', label: 'Heading up' },
  { value: 'north-up', label: 'North up' },
];
const SPEED_OPTIONS = [40, 70, 100].map((v) => ({ value: v, label: `${v} km/h` }));
const PLAYBACK_OPTIONS = [1, 5, 20].map((v) => ({ value: v, label: `${v}×` }));

export default function SettingsScreen() {
  const s = useSettings();
  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Section title="Direction arrow">
        <Text style={styles.label}>Heading window (D)</Text>
        <Text style={styles.help}>
          The arrow points from where you were D metres ago to where you are now. Shorter reacts faster to turns; longer
          is steadier on bumpy GPS.
        </Text>
        <Segmented options={WINDOW_OPTIONS} value={s.headingWindowM} onChange={s.setHeadingWindow} />
        <Text style={[styles.label, styles.gap]}>Map orientation</Text>
        <Segmented options={CAMERA_OPTIONS} value={s.cameraMode} onChange={s.setCameraMode} />
      </Section>

      <Section title="Test mode">
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>Simulate a drive: Pune → Nashik</Text>
            <Text style={styles.help}>
              Replaces GPS with a simulated drive along NH60, with GPS noise and a 4-minute stop near Chakan.
            </Text>
          </View>
          <Switch value={s.testMode.enabled} onValueChange={(enabled) => s.setTestMode({ enabled })} />
        </View>
        {s.testMode.enabled && (
          <>
            <Text style={[styles.label, styles.gap]}>Cruise speed</Text>
            <Segmented options={SPEED_OPTIONS} value={s.testMode.speedKmh} onChange={(speedKmh) => s.setTestMode({ speedKmh })} />
            <Text style={[styles.label, styles.gap]}>Playback speed</Text>
            <Segmented
              options={PLAYBACK_OPTIONS}
              value={s.testMode.playbackRate}
              onChange={(playbackRate) => s.setTestMode({ playbackRate })}
            />
          </>
        )}
      </Section>

      <Text style={styles.footer}>Vehicle: car (default). Vehicles, fuel and alerts arrive in the next milestones.</Text>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing(4), gap: spacing(4) },
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing(4) },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing(3) },
  label: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: spacing(1) },
  help: { fontSize: 13, color: colors.textMuted, marginBottom: spacing(2), lineHeight: 18 },
  gap: { marginTop: spacing(4) },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing(3) },
  rowText: { flex: 1 },
  footer: { color: colors.textMuted, fontSize: 13, textAlign: 'center' },
});
