import type { ExpoConfig } from 'expo/config';

/**
 * Build-time config. Keys come from the environment (apps/mobile/.env, never committed):
 *   ANDROID_MAPS_API_KEY – Maps SDK for Android key, restricted to this package + SHA-1.
 *   EXPO_PUBLIC_PROXY_URL / EXPO_PUBLIC_PROXY_SECRET – read at runtime by src/config/env.ts.
 */
const androidMapsKey = process.env.ANDROID_MAPS_API_KEY ?? '';

const config: ExpoConfig = {
  name: 'RoadTrip Companion',
  slug: 'roadtrip-companion',
  scheme: 'roadtrip',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  android: {
    package: 'com.roadtripcompanion.app',
    adaptiveIcon: {
      backgroundColor: '#0B5FFF',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
  },
  ios: {
    // iOS comes later; kept so the same codebase builds there.
    bundleIdentifier: 'com.roadtripcompanion.app',
    supportsTablet: false,
  },
  plugins: [
    'expo-router',
    ['react-native-maps', { androidGoogleMapsApiKey: androidMapsKey }],
    [
      'expo-location',
      {
        locationWhenInUsePermission:
          'RoadTrip Companion uses your location to show where you are and which way you are heading on the map.',
        // Background tracking (trip distance, refuel prompts) is enabled in milestone 4.
        isAndroidBackgroundLocationEnabled: false,
      },
    ],
  ],
  experiments: { typedRoutes: true },
};

export default config;
