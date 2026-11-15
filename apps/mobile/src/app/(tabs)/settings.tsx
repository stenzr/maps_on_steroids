import { useState, type ReactNode } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { HEADING_WINDOW_OPTIONS_M, PUNE_NASHIK_WAYPOINTS } from '@roadtrip/core';
import { Segmented } from '@/components/ui/Segmented';
import { Button, ToggleRow } from '@/components/ui/primitives';
import { env } from '@/config/env';
import { hasBackgroundPermission, requestBackgroundPermission } from '@/services/location/backgroundSource';
import { ensureNotificationPermission } from '@/services/notifications/notifications';
import { useGarage } from '@/state/garageStore';
import { useRoute } from '@/state/routeStore';
import { useSettings, type CameraMode } from '@/state/settingsStore';
import { colors, radius, spacing } from '@/theme';

const WINDOW_OPTIONS = HEADING_WINDOW_OPTIONS_M.map((m) => ({ value: m as number, label: `${m} m` }));
const CAMERA_OPTIONS: { value: CameraMode; label: string }[] = [
  { value: 'heading-up', label: 'Heading up' },
  { value: 'north-up', label: 'North up' },
];
const SPEED_OPTIONS = [40, 70, 100].map((v) => ({ value: v, label: `${v} km/h` }));
const PLAYBACK_OPTIONS = [1, 5, 20].map((v) => ({ value: v, label: `${v}×` }));
const LOW_RANGE_OPTIONS = [40, 60, 80, 100].map((v) => ({ value: v, label: `${v} km` }));
const NO_LOG_OPTIONS = [7, 10, 14, 30].map((v) => ({ value: v, label: `${v} d` }));
const BREAK_OPTIONS = [1.5, 2, 3].map((v) => ({ value: v, label: `${v} h` }));

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const Label = ({ children, help }: { children: string; help?: string }) => (
  <>
    <Text style={[styles.label, styles.gap]}>{children}</Text>
    {help ? <Text style={styles.help}>{help}</Text> : null}
  </>
);

export default function SettingsScreen() {
  const s = useSettings();
  const vehicle = useGarage((g) => g.active);
  const [pinging, setPinging] = useState(false);

  const withNotifications = async (patch: Parameters<typeof s.update>[0]): Promise<void> => {
    s.update(patch);
    if (Object.values(patch).some((v) => v === true) && !(await ensureNotificationPermission())) {
      Alert.alert('Notifications are off', 'Allow notifications for RoadTrip Companion in system settings to get these alerts.', [
        { text: 'Later', style: 'cancel' },
        { text: 'Open settings', onPress: () => void Linking.openSettings() },
      ]);
    }
  };

  const toggleBackground = async (on: boolean): Promise<void> => {
    if (!on) return s.update({ backgroundTracking: false });
    if (await hasBackgroundPermission()) return s.update({ backgroundTracking: true });
    Alert.alert(
      'Allow location all the time?',
      'To count trip distance, update your range and ask "Did you refuel?" after a stop at a petrol pump — even with the screen off — RoadTrip Companion needs location "All the time".\n\n' +
        'A notification shows whenever tracking is on. Your location stays on this phone; only searches for places are sent to Google.\n\n' +
        'On the next screen choose "Allow all the time".',
      [
        { text: 'Not now', style: 'cancel' },
        {
          text: 'Continue',
          onPress: async () => {
            const granted = await requestBackgroundPermission().catch(() => false);
            if (granted) s.update({ backgroundTracking: true });
            else
              Alert.alert('Background location not allowed', 'Tracking will only run while the app is open. You can change this in system settings.', [
                { text: 'OK', style: 'cancel' },
                { text: 'Open settings', onPress: () => void Linking.openSettings() },
              ]);
          },
        },
      ],
    );
  };

  const ping = async (): Promise<void> => {
    setPinging(true);
    try {
      const res = await fetch(`${env.proxyUrl.replace(/\/$/, '')}/v1/ping`, { headers: { 'X-App-Secret': env.proxySecret } });
      Alert.alert(res.ok ? 'Connected' : 'Proxy error', res.ok ? 'The proxy accepted the app secret.' : `HTTP ${res.status}`);
    } catch {
      Alert.alert('Not reachable', `Could not reach ${env.proxyUrl || '(no proxy URL set)'}.`);
    } finally {
      setPinging(false);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Section title="Vehicle">
        <Text style={styles.help}>{vehicle ? `Active: ${vehicle.name}` : 'No vehicle yet.'}</Text>
        <Button variant="secondary" label="Manage vehicles" onPress={() => router.push('/vehicles')} />
      </Section>

      <Section title="Direction arrow">
        <Label help="The arrow points from where you were D metres ago to where you are now. Shorter reacts faster; longer is steadier.">Heading window (D)</Label>
        <Segmented options={WINDOW_OPTIONS} value={s.headingWindowM} onChange={s.setHeadingWindow} />
        <Label>Map orientation</Label>
        <Segmented options={CAMERA_OPTIONS} value={s.cameraMode} onChange={s.setCameraMode} />
        <ToggleRow label="Show GPS readout" hint="Heading, speed and accuracy chip on the map" value={s.showDebugChip} onChange={(v) => s.update({ showDebugChip: v })} />
      </Section>

      <Section title="Fuel and range">
        <Label help="With no route, show nearby open pumps once range drops below this.">Low-range threshold</Label>
        <Segmented options={LOW_RANGE_OPTIONS} value={s.lowRangeKm} onChange={(v) => s.update({ lowRangeKm: v })} />
        <ToggleRow
          label="Fuel alerts"
          hint="When range is under 2× the distance to the next suggested pump, and at reserve"
          value={s.fuelAlertsEnabled}
          onChange={(v) => void withNotifications({ fuelAlertsEnabled: v })}
        />
      </Section>

      <Section title="Prompts and reminders">
        <ToggleRow
          label="Ask to log after a petrol pump stop"
          hint="After 3+ minutes at a pump, then driving away"
          value={s.refuelPromptEnabled}
          onChange={(v) => void withNotifications({ refuelPromptEnabled: v })}
        />
        <ToggleRow label="Remind me if I haven't logged fuel" value={s.noLogReminderEnabled} onChange={(v) => void withNotifications({ noLogReminderEnabled: v })} />
        {s.noLogReminderEnabled && <Segmented options={NO_LOG_OPTIONS} value={s.noLogDays} onChange={(v) => s.update({ noLogDays: v })} />}
        <ToggleRow
          label="Warn when the fuel estimate is impossible"
          hint="Below empty usually means a fill wasn't logged"
          value={s.impossibleFuelReminderEnabled}
          onChange={(v) => void withNotifications({ impossibleFuelReminderEnabled: v })}
        />
        <ToggleRow
          label="Background trip tracking"
          hint="Keeps counting distance and detecting refuels with the screen off. Needs location “All the time”."
          value={s.backgroundTracking}
          onChange={(v) => void toggleBackground(v)}
        />
      </Section>

      <Section title="Along your route">
        <ToggleRow label="Break planner" hint="Suggest a stop with food and a restroom" value={s.breakPlannerEnabled} onChange={(v) => s.update({ breakPlannerEnabled: v })} />
        {s.breakPlannerEnabled && <Segmented options={BREAK_OPTIONS} value={s.breakEveryHours} onChange={(v) => s.update({ breakEveryHours: v })} />}
        <ToggleRow
          label="Include pumps with “restroom likely”"
          hint="Most highway petrol pumps have one even when Google has no data"
          value={s.includeLikelyRestrooms}
          onChange={(v) => s.update({ includeLikelyRestrooms: v })}
        />
      </Section>

      <Section title="Test mode">
        <ToggleRow
          label="Simulate a drive: Pune → Nashik"
          hint="Replaces GPS with a simulated drive along NH60 (GPS noise, a 4-minute stop near Chakan). Nothing is saved to your fuel log."
          value={s.testMode.enabled}
          onChange={(enabled) => s.setTestMode({ enabled })}
        />
        {s.testMode.enabled && (
          <>
            <Label>Cruise speed</Label>
            <Segmented options={SPEED_OPTIONS} value={s.testMode.speedKmh} onChange={(speedKmh) => s.setTestMode({ speedKmh })} />
            <Label>Playback speed</Label>
            <Segmented options={PLAYBACK_OPTIONS} value={s.testMode.playbackRate} onChange={(playbackRate) => s.setTestMode({ playbackRate })} />
            <Label help="Fetches the real Google route and drives the simulator along it, so the along-route panel, fuel stops and alerts can be tried at home.">
              Test route
            </Label>
            <Button
              variant="secondary"
              label="Plan Pune → Nashik"
              onPress={() => {
                const pune = PUNE_NASHIK_WAYPOINTS[0]!;
                const nashik = PUNE_NASHIK_WAYPOINTS[PUNE_NASHIK_WAYPOINTS.length - 1]!;
                void useRoute
                  .getState()
                  .setDestination({ name: 'Nashik', location: nashik, placeId: null }, { name: 'Pune', location: pune, placeId: null }, 'DRIVE');
                router.push('/route-preview');
              }}
            />
          </>
        )}
      </Section>

      <Section title="Units and connection">
        <Text style={styles.help}>Distance in km · money in ₹ · petrol/diesel in litres, CNG in kg.</Text>
        <Text style={[styles.help, styles.gap]}>Proxy: {env.proxyUrl || 'not set'}</Text>
        <Button variant="secondary" label="Test proxy connection" onPress={() => void ping()} loading={pinging} />
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { padding: spacing(4), gap: spacing(4), paddingBottom: spacing(12) },
  section: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing(4), gap: spacing(1) },
  sectionTitle: { fontSize: 18, fontWeight: '700', color: colors.text, marginBottom: spacing(2) },
  label: { fontSize: 15, fontWeight: '600', color: colors.text, marginBottom: spacing(1) },
  help: { fontSize: 13, color: colors.textMuted, marginBottom: spacing(2), lineHeight: 18 },
  gap: { marginTop: spacing(3) },
});
