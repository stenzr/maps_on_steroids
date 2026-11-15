import { useEffect } from 'react';
import { AppState } from 'react-native';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { configureNotifications, listenForNotificationTaps } from '@/services/notifications/notifications';
import { runReminders } from '@/services/reminders/reminderService';
import { useGarage } from '@/state/garageStore';
import { useSettings } from '@/state/settingsStore';

export default function RootLayout() {
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    (async () => {
      await Promise.all([useSettings.getState().hydrate(), useGarage.getState().reload()]);
      await configureNotifications().catch((e: unknown) => console.warn('Notification setup failed', e));
      unlisten = listenForNotificationTaps((url) => router.push(url as never));
      await runReminders().catch(() => undefined);
    })();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        useGarage.getState().recompute();
        void runReminders().catch(() => undefined);
      }
    });
    return () => {
      sub.remove();
      unlisten?.();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="fuel/edit" options={{ title: 'Add fuel', presentation: 'modal' }} />
        <Stack.Screen name="fuel-level" options={{ title: 'Fuel level', presentation: 'modal' }} />
        <Stack.Screen name="route-preview" options={{ title: 'Route' }} />
        <Stack.Screen name="vehicles/index" options={{ title: 'Vehicles' }} />
        <Stack.Screen name="vehicles/edit" options={{ title: 'Vehicle' }} />
      </Stack>
    </SafeAreaProvider>
  );
}
