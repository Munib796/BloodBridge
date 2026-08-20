# BloodBridge Backend — Local Setup

## 1. Prerequisites
- Python 3.12+
- PostgreSQL 16 with the **PostGIS** extension available (`postgresql-16-postgis-3` on Ubuntu/Debian)

## 2. Install dependencies
```bash
python -m venv .venv
source .venv/bin/activate        # .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

## 3. Configure environment
Copy `.env.example` to `.env` and fill in real values:
```bash
cp .env.example .env
```
- `DATABASE_URL` — e.g. `postgresql://bloodbridge_user:bloodbridge_pass@localhost:5432/bloodbridge`
- `JWT_SECRET_KEY` — any long random string
- `MAIL_*` — your SMTP credentials (Gmail app password works fine for dev)
- `CLOUDINARY_*` — from your Cloudinary dashboard
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — the hardcoded admin login (no DB row)

## 4. Create the database
```sql
CREATE USER bloodbridge_user WITH PASSWORD 'bloodbridge_pass';
CREATE DATABASE bloodbridge OWNER bloodbridge_user;
```
PostGIS is enabled automatically on startup/migration (`ensure_postgis()` in `src/utils/database.py`) — no manual `CREATE EXTENSION` needed, as long as the DB user has permission (a fresh superuser-owned DB works out of the box).

## 5. Run migrations
```bash
alembic upgrade head
```
This creates all 8 tables (`donors`, `requestors`, `hospitals`, `organizations`, `blood_requests`, `request_matches`, `chat_threads`, `chat_messages`) plus PostGIS's own `spatial_ref_sys`.

**When you change a model** (add a field, a table, etc.):
```bash
alembic revision --autogenerate -m "describe your change"
alembic upgrade head
```

## 6. Run the server
```bash
uvicorn main:app --reload
```
Visit `http://localhost:8000/docs` for interactive Swagger docs — every endpoint built so far is listed there, grouped by module.

## What's implemented
- **donors / requestors / hospitals / organizations**: signup, email verification, login (JWT), password reset, profile updates, Cloudinary picture/logo upload
- **admin**: hardcoded login, approve/reject pending hospitals and organizations
- **blood_requests**: create (auto-detects hospital-backed vs. not), hospital verify (accept/reject), PostGIS-based nearby search for donors (blood-type-compatible, radius by urgency), cancel, widen radius, reactivate, close, admin-triggered expiry sweep
- **request_matches**: accept (atomic — race-condition safe), update ETA, cancel (reopens the request), mark complete, list mine
- **chat**: auto-created thread per match, REST history + send, live WebSocket at `/chat/ws/{match_id}?token=...`

## Not yet built (per the planning doc's Phase 2 list)
- Donor eligibility (90-day) enforcement
- Donor cancellation-rate tracking
- Scheduled/cron trigger for radius auto-widen and expiry sweep (currently manual endpoints)
- Push notifications (Flutter app will consume the API later)
