# QuantifiedStrides Mobile

React Native / Expo app for the QuantifiedStrides platform. The Expo project lives one level deeper than expected — Expo created a nested folder on init.

**All work happens inside `mobile/` (the inner Expo folder).** The outer `mobile/` directory is just the git root for this sub-project.

## Running the App

### Via Docker (matches the rest of the stack)

The mobile service is defined in `docker-compose.yml` at the project root (`QuantifiedStrides-main/`). It runs Metro Bundler and exposes ports 19000/19001/8081.

```bash
# From QuantifiedStrides-main/
docker compose up -d mobile

# Follow logs to see the QR code (only renders with tty: true in compose)
docker compose logs -f mobile
```

**The QR code does not render in `docker logs` without `tty: true`.** To get the QR code in Docker logs, add `tty: true` under the `mobile:` service in `docker-compose.yml`. Otherwise, connect manually in Expo Go:

```
exp://<YOUR_LAN_IP>:19000
```

The LAN IP is set in `.env` inside the root folder, not the one inside `/QuantifiedStrides`, under `MOBILE_HOST_IP`. Simply copy the contents of `.env.example` into a new `.env` file in your root, and fill the info in. This roots back to the `docker-compose.yml` under `REACT_NATIVE_PACKAGER_HOSTNAME`. 

### Local (hot-reload, faster iteration)

```bash
# From mobile/mobile/
npx expo start            # Expo Go / dev client
npx expo start --android  # Android emulator
npx expo start --ios      # iOS simulator
```

**Before running on a physical device:** edit `.env.development` and replace `YOUR_IP` with your machine's LAN IP so the device can reach the backend.

```
EXPO_PUBLIC_API_URL=http://192.168.x.x:8000
```

### Install notes

This project uses React 19. Running `npx expo install` or `npm install` without flags fails due to peer dependency conflicts from expo-router's optional web dependencies. Always pass `--legacy-peer-deps`:

```bash
npx expo install <package> -- --legacy-peer-deps
npm install <package> --legacy-peer-deps
```

## Stack

| | |
|---|---|
| Framework | Expo SDK 54 + React Native 0.81.5 |
| Routing | Expo Router 6 (file-based, `app/` directory) |
| State | Zustand (auth) + TanStack Query (server state) |
| HTTP | Axios with JWT interceptor |
| Charts | react-native-svg (SparklineChart built on top) |
| Fonts | expo-font — Newsreader, JetBrains Mono, Geist |

## Project Structure

```
mobile/                    ← git root for this sub-project
  CLAUDE.md
  mobile/                  ← Expo project root (all work here)
    app.json
    package.json
    .env.development       ← set EXPO_PUBLIC_API_URL to your LAN IP

    app/                   ← Expo Router file-based routes
      _layout.tsx          ← root: QueryClientProvider, font loading, splash screen
      (tabs)/
        _layout.tsx        ← tab bar config (theme colours, JetBrains Mono labels)
        today.tsx          ← placeholder
        load.tsx           ← placeholder
        log.tsx            ← placeholder
        history.tsx        ← placeholder
        me.tsx             ← placeholder

    assets/
      fonts/               ← all 4 TTF files present (Newsreader ×2, JetBrainsMono, Geist)

    src/
      theme/               ← single source of truth for all visual values
        colors.ts          ← ThemeWarm, ThemeCool, ActiveTheme (change here to switch)
        typography.ts      ← FONT constants + TEXT style presets
        spacing.ts         ← SPACE scale + RADIUS scale
        index.ts           ← barrel export

      hooks/
        useTheme.ts        ← returns ActiveTheme; extend later for user theme switching
        useDashboard.ts    ← TanStack Query wrapper for GET /dashboard

      store/
        authStore.ts       ← Zustand: token + userId + setAuth/clearAuth

      api/
        client.ts          ← axios instance; JWT interceptor reads from authStore
        endpoints/
          dashboard.ts     ← fetchDashboard()

      components/
        primitives/        ← atoms — self-contained, call useTheme() internally
        blocks/            ← molecules — composed from primitives
        layout/            ← structural wrappers
```

## Theme System

Two themes defined in `src/theme/colors.ts`:
- **ThemeWarm** — dark wine background (`#1A0F0F`), harvest gold accent (`#DFBA7A`), crimson alert
- **ThemeCool** — dark navy background (`#0E0F1A`), lavender-grey accent (`#D4D1E5`), deep red alert

Change the active theme globally by editing the last line of `src/theme/colors.ts`:

```ts
export const ActiveTheme: AppTheme = ThemeWarm  // ← swap to ThemeCool
```

`useTheme()` reads `ActiveTheme`. No theme prop is ever passed from outside — all components consume the theme internally. When user-level theme switching is needed, convert `useTheme` to read from a Zustand store.

### Typography presets (`TEXT.*`)

| Prefix | Font | Use |
|---|---|---|
| `displayLarge/Medium/Small` | Newsreader serif | Full-screen hero numbers |
| `headingLarge/Medium` | Newsreader serif | Section headings |
| `bodyLarge/Medium/Small` | Geist sans | Readable prose |
| `narrativeLarge/Medium/Small` | Newsreader italic | AI narrative, captions |
| `monoLarge/Medium/Small` | JetBrains Mono | Labels, tags, metrics, timestamps |

Always use `TEXT.*` presets and `SPACE.*` / `RADIUS.*` constants — never raw numbers.

## Component Library

### Primitives (`src/components/primitives/`)

| Component | Purpose |
|---|---|
| `MetricLabel` | All-caps mono label above values — "HRV · RMSSD", "Today's Prescription" |
| `SectionTitle` | Section heading with optional right-side link — "This morning" + "All →" |
| `Hairline` | 1px horizontal divider inside cards |
| `StatusBadge` | Pill badge: `filled` (accent bg), `outlined` (accent border), `alert` (crimson bg) |
| `FilterChip` | Tappable filter pill — active = solid accent, inactive = faint border |
| `ActionButton` | CTA button: `accent` (gold), `alert` (crimson), `ghost` (transparent); sizes sm/md/lg |
| `ReadinessDots` | 5-dot readiness score indicator |
| `RadioOption` | Single radio row — training goal selector on Me screen |
| `SparklineChart` | Inline SVG line chart via react-native-svg — HRV, sleep, running economy trends |
| `WeekDayPicker` | 7-tile week grid for gym day selection |

### Blocks (`src/components/blocks/`)

| Component | Purpose |
|---|---|
| `InfoCard` | Main card surface — rounded dark panel, optional `noPadding` |
| `MetricTile` | 2-column metric tile — label + big number + unit + optional sparkline + badge |
| `WorkoutListRow` | Single history/session row — title, subtitle, date, sport badge |
| `ExerciseRow` | Exercise in session builder — name + sets × reps × weight input boxes |

### Layout (`src/components/layout/`)

| Component | Purpose |
|---|---|
| `ScreenWrapper` | Wraps every screen — page background, SafeAreaView, optional scroll |
| `BottomSheetModal` | Slide-up modal with dim backdrop + drag handle — for check-in flow |

## API Client

`src/api/client.ts` creates an axios instance pointed at `EXPO_PUBLIC_API_URL/api/v1`. The request interceptor reads the JWT from `authStore` and attaches it as `Authorization: Bearer <token>` on every request.

Add new endpoint files under `src/api/endpoints/` — one file per domain (e.g. `training.ts`, `sleep.ts`, `auth.ts`). Mirror the backend's router structure.

## Auth Store

`src/store/authStore.ts` holds `token` and `userId`. Call `setAuth(token, userId)` on login and `clearAuth()` on logout. Currently in-memory only — add `AsyncStorage` persistence when ready.

## Fonts

All font files are real TTF binaries in `assets/fonts/`:

| File | Source |
|---|---|
| `Newsreader-Regular.ttf` | Variable font — `github.com/google/fonts/ofl/newsreader` |
| `Newsreader-Italic.ttf` | Variable font — same repo |
| `JetBrainsMono-Regular.ttf` | `github.com/JetBrains/JetBrainsMono` |
| `Geist-Regular.ttf` | `github.com/vercel/geist-font/fonts/Geist/ttf` |

Loaded in `app/_layout.tsx` via `useFonts()`. The app shows nothing until fonts resolve — this is intentional (no flash of unstyled text).

## What Is Built

- Theme system (both warm and cool themes, full typography/spacing/radius scales)
- Complete component library — all primitives, blocks, and layout wrappers
- Navigation shell — Expo Router 5-tab layout with themed tab bar
- API client with JWT interceptor
- Auth store (Zustand)
- Dashboard endpoint + `useDashboard` query hook
- Font loading with splash screen gate
- `.env.development` for local API URL
- Docker service (`mobile` in `docker-compose.yml`) — Metro runs in container, ports 19000/19001/8081

## Known Issue — White Screen on Device (unresolved)

**Status:** Bundle compiles successfully (1155 modules, no errors). Expo Go connects, downloads the bundle, but renders a white screen instead of the app.

**What was ruled out:**
- `expo-linking` was missing from `package.json` — this caused `Bundling failed` errors. Fixed by adding `expo-linking ~8.0.11`. Bundle now compiles cleanly.
- Font files exist (`assets/fonts/` has all 4 TTFs) and are mounted correctly in Docker.

**Likely causes to investigate:**

1. **`SafeAreaProvider` missing** — `ScreenWrapper` uses `SafeAreaView` from `react-native-safe-area-context`, which requires a `SafeAreaProvider` ancestor. The root `app/_layout.tsx` wraps in `QueryClientProvider` but not `SafeAreaProvider`. Expo Router v6 may or may not inject one automatically — verify. Fix: wrap the root layout return in `<SafeAreaProvider>` from `react-native-safe-area-context`.

2. **Font loading silently failing** — `app/_layout.tsx` does `if (!fontsLoaded) return null`, which shows a white screen indefinitely if fonts never resolve. The current code ignores the second return value from `useFonts` (the error). Add this to diagnose:
   ```tsx
   const [fontsLoaded, fontError] = useFonts({ ... })
   if (fontError) console.error('Font load error:', fontError)
   ```

3. **Runtime crash before error overlay** — shake the device in Expo Go to open the dev menu; tap "Show Element Inspector" or check the console for a red error screen that may not be surfacing automatically. With `newArchEnabled: true` in `app.json` (React Native new architecture), some native modules may not be compatible.

**Quick debug steps for the next person:**
1. Run locally (`npx expo start` from `mobile/mobile/`) rather than via Docker — you get the interactive Metro console and can press `j` to open the JS debugger.
2. Shake the device → open dev menu → look for errors.
3. Try disabling `newArchEnabled` in `app.json` (set to `false`) — the new architecture can break some packages that aren't yet compatible.
4. Add a bare-minimum screen to `app/(tabs)/today.tsx` with no imports beyond `react-native` to confirm the routing layer itself works:
   ```tsx
   import { View, Text } from 'react-native'
   export default function TodayScreen() {
     return <View style={{ flex: 1, backgroundColor: '#1A0F0F' }}><Text style={{ color: 'white' }}>hi</Text></View>
   }
   ```

## What Still Needs to Be Built

### Screens (all are placeholder stubs)

**Today tab** — the most complex screen:
- Alerts strip (overtraining flags, anomaly notices)
- Today's prescription card (recommended sport, session type, intensity zone)
- ATL / CTL / TSB metric tiles with sparklines
- Muscle freshness heatmap
- AI narrative card (Claude API, cached)
- Weather card
- Sleep summary
- Readiness summary
- "Begin — out the door" CTA button
- Check-in bottom sheet (morning readiness form)

**Load tab:**
- ATL/CTL/TSB chart (time-series line chart — needs a charting library or custom SVG)
- Training load history list
- Ramp rate indicator
- HRV trend chart

**Log tab:**
- Session type selector (Run / Strength / Bike / Climb)
- Strength session builder: exercise search, ExerciseRow list, add set / finish session
- Endurance session logger: duration, perceived effort, notes
- Post-workout reflection form

**History tab:**
- Filter chips (All / Run / Strength / MTB / Climb)
- WorkoutListRow list with pagination or infinite scroll
- Workout detail view (tap to expand)

**Me tab:**
- Profile info (name, email)
- Sport picker (multi-select with priority weights)
- Training goal radio group (athlete / strength / hypertrophy)
- Gym days WeekDayPicker
- Garmin credentials form
- Theme toggle (Warm ↔ Cool)
- Sync button → POST /api/v1/sync/garmin

### API Endpoints (not yet wired)

- `src/api/endpoints/auth.ts` — login, register, verify-email
- `src/api/endpoints/training.ts` — workout history, training load
- `src/api/endpoints/sleep.ts` — sleep history
- `src/api/endpoints/strength.ts` — sessions, exercises, sets
- `src/api/endpoints/checkin.ts` — daily readiness + post-workout reflection
- `src/api/endpoints/running.ts` — biomechanics analytics
- `src/api/endpoints/sync.ts` — Garmin sync trigger
- `src/api/endpoints/profile.ts` — user profile read/write

### Hooks (not yet wired)

One `useQuery` hook per domain, following the same pattern as `useDashboard`. Add `useMutation` hooks for write operations (log workout, submit check-in, save profile).

### Auth flow

No login/register screens exist yet. The `authStore` is ready but nothing populates it. Needs:
- `app/login.tsx` and `app/register.tsx` (outside the tabs group)
- Root layout redirect logic: if no token → push to `/login`

### Persistence

`authStore` is in-memory — token is lost on app restart. Add `AsyncStorage` + zustand `persist` middleware.

### Navigation extras

- Tab bar icons (currently label-only)
- Workout detail modal or screen
- Loading and error states on all data-fetching screens
