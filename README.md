# RoadTrip Companion

A Google Maps–based companion for road trips in India: a direction-of-travel arrow on your live location, fuel and mileage tracking, range-aware petrol pump suggestions, and restrooms and restaurants along your route. Units are km, litres and ₹.

Android first. The codebase is React Native (Expo) and also builds for iOS later. Android Auto and CarPlay screens come in a later milestone.

## Layout

```
packages/core   Pure TypeScript domain logic (geo, heading, tracking, simulator). No React, no network. Jest tests.
apps/proxy      Fastify proxy for Google Routes API + Places API (New). Holds the server API key.
apps/mobile     Expo / React Native app (expo-router, react-native-maps with Google provider).
```

## Status

| Milestone | Scope | State |
|---|---|---|
| 1 | Setup, live map, heading arrow, breadcrumb trail, test mode | ✅ done |
| 2 | Vehicles, fuel log, mileage, range | next |
| 3 | Routing, along-route search, fuel stops, re-routing | |
| 4 | Refuel detection, reminders, background location | |
| 5 | Analytics, CSV export, full setup guide | |
| 6 | Android Auto / CarPlay screens | |

## Prerequisites (Android)

- Node 20+ (tested on Node 24).
- **Android Studio** (includes JDK 17 and the Android SDK). In the SDK Manager install a recent Android SDK Platform and Platform-Tools.
  Add to your shell profile:
  ```sh
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  export PATH="$ANDROID_HOME/platform-tools:$PATH"
  ```
- An Android phone with **Developer options → USB debugging** turned on, connected over USB (`adb devices` should list it).

Expo Go is not enough: the app uses a custom Google Maps key, and later background location, so it runs as a **development build**.

## Google Cloud setup

1. Create a project in Google Cloud Console and enable billing.
2. Enable these APIs: **Maps SDK for Android**, **Routes API** and **Places API (New)**.
3. Create **two** API keys:
   - **App key** (goes into the app): restrict to *Android apps* with package `com.roadtripcompanion.app` and your SHA-1 (see below), and to the API *Maps SDK for Android* only.
   - **Server key** (proxy only, never in the app): restrict to the APIs *Routes API* and *Places API (New)*.
4. Debug SHA-1: after the first `npx expo run:android`, run
   `keytool -list -v -keystore apps/mobile/android/app/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA1`

## Run it

```sh
npm install                       # from the repo root (installs all workspaces)

# Proxy
cp apps/proxy/.env.example apps/proxy/.env     # fill in GOOGLE_MAPS_API_KEY and PROXY_SHARED_SECRET
npm run dev -w @roadtrip/proxy                 # http://localhost:8787/health

# App
cp apps/mobile/.env.example apps/mobile/.env   # fill in ANDROID_MAPS_API_KEY, proxy URL + secret
cd apps/mobile && npx expo run:android         # builds the dev client and installs it on the phone
```

After the first native build, `npx expo start` is enough for JS-only changes.

## Try milestone 1

- **Real GPS:** open the app and allow location. Once you've moved about 30 m, a blue arrow shows your direction of travel, with a fading trail of the last ~500 m behind it. When you stop, the arrow freezes and turns grey instead of spinning.
- **Test mode (no driving needed):** Settings → *Simulate a drive: Pune → Nashik*. It replays a drive along NH60 with GPS noise and a 4-minute stop near Chakan (~25 km). Pick a playback speed of 1×, 5× or 20×. The chip at the top-left shows heading, source, speed, accuracy and distance.
- **Settings:** heading window D (10/30/50/100 m), and heading-up or north-up map. *Re-centre* appears after you pan the map.

Milestone 1 limits: settings aren't saved yet (that comes with SQLite in milestone 2); tracking pauses when the app is in the background (milestone 4); the Pune → Nashik test path is hand-placed waypoints, so it's only roughly on the road until milestone 3 swaps in the real Routes API polyline.

## Checks

```sh
npm run check      # typecheck + ESLint + all Jest tests
```

## How the heading arrow works

`packages/core/src/heading/headingEstimator.ts`:

1. Discard fixes with accuracy worse than 20 m and jumps that would need more than ~250 km/h.
2. **Trend bearing**: great-circle initial bearing from the most recent buffered fix at least D metres behind to the current fix.
3. Above 15 km/h, blend with the GPS course when it's valid (circular weighted mean).
4. Smooth with an exponential filter on the sin/cos components, so 359° → 1° stays at north.
5. **Freeze** when speed is below 1.5 m/s, or when you've moved less than min(D, 15 m) in the last 10 s. The 15 m cap stops a 100 m window from freezing the arrow below 36 km/h.

## Secrets

`.env` files are git-ignored; only `.env.example` files are committed. The proxy secret (`EXPO_PUBLIC_PROXY_SECRET`) ships inside the app, so it only keeps strangers off your proxy. The real protection for the Google server key is that it never leaves the proxy.
