# BloodBridge

Emergency blood matching for Pakistan. When a patient needs blood, the search
currently happens by forwarding a message through WhatsApp groups and hoping it
reaches someone compatible, nearby, and willing, in time. BloodBridge replaces
that with a direct, geo-aware match: a requestor posts what's needed, compatible
donors within range are notified, and one of them commits with an ETA.

## Repository layout

| Path | What it is |
|---|---|
| `backend/` | FastAPI + PostgreSQL/PostGIS API — accounts, request lifecycle, atomic donor matching, geo search, WebSocket chat |
| `bloodbridge-app/` | Expo React Native app (SDK 57, expo-router, TypeScript) — the donor and requestor experience |

## How the matching works

1. A **requestor** posts a request: blood group, units needed, urgency, patient
   location, and optionally a hospital.
2. The request goes `active` (immediately, or after the named hospital verifies
   it) and PostGIS resolves every **donor** who is blood-type compatible and
   inside a radius set by urgency.
3. A donor **accepts** and gives an ETA. Acceptance is a single conditional
   `UPDATE` guarded by partial unique indexes, so two donors racing for the last
   unit produce exactly one commitment — never an oversubscribed request.
4. The request walks a state machine as units fill:
   `active → partially_matched → fully_matched → fulfilled`. Background sweeps
   expire requests that pass their deadline and widen the radius on ones that
   aren't filling.
5. Each match opens a chat thread so the two sides can coordinate without the
   requestor ever seeing the donor's phone number.

## Getting started

Both halves run locally and independently. Start the backend first — the app
needs it.

**Backend** — see [`backend/SETUP.md`](backend/SETUP.md) for the full walkthrough.

```bash
cd backend && docker compose up -d && alembic upgrade head && uvicorn main:app --reload
```

**App** — see [`bloodbridge-app/README.md`](bloodbridge-app/README.md).

```bash
cd bloodbridge-app && npm install && npx expo start
```

## Account types

Donors and requestors are the two roles the app covers. Hospitals, organizations
(blood banks) and admin exist in the API — hospitals verify requests that name
them, organizations can commit units in bulk, admin approves both — but they have
no mobile UI and are expected to use the API or a future web console.
