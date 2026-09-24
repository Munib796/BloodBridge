# BloodBridge Mobile App

BloodBridge is the Expo / React Native mobile client for a blood-donor matching platform. The app is intentionally scoped to two user roles: donors and requestors. Hospital and organization login paths are not part of the mobile frontend, and the app explicitly removes those flows from the UI and the typed auth model.

This repository contains the mobile app in the myApp folder, while the API is maintained separately in the sibling backend folder.

## Project purpose

The app connects:

- Donors who can respond to nearby urgent blood requests
- Requestors who create and manage blood requests
- Matching and messaging flows tied to real backend data

The user experience is built around role-aware navigation, secure session storage, and a branded splash screen that keeps the app visible while auth finishes loading.

## Tech stack

- Expo SDK 57
- Expo Router
- React Native + TypeScript
- React Native Safe Area Context
- Expo Notifications
- Expo Secure Store for session persistence
- Expo Image / Image Picker
- Mapping and gesture utilities from the Expo ecosystem

## App structure

```text
myApp/
├── app.config.js
├── package.json
├── README.md
├── assets/
└── src/
    ├── app/
    │   ├── _layout.tsx
    │   ├── index.tsx
    │   ├── donor-signup.tsx
    │   ├── requestor-signup.tsx
    │   ├── home.tsx
    │   ├── requestor-home.tsx
    │   ├── history.tsx
    │   ├── requestor-history.tsx
    │   ├── profile.tsx
    │   └── requestor/
    ├── components/
    ├── context/
    ├── lib/
    ├── styles/
    ├── theme/
    └── utils/
```

## Core app behavior

- src/app/index.tsx is the root route. It redirects signed-in users:
  - donor -> /home
  - requestor -> /requestor-home
  - signed out -> welcome screen
- src/app/_layout.tsx keeps the branded splash screen visible for at least 2 seconds while auth hydrates.
- src/context/AuthContext.tsx owns persisted session storage, token refresh state, role validation, and logout handling.
- src/lib/apiClient.ts centralizes the backend URL and bearer-token logic for all requests.
- src/components/LoginScreen.tsx supports only donor and requestor sign-in and sign-up flows.

## Role model

The app is intentionally limited to two frontend roles:

- donor
- requestor

This is enforced across:

- auth state types
- role-specific redirects
- login / signup selection
- profile and notification endpoints
- removal of hospital and organization login/UI paths

The backend still includes hospital and organization logic, but the mobile app does not expose those login paths or role types.

## Setup

### 1. Install dependencies

cd myApp
npm install

### 2. Start the app

npx expo start

For native/dev-client workflows:

npx expo start --dev-client

## Environment variables

Create a .env file in myApp if you need to override the backend host.

EXPO_PUBLIC_API_URL=http://[your netork ip]:8000

Notes:

- EXPO_PUBLIC_API_URL is read in src/lib/apiClient.ts
- Use your machine LAN IP for phone testing; localhost does not work on a physical device
- Restart Expo after changing env values

## Backend integration

This frontend expects the BloodBridge backend to be running in the sibling backend project.

Typical local workflow:

1. Start PostgreSQL / PostGIS
2. Configure backend env values and database
3. Run Alembic migrations
4. Launch the FastAPI service
5. Point the mobile app to the backend URL via EXPO_PUBLIC_API_URL

For backend setup details, see ../backend/SETUP.md.

## App flow

### Signed out

- User lands on the welcome screen
- They choose donor or requestor account flows
- Social auth buttons are intentionally placeholders and show a “coming soon” toast

### Signed in

- AuthProvider reads the persisted session on startup
- Unsupported roles are cleared out and the app falls back to signed out
- Donors are sent to /home
- Requestors are sent to /requestor-home

### Splash screen

The app uses a branded splash screen and keeps it visible for at least 2 seconds while auth hydration completes, preventing a signed-in user from briefly seeing the welcome screen.

## Common commands

# install dependencies
npm install

# Expo dev server
npx expo start

# Android build
npx expo run:android

# iOS build
npx expo run:ios

# web preview
npm run web

# lint
npm run lint

## Android notes

If Android runs fail because adb is missing:

1. Install Android Studio or Android SDK Platform Tools
2. Add adb to your PATH
3. Set ANDROID_HOME and ANDROID_SDK_ROOT if needed
4. Re-run the Expo Android workflow

The app uses expo-dev-client, so a standard Expo Go-only setup may not be enough for native device workflows.

## Useful files

- src/app/index.tsx — root auth redirect logic
- src/app/_layout.tsx — splash and app shell setup
- src/context/AuthContext.tsx — auth lifecycle and role enforcement
- src/components/LoginScreen.tsx — donor/requestor sign-in UI
- src/components/WelcomeScreen.tsx — signed-out landing page
- src/lib/apiClient.ts — shared backend request logic
- src/lib/apiTypes.ts — app-side DTO definitions

## Notes

This frontend is intentionally a donor/requestor-only mobile app. It does not include hospital or organization login screens or mobile routes for those roles.
