# RoadTrip Companion

A Google Maps–based companion for road trips in India. It adds what Google Maps lacks:

- **Direction-of-travel arrow** on your live location, based on your recent movement rather than the phone's compass, with a fading trail of where you just drove.
- **Fuel log and mileage** using the full-to-full method: latest, last-5 average and lifetime km/L.
- **Fuel remaining and range** ("≈ 210 km range"), tracked with GPS while you drive, with a manual E–F gauge to correct it.
- **Petrol pump suggestions** along your route. Stops are chosen so you always arrive above reserve, preferring pumps at 60–85% of your range with a short detour. With no route, it shows nearby pumps ahead of you.
- **Restrooms and restaurants along the route**, with filters, plus a break planner (a food + restroom stop every 2 h).
- **Refuel prompts.** After 3+ minutes at a petrol pump, followed by driving away: "Did you refuel at …? Log it." Also reminders and low-fuel alerts.
- **Analytics** (km/L over time, monthly spend, price per litre, cost per km, trips) and **CSV export**.
- **Android Auto** list screens: range, petrol, restrooms and food ahead.

Units are km, litres (kg for CNG) and ₹. Android comes first; the codebase is React Native (Expo), so iOS can follow.

> Setting up on a new machine, or with Claude Code? See **[SETUP.md](SETUP.md)** for the architecture diagrams and a step-by-step runbook with verification commands.

## Layout

```
packages/core   Pure TypeScript domain logic — no React, no network. All the maths lives here, with Jest tests.
  geo/          great-circle distance & bearing, polyline codec, path helpers
  heading/      heading estimator (trend bearing, GPS-course blend, sin/cos smoothing, stationary freeze)
  tracking/     fix gate (accuracy/jump filter), jitter-free distance, breadcrumb trail, pipeline
  fuel/         mileage (full-to-full), validation & outliers, fuel-level estimate, range
  route/        route geometry & projection, along-route ranking, detour, Google Maps deep link
  stops/        fuel stop planner, nearby ranking by heading, alerts, restaurant/restroom filters, break planner
  refuel/       dwell detector (refuel prompts), reminders
  analytics/    series & summaries, CSV export
  sim/          seeded drive simulator + Pune → Nashik fixture (test mode)
apps/proxy      Fastify proxy for Google Routes API + Places API (New). Holds the server key.
apps/mobile     Expo / React Native app (expo-router, react-native-maps with the Google provider,
                expo-sqlite, expo-location + task manager, expo-notifications, Android Auto)
```

## 1. Google Cloud setup

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and **enable billing**. Google Maps Platform needs a billing account, and there is a monthly free usage tier.
2. **Enable these APIs** (APIs & Services → Library):
   - **Maps SDK for Android** (the map inside the app)
   - **Routes API** (routes and re-routing through stops)
   - **Places API (New)** (search along route, nearby petrol pumps, destination search)
3. **Create two API keys** (APIs & Services → Credentials):

   | Key | Used by | Application restriction | API restriction |
   |---|---|---|---|
   | App key | `apps/mobile/.env` → `ANDROID_MAPS_API_KEY` | **Android apps**: package `com.roadtripcompanion.app` + your SHA-1 | Maps SDK for Android |
   | Server key | `apps/proxy/.env` → `GOOGLE_MAPS_API_KEY` | None, or IP addresses if your host has a fixed egress IP | Routes API, Places API (New) |

   Never put the server key in the app.
4. **SHA-1 for the app key.** After the first native build:
   ```sh
   keytool -list -v -keystore apps/mobile/android/app/debug.keystore -alias androiddebugkey -storepass android -keypass android | grep SHA1
   ```
   Add your release keystore's SHA-1 too when you make release builds.
5. Optionally set **quotas and budget alerts** on the project (Billing → Budgets & alerts).

**What gets called, and roughly how often.** Each call sends only the fields it needs (field masks).
- **Route:** one Routes API call per destination or added stop. Identical requests are cached for the session in the app, and for 10 minutes on the proxy.
- **Along-route search:** one Places Text Search per 100 km window per tab, refreshed after ~30 km of driving. Restaurant and restroom fields (`servesVegetarianFood`, `restroom`, `fuelOptions`) are only requested by the tabs that use them, because they bill in a higher tier.
- **Refuel detection:** one Nearby Search per stop of 3+ minutes.
- **Destination search:** one Text Search per submit, not per keystroke.

## 2. Run the proxy

```sh
npm install                                     # from the repo root (all workspaces)
cp apps/proxy/.env.example apps/proxy/.env      # GOOGLE_MAPS_API_KEY, PROXY_SHARED_SECRET (openssl rand -hex 32)
npm run dev -w @roadtrip/proxy                  # http://localhost:8787/health
```

Endpoints (all except `/health` need the `X-App-Secret` header):

| Endpoint | Google API |
|---|---|
| `POST /v1/route` | Routes API `computeRoutes` (DRIVE or TWO_WHEELER, traffic-aware, intermediates by place ID) |
| `POST /v1/along-route` | Places Text Search with `searchAlongRouteParameters` + `routingSummaries` (detour) |
| `POST /v1/nearby-fuel` | Places Nearby Search, `gas_station`, ranked by distance |
| `POST /v1/destinations` | Places Text Search for the destination bar |

**For road trips, deploy it** so your phone can reach it over mobile data. For example, on Cloud Run (`$PROJECT` is your Google Cloud project ID):
```sh
gcloud builds submit --tag gcr.io/$PROJECT/roadtrip-proxy -f apps/proxy/Dockerfile .   # build from the repo root
# Store the key and secret in Secret Manager as roadtrip-maps-key / roadtrip-proxy-secret, then:
gcloud run deploy roadtrip-proxy --image gcr.io/$PROJECT/roadtrip-proxy --region asia-south1 \
  --allow-unauthenticated --set-secrets GOOGLE_MAPS_API_KEY=roadtrip-maps-key:latest,PROXY_SHARED_SECRET=roadtrip-proxy-secret:latest
```
Then set `EXPO_PUBLIC_PROXY_URL` to the Cloud Run URL. The proxy rate-limits each client IP and returns clear JSON errors, for example "Google rejected the server API key".

## 3. Run the app on an Android phone

Prerequisites:
- **Android Studio**, which includes JDK 17 and the Android SDK. In the SDK Manager, install a recent SDK Platform and Platform-Tools, then add to your shell profile:
  ```sh
  export ANDROID_HOME="$HOME/Library/Android/sdk"
  export PATH="$ANDROID_HOME/platform-tools:$PATH"
  ```
- A phone with **Developer options → USB debugging** on, connected over USB. `adb devices` should list it.

```sh
cp apps/mobile/.env.example apps/mobile/.env    # ANDROID_MAPS_API_KEY, EXPO_PUBLIC_PROXY_URL, EXPO_PUBLIC_PROXY_SECRET
cd apps/mobile
npx expo run:android                            # builds the development app and installs it
```

After the first native build, `npx expo start` is enough for JavaScript changes. Expo Go is **not** enough, because the app uses a custom Maps key, background location and Android Auto.

**Local proxy over Wi-Fi:** use your laptop's LAN IP (e.g. `http://192.168.1.20:8787`). Android blocks plain `http://` by default except in debug builds, so use HTTPS (e.g. Cloud Run) for release builds. Settings → *Test proxy connection* checks the URL and secret.

## 4. Try it

1. **Add your vehicle** (Settings → Manage vehicles, or the prompt on the map): name, car or two-wheeler, petrol/diesel/CNG, tank size, reserve % (default 15), and claimed km/L if you know it.
2. **Log fuel** with the **＋ Add fuel** button. Litres and amount are enough. Price per litre is worked out for you, the odometer is suggested from GPS distance, and the station is filled in if you're at a pump. Mark full-tank fills; mileage appears after two full tanks in a row.
3. **Range** shows on the map ("≈ 210 km range"). Tap it to set the fuel gauge by hand.
4. **Plan a trip:** type a destination in the top bar to open the route preview, with distance, time, estimated fuel cost, suggested fuel stops and break suggestions. **Start** shows the *Along route* panel: Restrooms, Restaurants (with filters) and Petrol. Each item shows km ahead, detour minutes, rating and open/closed, plus **Add stop**, which re-routes. **Navigate in Google Maps** hands turn-by-turn navigation to Google Maps, with your stops as waypoints.
5. **Background tracking** (Settings → *Background trip tracking*) needs location "Allow all the time". It counts trip distance and runs refuel detection with the screen off. A persistent notification shows while it runs.

### Test mode (no driving needed)

Settings → **Test mode → Simulate a drive: Pune → Nashik**. GPS is replaced by a simulated drive with GPS noise and a 4-minute stop about 25 km in, near Chakan. Choose cruise speed (40/70/100 km/h) and playback speed (1×/5×/20×).

- Tap **Plan Pune → Nashik** to fetch the real Google route and drive the simulator along it. Then tap **Start**: the along-route panel, fuel stop plan, fuel alerts and the "Did you refuel?" prompt after the Chakan stop all work at home.
- Nothing from test mode is saved to your fuel log or trips. Prompts are labelled "(test)".

## 5. Android Auto

The app is an Android Auto **points-of-interest app** (category `poi`). It uses template screens drawn by the car, made with [`@iternio/react-native-auto-play`](https://github.com/Iternio-Planning-AB/react-native-auto-play):
- The **home screen** shows range and fuel %, the next suggested pump, and *Petrol / Restrooms / Food ahead* (while a route is active) or *Petrol pumps nearby* (when there isn't one).
- **Tapping a place** adds it as a stop and opens Google Maps navigation, which Android Auto shows on the car screen.
- Lists carry the "Results from Google Maps" attribution that Google requires when showing Places content without a Google map.

To test without a car, use Google's **Desktop Head Unit**:
1. In the Android Auto app settings on the phone, tap *Version* 10× to unlock developer settings, then turn on **Unknown sources**. This is required for apps not installed from the Play Store.
2. Install the DHU (Android Studio → SDK Manager → SDK Tools → *Android Auto Desktop Head Unit Emulator*).
3. In Android Auto's developer menu, choose *Start head unit server*. Then run `adb forward tcp:5277 tcp:5277` and `$ANDROID_HOME/extras/google/auto/desktop-head-unit`.

**CarPlay (iOS) is not set up yet.** It needs the CarPlay *fueling* entitlement from Apple (paid Apple Developer Program, by request) and Xcode 27+.

## Checks

```sh
npm run check      # typecheck + ESLint + all Jest tests (core + proxy)
```

## How the main parts work

**Heading arrow** (`packages/core/src/heading/headingEstimator.ts`):
1. Discard fixes worse than 20 m accuracy, and jumps that would need more than ~250 km/h.
2. **Trend bearing:** great-circle initial bearing from the most recent fix at least D m behind (D = 10/30/50/100 m, default 30) to the current fix.
3. Above 15 km/h, blend with a valid GPS course (circular weighted mean).
4. Smooth on sin/cos components, so 359° → 1° stays at north.
5. **Freeze** when speed is below 1.5 m/s, or when you've moved less than min(D, 15 m) in the last 10 s. The 15 m cap stops a 100 m window from freezing the arrow below 36 km/h.

**Mileage:** km/L = (odometer at a full fill − odometer at the previous full fill) ÷ all fuel added after the previous full fill, up to and including this one. Partial fills count toward the fuel. A period with a fill marked *"I missed logging a fill before this"* is left out. A full fill more than 40% off your rolling average asks you to confirm.

**Fuel remaining:**
- A full fill sets the tank to capacity. A partial fill adds to the previous estimate, capped at capacity.
- Between two fills, fuel used comes from the odometer difference, which re-syncs the estimate at every log. After the last fill (or a manual gauge correction), GPS distance is used.
- GPS distance ignores fixes worse than 25 m and impossible jumps, and only counts movement greater than the accuracy radius, so a parked phone adds nothing.

**Fuel stops:** stations along the route are projected onto the route polyline to get km ahead along the road. Detour = (here → pump → end) − (here → end), from Google's routing summaries, or estimated from the distance off the route when those aren't returned. A stop is never planned past the point where you'd drop below reserve; long trips get several stops. You get one alert when range drops below 2× the distance to the next suggested pump, and one at reserve.

**Refuel prompts:** GPS alone detects a stay within 60 m for more than 3 minutes. Only then is one Nearby Search made to find the pump. When you drive 150 m away, a notification opens the fuel form with date, time and station filled in. Each stop prompts at most once.

## Data, privacy and Google's terms

- Everything (vehicles, fuel log, trips, distance, settings) stays in SQLite on the phone. Tables use UUID keys with `created_at` / `updated_at` / `deleted_at`, ready for sync later.
- Google Places content (names, ratings, prices) is kept in memory for the session only. Only `place_id` is stored, plus the station name you logged with a fill, which is your own record.
- Google data is shown on the Google map. Lists without a map (route preview, Android Auto) show Google Maps attribution.
- `.env` files are git-ignored; only `.env.example` files are committed. `EXPO_PUBLIC_PROXY_SECRET` ships inside the app, so it only keeps strangers off your proxy. The protection for the Google server key is that it never leaves the proxy.

## Known limitations and things to check on a real device

- **Not yet run on a device.** It's checked by typecheck, lint, 160+ unit tests, an Android bundle build, `expo prebuild` and `expo-doctor`, but not by running the APK.
- **Two Google behaviours to confirm against real responses:**
  - the field mask `places.currentOpeningHours.openNow` (the docs list only `places.currentOpeningHours`);
  - the meaning of `routingSummaries.legs[1]` (place → end of the searched polyline), which the detour maths assumes.

  The proxy tests use mocked responses shaped like the documentation.
- **Data coverage in India:** fuel prices (`fuelOptions`) and the `restroom` attribute are often missing. The app treats them as a bonus, and labels highway pumps without data as "restroom likely" (can be turned off in Settings).
- **Android Auto handoff:** opening Google Maps from the car screen goes through the phone (there's no navigation handoff API in the car library). Android may block this while the app is in the background, so test it with the DHU.
- The hand-placed Pune → Nashik waypoints are only roughly on the road. Use *Plan Pune → Nashik* for the real road.
