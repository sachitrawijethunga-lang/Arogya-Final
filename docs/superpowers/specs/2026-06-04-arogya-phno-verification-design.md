# Arogya PHNO Verification → DHIS2 — Design

**Status:** Approved (design). Implementation split into Spec A (build now) and Spec B (next).
**Date:** 2026-06-04

## Problem

Today the Arogya kiosk lets a patient scan their clinic QR, register, answer the
screening, and submit. The submission lands in the backend `registrations` table
and stops there. There is no second stage.

Each clinic has one **Public Health Nursing Officer (PHNO)**. She must be able to
log in, see the patients who registered **at her clinic**, review each record one
by one, correct mistakes, and **approve** (or reject) it. Every approved record
must then be packaged and pushed into the existing **DHIS2** instance (a Tracker
program) that runs the Arogya clinics. DHIS2's security and availability must never
be compromised (same hard constraint as all prior Arogya work).

## Decisions (from brainstorming)

| Decision | Choice |
|----------|--------|
| PHNO authentication | **Our own login** — hashed passwords + server-side sessions, each PHNO scoped to one clinic. |
| DHIS2 target | **Tracker program** — patient = Tracked Entity (person) + enrollment at the clinic org unit + screening event. |
| DHIS2 authorization | A single **service account** (Personal Access Token), server-side, used for the push. |
| PHNO actions | **Approve + Reject + Edit** (correct fields before approving), with an audit trail. |
| Build sequencing | **Phased: Layer A (portal) first, then Layer B (DHIS2 push).** Approve sets a record to a `approved`/ready state; when B lands, Approve also triggers the push. No rework. |
| Staff portal language | **English only** (internal tool). |
| Staff portal URL | `/arogya/staff` (no Caddy change needed). |

## Architecture overview

Two layers stacked on the patient record's lifecycle:

- **Layer A — PHNO portal:** login, per-clinic review queue, record detail, edit,
  approve/reject. Independently valuable and not blocked on DHIS2 metadata.
- **Layer B — DHIS2 push:** map an approved record → Tracker payload, push as the
  service account, idempotent retry. Needs real DHIS2 UIDs + token from the operator.

```
Patient kiosk  ──submit──▶  registrations (status=pending)
                                   │
                          PHNO logs in (own account, scoped to clinic)
                                   │
                    Queue ─▶ Detail ─▶ Edit (audited)
                                   │
                       Approve ────┴──── Reject (reason, audited)
                          │
              [Layer B] build Tracker payload ─▶ DHIS2 /api/tracker (service token)
                          │                         (idempotent, client UIDs)
                  status=approved + dhis2_status ok/failed (retry on failure)
```

The Express backend stays bound to `127.0.0.1:4000` behind Caddy. Staff API lives
under `/arogya/api/staff/*` (already proxied by the existing `/arogya/api` route).
The React SPA is already served at `/arogya/*`; the staff portal is the same bundle
rendered when the path is `/arogya/staff`.

---

## Layer A — PHNO portal (BUILD NOW)

### A.1 Data model (migration v3, via the existing `user_version` runner)

Extend `registrations`:
- `status TEXT NOT NULL DEFAULT 'pending'` — `pending | approved | rejected`
- `reviewed_by INTEGER` — FK `phno_users(id)`, null until reviewed
- `reviewed_at TEXT` — ISO timestamp, null until reviewed
- `reject_reason TEXT` — null unless rejected

(Existing rows back-fill to `status='pending'`, `reviewed_*` null. `ALTER TABLE ADD
COLUMN` is metadata-only and safe on the live DB.)

New tables:

```sql
CREATE TABLE phno_users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,      -- scrypt hash (hex)
  password_salt TEXT NOT NULL,      -- per-user salt (hex)
  clinic_id     TEXT NOT NULL REFERENCES clinics(clinic_id),
  full_name     TEXT NOT NULL,
  disabled      INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL
);

CREATE TABLE phno_sessions (
  token       TEXT PRIMARY KEY,     -- 256-bit random, hex
  user_id     INTEGER NOT NULL REFERENCES phno_users(id),
  created_at  TEXT NOT NULL,
  expires_at  TEXT NOT NULL         -- absolute expiry
);

CREATE TABLE registration_audit (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  registration_id INTEGER NOT NULL REFERENCES registrations(id),
  user_id         INTEGER NOT NULL REFERENCES phno_users(id),
  action          TEXT NOT NULL,    -- edit | approve | reject
  changes_json    TEXT,             -- for edits: { field: { from, to }, ... }
  reason          TEXT,             -- for reject
  created_at      TEXT NOT NULL
);
CREATE INDEX idx_audit_registration ON registration_audit(registration_id);
CREATE INDEX idx_sessions_user ON phno_sessions(user_id);
```

### A.2 Authentication

- **Hashing:** Node built-in `crypto.scryptSync(password, salt, 64)` with a 16-byte
  random salt per user; compare with `crypto.timingSafeEqual`. No new native deps.
- **Sessions:** `crypto.randomBytes(32).toString("hex")` token, stored in
  `phno_sessions` with an absolute `expires_at` (default **12 hours**). Delivered as
  cookie `arogya_session`: `HttpOnly; Secure; SameSite=Strict; Path=/arogya`.
  Logout deletes the session row and clears the cookie. Expired sessions are
  rejected and lazily deleted.
- **Cookie parsing:** parse the single `arogya_session` cookie from the `Cookie`
  header manually (no `cookie-parser` dependency).
- **`requireAuth` middleware:** loads session→user, attaches `req.phno = { id,
  clinicId, fullName }`; 401 if missing/expired/disabled. Applied to all
  `/staff/*` routes except `login`.
- **Per-clinic authorization:** queue queries filter `WHERE clinic_id = req.phno.clinicId`;
  every single-record route verifies the record's `clinic_id === req.phno.clinicId`
  and returns 403 otherwise.
- **Login rate-limiting:** in-memory throttle keyed by username+IP (e.g. 5 attempts
  / 15 min, then temporary lockout). Generic "invalid credentials" message (no user
  enumeration).
- **Account creation:** `backend/scripts/create-phno.js` CLI —
  `node scripts/create-phno.js --clinic AC-002 --username nimasha --name "..."`,
  prompts for a password (hidden input), validates the clinic exists, inserts the
  hashed user. No public signup endpoint.

### A.3 Staff API (`/arogya/api/staff/*`)

| Method/Path | Auth | Purpose |
|-------------|------|---------|
| `POST /staff/login` | none | `{username,password}` → set cookie, return `{fullName, clinicId, clinicName}` |
| `POST /staff/logout` | yes | delete session + clear cookie |
| `GET  /staff/me` | yes | current user `{fullName, clinicId, clinicName}` (for session bootstrap) |
| `GET  /staff/registrations?status=&q=` | yes | her clinic's records, filtered by status + search; newest first |
| `GET  /staff/registrations/:id` | yes | one record (patient + screening + triage + audit), clinic-checked |
| `PATCH /staff/registrations/:id` | yes | edit patient fields (validated) → writes `edit` audit entry |
| `POST /staff/registrations/:id/approve` | yes | `pending→approved`, sets reviewed_*, writes `approve` audit (Layer B: also push) |
| `POST /staff/registrations/:id/reject` | yes | `pending→rejected` with `{reason}`, writes `reject` audit |

Editing is allowed only while `status='pending'`. Approve/reject only from `pending`
(idempotent: re-approving an approved record is a no-op returning current state).
Edits reuse the existing backend `validation.js` rules; an edited record stores the
updated `patient_json` and recomputes nothing about triage unless screening flags
change (screening is not editable in v1 — only patient profile fields).

### A.4 Frontend (staff portal)

- **Top-level split** in `main.tsx`/`App`: if `window.location.pathname` starts with
  the staff base (`/arogya/staff`), render `<StaffApp/>`; otherwise the existing
  kiosk `<App/>`. Staff sub-navigation (login → queue → detail → edit) is internal
  React state — no router dependency.
- **Screens:**
  1. **Login** — username/password, error on failure, calls `/staff/login`.
  2. **Queue** — filter tabs (Pending default / Approved / Rejected / All), search box
     (name·NIC·Arogya ID), rows show Arogya ID, name, NIC, created time, triage badge
     (high-risk in red), status chip. Newest first.
  3. **Detail** — all patient fields + screening answers + triage + audit history;
     **Edit / Approve / Reject** buttons (Reject opens a reason prompt). Approve/Reject
     disabled unless `pending`.
  4. **Edit** — form reusing the existing field components + `frontend` validation;
     Save → `PATCH`, returns to Detail.
- **Session bootstrap:** on load, `GET /staff/me`; 401 → show Login.
- **Style:** reuse the Arogya green design tokens, denser desktop/tablet layout.
- **Language:** English only.

### A.5 Testing (Layer A, TDD)

Backend (`node:test` + supertest):
- password hash/verify (correct, wrong, timing-safe), salt uniqueness
- login: success sets cookie; wrong password 401; disabled user 401; rate-limit lockout
- session: valid cookie authorizes; missing/expired/garbage → 401; logout invalidates
- scoping: PHNO of clinic X gets 403 on a clinic-Y record; queue excludes other clinics
- queue: status filter + search; newest-first ordering
- edit: valid PATCH updates patient_json + writes audit; invalid fails validation; edit on non-pending rejected
- approve/reject: state transitions, audit rows, reviewed_*; reject requires reason; idempotent re-approve
- migration v3: schema at version 3, new columns/tables/indexes present

Frontend (`vitest`): queue filter/search pure logic; reuse of validation; light component checks.

---

## Layer B — DHIS2 push (NEXT SPEC, after metadata is available)

Specced at architecture level here; gets its own spec + plan once the operator
provides DHIS2 metadata and a service token.

### B.1 Config & mapping (operator-provided, no code changes)

- `backend/config/dhis2.config.json` (perms `0600`, git-ignored): `{ baseUrl,
  patToken }` — a DHIS2 **Personal Access Token** for the service account.
- `backend/config/dhis2.mapping.json`: `{ trackedEntityType, program, programStage,
  attributes: { fullName: "<uid>", nic: "<uid>", ... }, dataElements: { screening_1:
  "<uid>", ..., triage: "<uid>" }, orgUnitByClinic: { "AC-002": "<uid>", ... } }`.

### B.2 Push engine

- On Approve (sync): build a `/api/tracker` payload — one `trackedEntity` (with
  attributes), one `enrollment` at the clinic's org unit, one `event` in the
  screening stage carrying the answers + triage.
- **Idempotency:** generate stable DHIS2 UIDs (11-char) for TEI/enrollment/event on
  our side, store them on the record, push with `importStrategy=CREATE_AND_UPDATE`.
  Re-push of the same record updates rather than duplicates.
- Persist `dhis2_tei_uid`, `dhis2_pushed_at`, `dhis2_status` (`ok|failed`),
  `dhis2_error`. On failure the PHNO sees "push failed — retry"; a
  `POST /staff/registrations/:id/push` retry endpoint re-runs it.
- Token never logged (Phase-0 PII-safe logging already enforces this).

### B.3 Testing (Layer B)

- Mapping: record → expected Tracker JSON (snapshot).
- Idempotency: two pushes of the same record reuse the same UIDs.
- Failure: DHIS2 returns error/timeout → record marked failed, no crash, retry works.
- Tested against a **fake DHIS2 HTTP server** in CI; validated against the real
  instance at rollout.

---

## Constraints honored

- DHIS2 reverse-proxy / Caddy DHIS2 block never touched; only the existing
  `/arogya/api` route serves the staff API.
- Backend binds `127.0.0.1` only.
- All patient PII shown only to an authenticated PHNO, scoped to her own clinic.
- Service token at rest in a `0600`, git-ignored file; never logged.
- Append-only versioned migrations; safe on the live populated DB.

## Out of scope (v1)

- Editing screening answers (only patient profile fields are editable).
- Multiple PHNOs per clinic / role hierarchy / admin web UI (accounts via CLI).
- Trilingual staff portal.
- Password reset flow (operator re-runs the CLI to set a new password).
- Bulk approve.
