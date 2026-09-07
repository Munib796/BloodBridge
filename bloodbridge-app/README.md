# BloodBridge — mobile app

Expo React Native app (SDK 57) for the donor and requestor sides of
[BloodBridge](../README.md). File-based routing via expo-router using the `src/app`
convention, TypeScript throughout.

## Prerequisites

- Node 20+
- The [backend](../backend/SETUP.md) running and reachable from your phone —
  same Wi-Fi network, or a tunnel.
- Expo Go on a physical device for day-to-day work. Note that push notifications
  and native maps need a development build instead; see below.

## Running it

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go. The app derives the API host from the Metro
connection, so on the same network it finds the backend with no configuration.
To point it somewhere else — a tunnel, a staging deploy — set `EXPO_PUBLIC_API_URL`
in `.env` (copy `.env.example`).

If your phone can't reach your machine directly, tunnel Metro *and* the API:

```bash
npx expo start --tunnel
```

## Development build

Expo Go can't do remote push notifications on Android (dropped in SDK 53) and
can't use a keyed Google Maps instance. Once either is in play, build locally:

```bash
npx expo run:android
```

This generates `android/` (gitignored — it's regenerated from `app.config.ts`, so
never edit it by hand) and installs a dev client on the attached device. Metro
still serves the JS, so the reload loop is unchanged.

## Layout

```
src/
  api/         axios client + typed request functions, one module per resource
  app/         routes. (auth) (donor) (requestor) are route groups
  components/  shared UI
  store/       Zustand stores, persisted through expo-secure-store
  theme/       design tokens and the theme provider
  utils/       formatting and hooks
```

## Checks

```bash
npx tsc --noEmit
```
