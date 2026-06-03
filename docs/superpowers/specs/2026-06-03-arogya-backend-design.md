# Arogya Entry — Backend Design

**Date:** 2026-06-03
**Status:** Approved
**Scope:** Backend API + deployment, on the live VPS `vmi3065909.contaboserver.net`.

## Overview

Build the Node.js backend that the Arogya registration frontend calls. It exposes two
endpoints (`/clinics/validate`, `/registration`), validates clinic QR codes, computes a
triage result from the health-screening flags, generates a per-clinic Arogya ID, and
persists registrations in a local SQLite database. It runs as a pm2 process bound to
`127.0.0.1:4000` and is reverse-proxied by Caddy at `/arogya/api/*`. **DHIS2, which shares
this server, must never be disturbed.**

Frontend contract (already shipped): `config.js` sets `apiBaseUrl = "/arogya/api"`, so the
browser calls `https://vmi3065909.contaboserver.net/arogya/api/clinics/validate` and
`/arogya/api/registration`.

## Environment (as found on the server)

- Host `vmi3065909`; user `developper`; `sudo` requires a password.
- Caddy at `/etc/caddy/Caddyfile` serves `/arogya/*` statically from `/var/www/arogya-entry`
  and reverse-proxies **everything else** to DHIS2 at `https://172.19.2.2`. There is **no
  `/api` route yet**.
- Node v24.16.0, npm 11.13.0. `node:sqlite` is available; native build tools
  (gcc/g++/make/python3) are present. **pm2 is not installed.**
- npm global prefix is the user-owned nvm dir, so `npm i -g pm2` needs **no sudo**.
- Port **4000 is free**.

## Stack

- **Express** + **better-sqlite3** (synchronous, proven; compiles cleanly here).
- Dev/test: Node built-in **`node:test`** + **supertest**.
- Runtime dependencies kept minimal: `express`, `better-sqlite3`. Dev: `supertest`.

---

## Architecture & request routing

```
Browser ──HTTPS──► Caddy :443 ──► /arogya/api/*  → 127.0.0.1:4000 (Express)   [NEW]
                                 ─► /arogya/*      → static /var/www/arogya-entry
                                 ─► (everything else) → DHIS2 172.19.2.2        [UNTOUCHED]
```

- New Caddy block `handle_path /arogya/api/* { reverse_proxy 127.0.0.1:4000 }` is inserted
  **before** the static `handle_path /arogya/*` block. `handle_path` strips the
  `/arogya/api` prefix, so the backend sees clean routes `/clinics/validate`,
  `/registration`.
- Express binds **`127.0.0.1:4000` only** (never `0.0.0.0`) — reachable only via Caddy.
- pm2 process `arogya-backend`, run as `developper`, `fork` mode, 1 instance,
  `max_memory_restart 200M`. Boot persistence via `pm2 startup` (systemd) + `pm2 save`.

### Directory layout

`backend/` is its own git repo (mirroring `frontend/`).

```
backend/
  src/
    server.js          # bootstrap: build app, listen on HOST:PORT
    app.js             # express app + routes (exported, no listen — for tests)
    db.js              # better-sqlite3 connection, migrations, clinic seeding
    routes/
      clinics.js       # POST /clinics/validate
      registration.js  # POST /registration
    lib/
      triage.js        # computeTriage(flags) -> 'high-risk' | 'normal'
      arogyaId.js      # nextArogyaId(db, clinicId) -> 'AC-005-000123'
      validation.js    # validateRegistration(body, clinicExists) -> string[] errors
      messages.js      # trilingual triage messages
    data/
      clinics.seed.json  # 40 clinics (synced from docs/clinics.seed.json)
  test/                # node:test + supertest
  ecosystem.config.cjs # pm2 config (PORT/HOST/AROGYA_DB_PATH via env)
  package.json
  .gitignore
```

---

## API

Both endpoints exchange JSON. Success bodies are JSON; **error bodies are plain text**
(the frontend fetch wrapper displays the response body text directly).

### `POST /clinics/validate`
```
Body:     { clinicId: string }
200:      { valid: true, clinicName: string }   // clinicId found
200:      { valid: false }                        // clinicId not found
400:      "<plain-text reason>"                    // missing/blank clinicId
```

### `POST /registration`
```
Body: {
  language: "en" | "si" | "ta",
  clinicId: string,
  patient: {
    fullName, nic, phn, gender, dateOfBirth,
    householdAddress, relationshipToHead, gnDivision,
    mobile, maritalStatus, occupation, education
  },
  screening: { flags: boolean[11] },
  consent: boolean
}
200:  { arogyaId: string, triage: "high-risk" | "normal", message: string }
400:  "<plain-text reason>"   // validation failed
500:  "<plain-text generic>"  // unexpected; details logged server-side
```

**Processing order:**
1. **Validate** (`lib/validation.js`, pure, returns a list of error strings; empty = valid):
   - `clinicId` exists in `clinics` (passed in as a boolean `clinicExists`).
   - `consent === true`.
   - `screening.flags` is an array of length 11, all booleans.
   - Required patient fields present: `fullName`, `gender`, `dateOfBirth`, `mobile`, and at
     least one of `nic` / `phn`. (Server-side mirror of the frontend rules.)
   - Any failure → `400` with the first/joined reason as plain text.
2. **Triage** (`lib/triage.js`, pure): `high-risk` if **any of flags[0]–flags[4]** is true
   (chest pain/breathlessness, 2-week depression, unexplained weight loss, breast lump,
   non-healing oral lesion); otherwise `normal`. The "high-risk index set" is a named
   constant for easy adjustment.
3. **Arogya ID** (`lib/arogyaId.js`): atomic per-clinic counter via
   `INSERT INTO clinic_counters(clinic_id,last_seq) VALUES(?,1)
    ON CONFLICT(clinic_id) DO UPDATE SET last_seq = last_seq + 1 RETURNING last_seq`,
   formatted `${clinicId}-${String(last_seq).padStart(6,'0')}` → e.g. `AC-005-000042`.
4. **Persist**: one `registrations` row (patient as JSON, flags as JSON, triage, arogyaId,
   consent, ISO timestamp) — the counter bump and the insert run in **one transaction** so
   the ID and the stored record never diverge.
5. **Respond** `200 { arogyaId, triage, message }`, where `message` is the triage outcome
   text in the request's `language` (from `lib/messages.js`).

**Cross-cutting:**
- JSON body parser with a small size limit (e.g. 64 kB); reject non-JSON.
- No CORS (same origin through Caddy).
- Unexpected errors are caught by an Express error handler → `500` plain text, full error
  logged to stdout (captured by pm2).

---

## Data model (SQLite)

- File: `/var/lib/arogya/arogya.db` (env `AROGYA_DB_PATH`). `PRAGMA journal_mode = WAL`,
  `PRAGMA foreign_keys = ON`. Migrations are idempotent (`CREATE TABLE IF NOT EXISTS`) and
  run on startup.

```sql
clinics (
  clinic_id TEXT PRIMARY KEY,    -- 'AC-001' … 'AC-040'
  name      TEXT NOT NULL,
  rdhs      TEXT,
  province  TEXT
);

clinic_counters (
  clinic_id TEXT PRIMARY KEY REFERENCES clinics(clinic_id),
  last_seq  INTEGER NOT NULL
);

registrations (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  arogya_id       TEXT UNIQUE NOT NULL,
  clinic_id       TEXT NOT NULL REFERENCES clinics(clinic_id),
  language        TEXT NOT NULL,
  patient_json    TEXT NOT NULL,
  screening_flags TEXT NOT NULL,
  triage          TEXT NOT NULL,
  consent         INTEGER NOT NULL,
  created_at      TEXT NOT NULL
);
```

- **Seeding:** on startup, `db.js` reads `src/data/clinics.seed.json` and upserts into
  `clinics` (`ON CONFLICT(clinic_id) DO UPDATE SET name/rdhs/province`). Editing the seed and
  restarting refreshes clinic names without touching `clinic_counters` or `registrations`.
- **`patient_json` as a blob:** schema stays stable as the form evolves; no per-field query
  needs yet (YAGNI). Columns/indexes can be added later in a migration if reporting requires.

---

## Deployment

Two scripts at repo root (`/home/developper/arogya-entry/`). Both run **as `developper`**
and invoke `sudo` only for the specific root-owned steps (pm2 never runs as root).

### `setup.sh` — one-time bootstrap (idempotent)
1. `npm i -g pm2` (user nvm prefix; no sudo).
2. `sudo mkdir -p /var/lib/arogya && sudo chown developper:developper /var/lib/arogya`.
3. `cd backend && npm ci` (builds better-sqlite3).
4. `pm2 start ecosystem.config.cjs && pm2 save`.
5. **Caddy patch (delicate):**
   - Back up `/etc/caddy/Caddyfile` → `Caddyfile.bak.<timestamp>`.
   - If the file does **not** already contain `/arogya/api`, insert
     `handle_path /arogya/api/* { reverse_proxy 127.0.0.1:4000 }` immediately **before** the
     `handle_path /arogya/*` block. The DHIS2 `handle` block is left byte-for-byte unchanged.
   - `caddy validate --config /etc/caddy/Caddyfile`. On success → `sudo systemctl reload
     caddy`. On failure → restore the backup and abort.
6. Print the exact `sudo env PATH=… pm2 startup systemd -u developper --hp /home/developper`
   command for the operator to run once (enables boot persistence).

### `deploy.sh` — the repeatable "ultimate" deploy
1. **Frontend:** `cd frontend && npm ci && npm run build`.
2. **Ship:** `sudo rsync -a --delete frontend/dist/ /var/www/arogya-entry/`, then re-copy
   `frontend/config.js` → `/var/www/arogya-entry/config.js` (rsync `--delete` removes it
   otherwise).
3. **Backend:** `cd backend && npm ci`.
4. **Restart API:** `pm2 restart arogya-backend --update-env` (as developper).
5. **Caddy:** ensure the `/arogya/api` block exists (self-healing — applies the same
   backup+insert if missing), `caddy validate`, then `sudo systemctl reload caddy`.

Optional gate: run `npm test` in `backend/` before the restart and abort on failure.

### Safety rules
- Never edit or remove the DHIS2 `handle` block; only add the `/arogya/api` route.
- Never `reload` Caddy unless `caddy validate` passes; always keep a timestamped backup.
- Use `systemctl reload caddy` (graceful, zero-downtime), not `restart`.
- Backend binds `127.0.0.1` only — never exposed publicly.

### pm2 ecosystem (`ecosystem.config.cjs`)
```
module.exports = {
  apps: [{
    name: "arogya-backend",
    script: "src/server.js",
    cwd: "/home/developper/arogya-entry/backend",
    instances: 1,
    exec_mode: "fork",
    max_memory_restart: "200M",
    env: {
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: "4000",
      AROGYA_DB_PATH: "/var/lib/arogya/arogya.db"
    }
  }]
};
```

---

## Testing

- Runner: Node built-in `node:test`; HTTP via `supertest`. `app.js` exports the app without
  `listen()`, so supertest drives it in-process.
- Tests use a **temporary SQLite DB** (`AROGYA_DB_PATH` → tmp file), seeded fresh — never the
  production DB. No network, no DHIS2 contact.

**Unit:**
- `triage.js` — high-risk for any of flags 1–5; normal otherwise; only-flag-5, only-flag-6,
  all-false ("None of the above").
- `arogyaId.js` — `AC-005-000001` formatting, 6-digit zero-pad, independent per-clinic
  increment.
- `validation.js` — rejects unknown clinic, `consent !== true`, wrong flags length/type,
  missing required patient fields; accepts a valid payload.

**Integration (supertest + temp DB):**
- `/clinics/validate`: known → `{valid:true, clinicName}`; unknown → `{valid:false}`; blank → 400.
- `/registration` happy path → 200, well-formed `arogyaId`, correct `triage`, localized
  `message`, row persisted; second submit to same clinic increments the ID.
- `/registration` triage: flag 1 set → `high-risk`; only flags 6–11 → `normal`.
- `/registration` invalid (consent false / bad flags / unknown clinic) → 400 plain text.

`npm test` → `node --test`.

---

## Out of scope

- DHIS2 integration (export/push). SQLite is the system of record for now; a later job can
  export.
- Auth / rate limiting (endpoints are same-origin, low-volume clinic use). Can be added later.
- Admin/reporting UI over the stored registrations.
- HTTPS termination / certs (Caddy already handles TLS).
