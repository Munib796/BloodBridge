# BloodBridge Backend — Local Setup

## 1. Prerequisites
- Python 3.12+
- PostgreSQL 16 with the **PostGIS** extension available (`postgresql-16-postgis-3` on Ubuntu/Debian)

Or just use the bundled compose file: `docker compose up -d` gives you PostGIS on
5432 and Adminer on 8080.

## 2. Install dependencies
```bash
python -m venv .venv
source .venv/bin/activate        # .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

## 3. Configure environment
Copy `.env.example` to `.env` and fill it in:
```bash
cp .env.example .env
```
Only two variables are mandatory:
- `DATABASE_URL` — e.g. `postgresql://bloodbridge_user:bloodbridge_pass@localhost:5432/bloodbridge`
- `JWT_SECRET_KEY` — any long random string

Everything else has a default. `MAIL_*` and `CLOUDINARY_*` are optional: with
them blank the app still starts, email is logged as skipped, and upload
endpoints return 503. For local work without SMTP set
`REQUIRE_EMAIL_VERIFICATION=false`, otherwise donors and requestors can never
complete verification and so can never log in.

`ADMIN_EMAIL` / `ADMIN_PASSWORD` are the hardcoded admin login (no DB row).
Admin login returns 503 while either is blank.

## 4. Create the database
```sql
CREATE USER bloodbridge_user WITH PASSWORD 'bloodbridge_pass';
CREATE DATABASE bloodbridge OWNER bloodbridge_user;
```
PostGIS is enabled automatically on migration and on app startup
(`ensure_postgis()` in `src/utils/database.py`) — no manual `CREATE EXTENSION`
needed, as long as the DB user has permission.

## 5. Run migrations
```bash
alembic upgrade head
```
This creates all 8 tables (`donors`, `requestors`, `hospitals`, `organizations`,
`blood_requests`, `request_matches`, `chat_threads`, `chat_messages`) plus
PostGIS's own `spatial_ref_sys`, then applies the hardening revision
(`a7f3c9d21b84`) that adds CHECK constraints and indexes, followed by
`b91c47e5f3a2` (donor device token) and `c4d8e1a96f27` (donor availability).

> On a database that already has rows, the CHECK constraints are validated
> against existing data. Clean up any `blood_requests` / `request_matches` row
> that has both — or neither — of its two owner columns set before upgrading.

**When you change a model** (add a field, a table, etc.):
```bash
alembic revision --autogenerate -m "describe your change"
alembic upgrade head
```

## 6. Run the server
```bash
uvicorn main:app --reload
```
Visit `http://localhost:8000/docs` for interactive Swagger docs.

> The login endpoints take a JSON body, not OAuth2 form data. Call
> `POST /donors/login` (or the relevant role's login) via *Try it out*, copy the
> `access_token`, then click **Authorize** and paste the raw token into the
> single **Value** box — Swagger sends it as `Authorization: Bearer <token>`.

## What's implemented
- **donors / requestors**: signup, email verification (+ resend), login (JWT),
  password reset, profile updates, Cloudinary picture upload
- **donors**: push device-token registration (`PATCH /donors/me/device-token`,
  send `null` to unregister), and the Available/Unavailable toggle
  (`PATCH /donors/me/availability`) — see below for what that actually gates
- **hospitals / organizations**: signup, admin-approval-gated login, logo upload
- **admin**: hardcoded login, approve/reject pending hospitals and organizations
- **blood_requests**: create (auto-detects hospital-backed vs. not), hospital
  verify (accept/reject), PostGIS nearby search for donors (blood-type
  compatible, radius by urgency), the poster's own list
  (`GET /blood-requests/mine`, filterable by `?status=` and paginated), who has
  committed to a request (`GET /blood-requests/{id}/matches`), cancel, widen
  radius, reactivate, close, admin-triggered expiry and auto-widen sweeps
- **scheduled sweeps**: expire-overdue and auto-widen run on a timer in-process
  every `SWEEP_INTERVAL_MINUTES` (see `src/utils/scheduler.py`); the admin
  endpoints stay available for on-demand runs. Set `ENABLE_SCHEDULER=false` to
  turn the timer off.
- **notification targeting**: `find_donors_to_notify()` in
  `src/blood_requests/notifications.py` resolves the eligible, in-radius donors
  with a registered device token when a request goes active, when a hospital
  approves one, and when a sweep widens one's radius. Donors who have switched
  themselves unavailable are skipped. The send itself is a logged intent
  (`Would notify N donors about request ...`) until there is a frontend handing
  out real tokens.
- **request_matches**: accept (atomic — race-condition safe, and re-validates
  blood-type compatibility + distance), update ETA, cancel (reopens the
  request), mark complete (settles the request to `fulfilled`), list mine. Every
  match response carries the counterparty's name and phone number, the distance
  between the request and the acceptor (`distance_km`), and a summary of the
  request, so a screen can render a commitment without a second call.
- **chat**: auto-created thread per match, REST history + send, a list of the
  caller's threads with counterparty and request context (`GET /chat/threads`),
  and a live WebSocket at `/chat/ws/{match_id}?token=...`

## Donor availability

`is_available` is the Available/Unavailable pill on the donor's home screen. It
defaults to **true**, including for every row that predates the column, so the
flag changes nothing until a donor touches it. An unavailable donor:

- is skipped when a request works out who to notify
  (`notifications.find_donors_to_notify`); and
- is refused with a 403 if they try to accept one
  (`blood_requests.controller.assert_acceptor_eligible`).

It deliberately does **not** clear their stored location — flipping the toggle
back on needs no fresh GPS fix — and it does **not** touch a commitment they
already hold. They can still browse the nearby feed, and can still cancel or
complete an existing match.

Because a donor defaults to available the moment they exist, an account with a
location is reachable without ever calling this endpoint. Only an explicit
`{"is_available": false}` opts out.


## Security & access model

**Who can read a blood request** (`GET /blood-requests/{id}`) — the endpoint
requires authentication, and patient name plus contact number are only returned
to:

| Viewer | Condition |
|---|---|
| Poster | the requestor or organization that created it |
| Hospital | the hospital named on the request |
| Admin | always |
| Donor | blood-type compatible **and** inside the current radius, while the request is open |
| Organization | inside the current radius (a blood bank holds many types) |
| Anyone who committed | permanently, once they have a match on it |

Everyone else gets a **404**, not a 403, so request IDs can't be probed to
confirm that a patient exists.

**Who can see who committed** (`GET /blood-requests/{id}/matches`) — a
narrower list than the one above, because it exposes other people's names and
phone numbers:

| Viewer | Sees the commitments? |
|---|---|
| Poster | yes — it's their request, and calling each donor is the point |
| Hospital | yes, for the request it is verifying |
| Admin | yes |
| Donor / Organization | **no** — only their own, via `GET /request-matches/mine` |

A donor is never shown who else responded to a request, even one they are
themselves committed to. Same 404 as above, for the same reason.

Other things worth knowing:
- An organization cannot accept a request **it posted itself**. Organizations
  are dual-capable by design (they can both post and donate), so without that
  guard an org could claim its own units, flipping the request to
  `partially_matched` / `fully_matched` and pulling it out of the nearby feed
  with no donor involved. Requestors can never reach the accept path at all —
  `get_current_acceptor` admits only donors and organizations.
- Accepting a request re-checks compatibility and distance server-side. The
  nearby feed filters the same way, but a filtered list is not an
  authorization check. An unavailable donor is refused here too.
- A match response includes the acceptor's and the poster's name and phone, on
  the basis that the two sides of a match are meant to reach each other. Every
  endpoint returning one is already scoped to a participant, so this exposes
  nothing to a third party — but it does mean those fields are PII on the wire
  and the client should not log them.
- One open commitment per donor/organization per request, enforced both in the
  controller and by a partial unique index.
- A password reset invalidates every access token issued before it, and the
  reset link itself is single-use.
- `REJECTED`, `CANCELLED` and `CLOSED` requests cannot be reactivated —
  reopening a hospital-rejected request would bypass verification.
- Rate limits are in-process (slowapi, in-memory). They reset on restart and
  are per-worker; behind a proxy, set `TRUST_PROXY=true`.
- The chat WebSocket broadcaster is also per-process, so with multiple uvicorn
  workers a live message only reaches sockets on the same worker. REST history
  stays authoritative.
- The sweep scheduler is per-process too: every worker would run its own copy.
  The sweeps are idempotent, so that is safe rather than wrong, but with
  `--workers N` set `ENABLE_SCHEDULER=false` on all but one.

## Not yet built
- Donor eligibility (90-day) enforcement
- Donor cancellation-rate tracking
- Actually sending push notifications. Who to notify is resolved and logged
  (`find_donors_to_notify()`); the FCM call is a `TODO` in
  `src/blood_requests/notifications.py`, waiting on a frontend to register real
  device tokens.
- Automated tests
