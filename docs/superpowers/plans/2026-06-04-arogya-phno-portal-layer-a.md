# Arogya PHNO Portal (Layer A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each clinic's PHNO an authenticated portal to review the patients who registered at her clinic and Approve / Reject / Edit each record, with a full audit trail — everything except the DHIS2 push (Layer B).

**Architecture:** Extend the existing Express 5 + better-sqlite3 backend with a `/staff/*` API behind a cookie-session auth layer (scrypt passwords, server-side sessions, per-clinic authorization, login throttling). Add migration v3 for the record lifecycle (`status`, review fields) plus `phno_users`, `phno_sessions`, `registration_audit` tables. The existing React SPA gains a second top-level app (`StaffApp`) rendered when the URL path ends in `/staff`; it talks to the staff API with `credentials: "include"`.

**Tech Stack:** Backend Node v24 ESM, Express 5, better-sqlite3, `node:crypto` (scrypt + sessions — no new deps), `node:test` + supertest. Frontend React 19 + TS + Vite + vitest. Source-of-truth spec: `docs/superpowers/specs/2026-06-04-arogya-phno-verification-design.md` (Layer A).

---

## Conventions
- Backend commands run from `/home/developper/arogya-entry/backend`; frontend from `/home/developper/arogya-entry/frontend`.
- ESM default imports: `import express from "express"`, `import Database from "better-sqlite3"`.
- One commit per task. Do NOT run `go-live.sh`, pm2, sudo, or touch `/var/www`, `/var/lib/arogya`, or Caddy.
- Cookie name is `arogya_session` everywhere. Session TTL is 12 hours. Cookie is always `httpOnly` + `sameSite: "strict"`. `secure` and `path` are **environment-keyed**: in production (`NODE_ENV=production`, which the pm2 ecosystem sets) the cookie is `Secure; Path=/arogya` (so the browser scopes it to `/arogya/*` and never sends it to the co-hosted DHIS2 paths); otherwise (tests, local `node src/server.js`) it is non-secure with `Path=/` so supertest/curl over http resend it. Both `res.cookie` and `res.clearCookie` must use the same `COOKIE_PATH`.
- All staff routes live under the path the router is mounted at (`/staff`), so the full public path is `/arogya/api/staff/...`.

## File Structure Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/src/db.js` | Modify | Migration v3: lifecycle columns + new tables |
| `backend/test/db.test.js` | Modify | Assert schema v3 |
| `backend/src/lib/password.js` | Create | scrypt hash/verify |
| `backend/test/password.test.js` | Create | Hash/verify tests |
| `backend/src/lib/phnoUsers.js` | Create | Create/find PHNO users (used by login + CLI) |
| `backend/test/phnoUsers.test.js` | Create | User create/find tests |
| `backend/src/lib/session.js` | Create | Session create/lookup/delete + cookie parse |
| `backend/test/session.test.js` | Create | Session + cookie-parse tests |
| `backend/src/lib/loginThrottle.js` | Create | In-memory login rate limiter |
| `backend/test/loginThrottle.test.js` | Create | Throttle tests |
| `backend/src/lib/validation.js` | Modify | Extract `validatePatientFields` (DRY) |
| `backend/src/routes/staff.js` | Create | `staffRouter(db)`: auth + queue + detail + edit + approve/reject |
| `backend/test/staff.auth.test.js` | Create | Login/logout/me/session/scoping tests |
| `backend/test/staff.queue.test.js` | Create | Queue + detail tests |
| `backend/test/staff.review.test.js` | Create | Edit + approve + reject tests |
| `backend/test/helpers.js` | Modify | Add `seedPhno`, `insertRegistration`, `loginAgent` helpers |
| `backend/src/app.js` | Modify | Mount `staffRouter` at `/staff` |
| `backend/scripts/create-phno.js` | Create | Admin CLI to create a PHNO account |
| `frontend/src/staff/types.ts` | Create | Staff DTO types |
| `frontend/src/staff/staffApi.ts` | Create | Staff API client (cookie creds) |
| `frontend/src/staff/StaffApp.tsx` | Create | Staff shell + auth bootstrap + view routing |
| `frontend/src/staff/LoginScreen.tsx` | Create | Login form |
| `frontend/src/staff/QueueScreen.tsx` | Create | Filter tabs + search + list |
| `frontend/src/staff/DetailScreen.tsx` | Create | Record detail + approve/reject |
| `frontend/src/staff/EditScreen.tsx` | Create | Edit patient fields |
| `frontend/src/staff/queueFilter.ts` | Create | Pure client-side search/sort helper |
| `frontend/src/staff/queueFilter.test.ts` | Create | Vitest for the helper |
| `frontend/src/main.tsx` | Modify | Render `StaffApp` when path ends in `/staff` |

---

### Task 1: Migration v3 — record lifecycle + PHNO tables (backend, TDD)

**Files:**
- Modify: `backend/src/db.js`
- Modify: `backend/test/db.test.js`

- [ ] **Step 1: Add the failing test** — append to `backend/test/db.test.js`:

```js
test("schema is at version 3 with lifecycle columns and phno tables", () => {
  const db = freshDb();
  assert.equal(db.pragma("user_version", { simple: true }), 3);
  const regCols = db.prepare("PRAGMA table_info(registrations)").all().map((c) => c.name);
  for (const c of ["status", "reviewed_by", "reviewed_at", "reject_reason"]) {
    assert.ok(regCols.includes(c), `registrations.${c} missing`);
  }
  const tables = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table'")
    .all()
    .map((t) => t.name);
  for (const t of ["phno_users", "phno_sessions", "registration_audit"]) {
    assert.ok(tables.includes(t), `table ${t} missing`);
  }
  // status defaults to 'pending' for new rows
  db.prepare(
    `INSERT INTO registrations
       (arogya_id, clinic_id, language, patient_json, screening_flags, triage, consent, created_at)
     VALUES ('AC-005-000099','AC-005','en','{}','[]','normal',1,'2026-01-01T00:00:00Z')`
  ).run();
  assert.equal(
    db.prepare("SELECT status FROM registrations WHERE arogya_id='AC-005-000099'").get().status,
    "pending"
  );
});
```

- [ ] **Step 2: Run it (fails)** — `node --test test/db.test.js` → FAIL (user_version 2).

- [ ] **Step 3: Add the v3 block to `backend/src/db.js`** — inside `migrate(db)`, immediately after the `if (version < 2) { ... }` block, add:

```js
  if (version < 3) {
    db.exec(`
      ALTER TABLE registrations ADD COLUMN status TEXT NOT NULL DEFAULT 'pending';
      ALTER TABLE registrations ADD COLUMN reviewed_by INTEGER;
      ALTER TABLE registrations ADD COLUMN reviewed_at TEXT;
      ALTER TABLE registrations ADD COLUMN reject_reason TEXT;

      CREATE TABLE phno_users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        username      TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        clinic_id     TEXT NOT NULL REFERENCES clinics(clinic_id),
        full_name     TEXT NOT NULL,
        disabled      INTEGER NOT NULL DEFAULT 0,
        created_at    TEXT NOT NULL
      );

      CREATE TABLE phno_sessions (
        token      TEXT PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES phno_users(id),
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );

      CREATE TABLE registration_audit (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        registration_id INTEGER NOT NULL REFERENCES registrations(id),
        user_id         INTEGER NOT NULL REFERENCES phno_users(id),
        action          TEXT NOT NULL,
        changes_json    TEXT,
        reason          TEXT,
        created_at      TEXT NOT NULL
      );

      CREATE INDEX idx_reg_clinic_status_created ON registrations(clinic_id, status, created_at);
      CREATE INDEX idx_audit_registration ON registration_audit(registration_id);
      CREATE INDEX idx_sessions_user ON phno_sessions(user_id);
    `);
    db.pragma("user_version = 3");
    version = 3;
  }
```

- [ ] **Step 4: Run it (passes)** — `node --test test/db.test.js` → PASS.

- [ ] **Step 5: Run full suite** — `npm test` → all green (existing + new).

- [ ] **Step 6: Commit**

```bash
git add src/db.js test/db.test.js
git commit -m "feat(db): migration v3 — record lifecycle (status/review) + phno_users/sessions/audit tables"
```

---

### Task 2: Password hashing library (backend, TDD)

**Files:**
- Create: `backend/src/lib/password.js`
- Create: `backend/test/password.test.js`

- [ ] **Step 1: Write the failing test** — `backend/test/password.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/lib/password.js";

test("hashPassword returns distinct salt+hash each call", () => {
  const a = hashPassword("correct horse");
  const b = hashPassword("correct horse");
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.match(a.hash, /^[0-9a-f]+$/);
  assert.match(a.salt, /^[0-9a-f]+$/);
});

test("verifyPassword accepts the right password and rejects wrong ones", () => {
  const { hash, salt } = hashPassword("s3cret!");
  assert.equal(verifyPassword("s3cret!", hash, salt), true);
  assert.equal(verifyPassword("s3cret", hash, salt), false);
  assert.equal(verifyPassword("", hash, salt), false);
});

test("verifyPassword is safe against malformed stored values", () => {
  assert.equal(verifyPassword("x", "", ""), false);
  assert.equal(verifyPassword("x", "zz", "salt"), false);
});
```

- [ ] **Step 2: Run it (fails)** — `node --test test/password.test.js` → FAIL (module missing).

- [ ] **Step 3: Create `backend/src/lib/password.js`**:

```js
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;

// Hash a plaintext password with a fresh random salt (scrypt).
export function hashPassword(plain) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(plain), salt, KEYLEN).toString("hex");
  return { hash, salt };
}

// Constant-time verify. Returns false on any malformed stored value.
export function verifyPassword(plain, hash, salt) {
  if (typeof hash !== "string" || typeof salt !== "string" || hash.length === 0) {
    return false;
  }
  let expected;
  try {
    expected = Buffer.from(hash, "hex");
  } catch {
    return false;
  }
  if (expected.length !== KEYLEN) return false;
  const actual = scryptSync(String(plain), salt, KEYLEN);
  return timingSafeEqual(actual, expected);
}
```

- [ ] **Step 4: Run it (passes)** — `node --test test/password.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/password.js test/password.test.js
git commit -m "feat(auth): scrypt password hashing lib (no new deps)"
```

---

### Task 3: PHNO users library (backend, TDD)

**Files:**
- Create: `backend/src/lib/phnoUsers.js`
- Create: `backend/test/phnoUsers.test.js`

- [ ] **Step 1: Write the failing test** — `backend/test/phnoUsers.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import { createPhnoUser, findPhnoByUsername } from "../src/lib/phnoUsers.js";

test("createPhnoUser inserts a hashed user and findPhnoByUsername returns it", () => {
  const db = freshDb();
  const user = createPhnoUser(db, {
    username: "nimasha",
    password: "s3cret!",
    clinicId: "AC-005",
    fullName: "Nimasha P.",
  });
  assert.ok(user.id > 0);
  const found = findPhnoByUsername(db, "nimasha");
  assert.equal(found.username, "nimasha");
  assert.equal(found.clinic_id, "AC-005");
  assert.notEqual(found.password_hash, "s3cret!"); // stored hashed
});

test("createPhnoUser rejects an unknown clinic", () => {
  const db = freshDb();
  assert.throws(
    () => createPhnoUser(db, { username: "x", password: "y", clinicId: "NOPE", fullName: "X" }),
    /clinic/i
  );
});

test("createPhnoUser rejects a duplicate username", () => {
  const db = freshDb();
  createPhnoUser(db, { username: "dup", password: "a", clinicId: "AC-005", fullName: "A" });
  assert.throws(
    () => createPhnoUser(db, { username: "dup", password: "b", clinicId: "AC-005", fullName: "B" }),
    /exists/i
  );
});

test("findPhnoByUsername returns undefined for unknown user", () => {
  const db = freshDb();
  assert.equal(findPhnoByUsername(db, "ghost"), undefined);
});
```

- [ ] **Step 2: Run it (fails)** — `node --test test/phnoUsers.test.js` → FAIL.

- [ ] **Step 3: Create `backend/src/lib/phnoUsers.js`**:

```js
import { hashPassword } from "./password.js";

// Create a PHNO account (used by the login admin CLI and tests).
// Throws on unknown clinic or duplicate username.
export function createPhnoUser(db, { username, password, clinicId, fullName }) {
  const clinic = db.prepare("SELECT 1 AS one FROM clinics WHERE clinic_id = ?").get(clinicId);
  if (!clinic) throw new Error(`Unknown clinic: ${clinicId}`);
  if (findPhnoByUsername(db, username)) throw new Error(`Username already exists: ${username}`);

  const { hash, salt } = hashPassword(password);
  const info = db
    .prepare(
      `INSERT INTO phno_users (username, password_hash, password_salt, clinic_id, full_name, created_at)
       VALUES (@username, @hash, @salt, @clinicId, @fullName, @createdAt)`
    )
    .run({
      username,
      hash,
      salt,
      clinicId,
      fullName,
      createdAt: new Date().toISOString(),
    });
  return { id: Number(info.lastInsertRowid), username, clinicId, fullName };
}

export function findPhnoByUsername(db, username) {
  return db.prepare("SELECT * FROM phno_users WHERE username = ?").get(username);
}
```

- [ ] **Step 4: Run it (passes)** — `node --test test/phnoUsers.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/phnoUsers.js test/phnoUsers.test.js
git commit -m "feat(auth): phnoUsers lib — create/find PHNO accounts (clinic-validated, unique username)"
```

---

### Task 4: Session library + cookie helpers (backend, TDD)

**Files:**
- Create: `backend/src/lib/session.js`
- Create: `backend/test/session.test.js`

- [ ] **Step 1: Write the failing test** — `backend/test/session.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import { createPhnoUser } from "../src/lib/phnoUsers.js";
import {
  COOKIE_NAME,
  createSession,
  getSessionUser,
  deleteSession,
  parseCookie,
} from "../src/lib/session.js";

function makeUser(db) {
  return createPhnoUser(db, {
    username: "u",
    password: "p",
    clinicId: "AC-005",
    fullName: "U",
  });
}

test("createSession then getSessionUser returns the joined user", () => {
  const db = freshDb();
  const user = makeUser(db);
  const token = createSession(db, user.id);
  assert.match(token, /^[0-9a-f]{64}$/);
  const sessUser = getSessionUser(db, token);
  assert.equal(sessUser.id, user.id);
  assert.equal(sessUser.clinic_id, "AC-005");
});

test("getSessionUser returns null for unknown/garbage token", () => {
  const db = freshDb();
  assert.equal(getSessionUser(db, "nope"), null);
  assert.equal(getSessionUser(db, ""), null);
});

test("expired session is rejected and deleted", () => {
  const db = freshDb();
  const user = makeUser(db);
  const token = createSession(db, user.id, -1000); // already expired
  assert.equal(getSessionUser(db, token), null);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM phno_sessions").get().c, 0);
});

test("deleteSession removes the row", () => {
  const db = freshDb();
  const user = makeUser(db);
  const token = createSession(db, user.id);
  deleteSession(db, token);
  assert.equal(getSessionUser(db, token), null);
});

test("disabled user's session does not authorize", () => {
  const db = freshDb();
  const user = makeUser(db);
  const token = createSession(db, user.id);
  db.prepare("UPDATE phno_users SET disabled = 1 WHERE id = ?").run(user.id);
  assert.equal(getSessionUser(db, token), null);
});

test("parseCookie extracts a named cookie from a header", () => {
  assert.equal(parseCookie("a=1; arogya_session=abc; b=2", COOKIE_NAME), "abc");
  assert.equal(parseCookie("", COOKIE_NAME), null);
  assert.equal(parseCookie(undefined, COOKIE_NAME), null);
  assert.equal(parseCookie("other=1", COOKIE_NAME), null);
});
```

- [ ] **Step 2: Run it (fails)** — `node --test test/session.test.js` → FAIL.

- [ ] **Step 3: Create `backend/src/lib/session.js`**:

```js
import { randomBytes } from "node:crypto";

export const COOKIE_NAME = "arogya_session";
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Create a server-side session, returning the opaque token.
export function createSession(db, userId, ttlMs = DEFAULT_TTL_MS) {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  db.prepare(
    `INSERT INTO phno_sessions (token, user_id, created_at, expires_at)
     VALUES (@token, @userId, @createdAt, @expiresAt)`
  ).run({
    token,
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
  });
  return token;
}

// Resolve a token to its (active, non-disabled) user, or null.
// Lazily deletes an expired session.
export function getSessionUser(db, token) {
  if (typeof token !== "string" || token.length === 0) return null;
  const sess = db.prepare("SELECT * FROM phno_sessions WHERE token = ?").get(token);
  if (!sess) return null;
  if (new Date(sess.expires_at).getTime() <= Date.now()) {
    deleteSession(db, token);
    return null;
  }
  const user = db
    .prepare("SELECT * FROM phno_users WHERE id = ? AND disabled = 0")
    .get(sess.user_id);
  return user || null;
}

export function deleteSession(db, token) {
  db.prepare("DELETE FROM phno_sessions WHERE token = ?").run(token);
}

// Parse a single named cookie value out of a Cookie header.
export function parseCookie(header, name) {
  if (typeof header !== "string" || header.length === 0) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}
```

- [ ] **Step 4: Run it (passes)** — `node --test test/session.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/session.js test/session.test.js
git commit -m "feat(auth): server-side sessions + cookie parsing (12h TTL, lazy-expire, disabled-user safe)"
```

---

### Task 5: Login throttle (backend, TDD)

**Files:**
- Create: `backend/src/lib/loginThrottle.js`
- Create: `backend/test/loginThrottle.test.js`

- [ ] **Step 1: Write the failing test** — `backend/test/loginThrottle.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { createThrottle } from "../src/lib/loginThrottle.js";

test("allows up to max failures, then blocks", () => {
  const t = createThrottle({ max: 3, windowMs: 10000 });
  assert.equal(t.isBlocked("k"), false);
  t.recordFailure("k");
  t.recordFailure("k");
  assert.equal(t.isBlocked("k"), false); // 2 < 3
  t.recordFailure("k");
  assert.equal(t.isBlocked("k"), true); // 3 >= 3
});

test("reset clears a key (used on successful login)", () => {
  const t = createThrottle({ max: 1, windowMs: 10000 });
  t.recordFailure("k");
  assert.equal(t.isBlocked("k"), true);
  t.reset("k");
  assert.equal(t.isBlocked("k"), false);
});

test("the window expires failures", () => {
  let now = 1000;
  const t = createThrottle({ max: 1, windowMs: 500, now: () => now });
  t.recordFailure("k");
  assert.equal(t.isBlocked("k"), true);
  now = 1600; // past the window
  assert.equal(t.isBlocked("k"), false);
});

test("keys are independent", () => {
  const t = createThrottle({ max: 1, windowMs: 10000 });
  t.recordFailure("a");
  assert.equal(t.isBlocked("a"), true);
  assert.equal(t.isBlocked("b"), false);
});
```

- [ ] **Step 2: Run it (fails)** — `node --test test/loginThrottle.test.js` → FAIL.

- [ ] **Step 3: Create `backend/src/lib/loginThrottle.js`**:

```js
// In-memory login rate limiter. Keyed by an arbitrary string (e.g. username|ip).
// Not shared across processes — fine for the single-process pm2 deployment.
export function createThrottle({ max = 5, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const hits = new Map(); // key -> array of failure timestamps

  function recent(key) {
    const cutoff = now() - windowMs;
    const arr = (hits.get(key) || []).filter((t) => t > cutoff);
    if (arr.length > 0) hits.set(key, arr);
    else hits.delete(key);
    return arr;
  }

  return {
    isBlocked(key) {
      return recent(key).length >= max;
    },
    recordFailure(key) {
      const arr = recent(key);
      arr.push(now());
      hits.set(key, arr);
    },
    reset(key) {
      hits.delete(key);
    },
  };
}
```

- [ ] **Step 4: Run it (passes)** — `node --test test/loginThrottle.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/loginThrottle.js test/loginThrottle.test.js
git commit -m "feat(auth): in-memory login throttle (max attempts per window)"
```

---

### Task 6: Test helpers for staff routes (backend)

**Files:**
- Modify: `backend/test/helpers.js`

- [ ] **Step 1: Add helpers** — replace the contents of `backend/test/helpers.js` with:

```js
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";
import { createPhnoUser } from "../src/lib/phnoUsers.js";

// Opens a fresh, seeded SQLite database in a unique temp directory.
export function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), "arogya-test-"));
  return openDb(join(dir, "test.db"));
}

// Create a PHNO user for tests (defaults to clinic AC-005).
export function seedPhno(db, overrides = {}) {
  return createPhnoUser(db, {
    username: "phno",
    password: "pass1234",
    clinicId: "AC-005",
    fullName: "Test PHNO",
    ...overrides,
  });
}

// Insert a registration row directly (bypassing the patient route) for staff tests.
export function insertRegistration(db, overrides = {}) {
  const row = {
    arogyaId: "AC-005-000001",
    clinicId: "AC-005",
    language: "en",
    patient: { fullName: "Nimal Perera", nic: "199012345678", phn: "", gender: "male",
      dateOfBirth: "1990-01-01", householdAddress: "", relationshipToHead: null,
      gnDivision: null, mobile: "0771234567", maritalStatus: null, occupation: null, education: null },
    flags: Array(11).fill(false),
    triage: "normal",
    status: "pending",
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
  const info = db
    .prepare(
      `INSERT INTO registrations
         (arogya_id, clinic_id, language, patient_json, screening_flags, triage, consent, created_at, status)
       VALUES (@arogyaId, @clinicId, @language, @patientJson, @flags, @triage, 1, @createdAt, @status)`
    )
    .run({
      arogyaId: row.arogyaId,
      clinicId: row.clinicId,
      language: row.language,
      patientJson: JSON.stringify(row.patient),
      flags: JSON.stringify(row.flags),
      triage: row.triage,
      createdAt: row.createdAt,
      status: row.status,
    });
  return Number(info.lastInsertRowid);
}

// Log a supertest agent in; returns the agent (with the session cookie jar).
export async function loginAgent(request, app, username = "phno", password = "pass1234") {
  const agent = request.agent(app);
  await agent.post("/staff/login").send({ username, password });
  return agent;
}
```

- [ ] **Step 2: Sanity-run an existing suite** — `node --test test/registration.route.test.js` → still PASS (helpers.js stays backward compatible; `freshDb` unchanged).

- [ ] **Step 3: Commit**

```bash
git add test/helpers.js
git commit -m "test(staff): add seedPhno/insertRegistration/loginAgent helpers"
```

---

### Task 7: Staff auth routes + requireAuth + mount (backend, TDD)

**Files:**
- Create: `backend/src/routes/staff.js`
- Modify: `backend/src/app.js`
- Create: `backend/test/staff.auth.test.js`

- [ ] **Step 1: Write the failing test** — `backend/test/staff.auth.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { freshDb, seedPhno } from "./helpers.js";
import { createApp } from "../src/app.js";

test("login with correct credentials sets a session cookie and returns the user", async () => {
  const db = freshDb();
  seedPhno(db);
  const app = createApp(db);
  const res = await request(app).post("/staff/login").send({ username: "phno", password: "pass1234" });
  assert.equal(res.status, 200);
  assert.equal(res.body.clinicId, "AC-005");
  assert.equal(res.body.fullName, "Test PHNO");
  assert.match(String(res.headers["set-cookie"]), /arogya_session=/);
  assert.match(String(res.headers["set-cookie"]), /HttpOnly/i);
});

test("login with wrong password is 401 and sets no cookie", async () => {
  const db = freshDb();
  seedPhno(db);
  const app = createApp(db);
  const res = await request(app).post("/staff/login").send({ username: "phno", password: "WRONG" });
  assert.equal(res.status, 401);
  assert.equal(res.headers["set-cookie"], undefined);
});

test("unknown username is 401 (no user enumeration)", async () => {
  const db = freshDb();
  const app = createApp(db);
  const res = await request(app).post("/staff/login").send({ username: "ghost", password: "x" });
  assert.equal(res.status, 401);
});

test("repeated failures get throttled (429)", async () => {
  const db = freshDb();
  seedPhno(db);
  const app = createApp(db);
  for (let i = 0; i < 5; i++) {
    await request(app).post("/staff/login").send({ username: "phno", password: "WRONG" });
  }
  const res = await request(app).post("/staff/login").send({ username: "phno", password: "WRONG" });
  assert.equal(res.status, 429);
});

test("GET /staff/me requires auth (401 without cookie, 200 with)", async () => {
  const db = freshDb();
  seedPhno(db);
  const app = createApp(db);
  const noauth = await request(app).get("/staff/me");
  assert.equal(noauth.status, 401);

  const agent = request.agent(app);
  await agent.post("/staff/login").send({ username: "phno", password: "pass1234" });
  const me = await agent.get("/staff/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.clinicId, "AC-005");
});

test("logout invalidates the session", async () => {
  const db = freshDb();
  seedPhno(db);
  const app = createApp(db);
  const agent = request.agent(app);
  await agent.post("/staff/login").send({ username: "phno", password: "pass1234" });
  await agent.post("/staff/logout");
  const me = await agent.get("/staff/me");
  assert.equal(me.status, 401);
});
```

- [ ] **Step 2: Run it (fails)** — `node --test test/staff.auth.test.js` → FAIL (no `/staff` routes).

- [ ] **Step 3: Create `backend/src/routes/staff.js`** (auth portion; later tasks append queue/review routes to this same file):

```js
import express from "express";
import { findPhnoByUsername } from "../lib/phnoUsers.js";
import { verifyPassword } from "../lib/password.js";
import {
  COOKIE_NAME,
  createSession,
  getSessionUser,
  deleteSession,
  parseCookie,
} from "../lib/session.js";
import { createThrottle } from "../lib/loginThrottle.js";

// In production (NODE_ENV=production, set by the pm2 ecosystem) the cookie is
// Secure and scoped to /arogya so the browser never sends it to the co-hosted
// DHIS2 paths. In tests/local http it must be non-secure and Path=/ so the
// supertest agent / curl jar resend it (the backend itself serves /staff, not
// /arogya/... — Caddy strips the /arogya/api prefix in production).
const IS_PROD = process.env.NODE_ENV === "production";
const COOKIE_PATH = IS_PROD ? "/arogya" : "/";
const COOKIE_OPTS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: "strict",
  path: COOKIE_PATH,
  maxAge: 12 * 60 * 60 * 1000,
};

export function staffRouter(db) {
  const router = express.Router();
  const throttle = createThrottle({ max: 5, windowMs: 15 * 60 * 1000 });

  function publicUser(u) {
    const clinic = db.prepare("SELECT name FROM clinics WHERE clinic_id = ?").get(u.clinic_id);
    return { fullName: u.full_name, clinicId: u.clinic_id, clinicName: clinic ? clinic.name : null };
  }

  // Auth gate for every route except /login.
  function requireAuth(req, res, next) {
    const token = parseCookie(req.headers.cookie, COOKIE_NAME);
    const user = getSessionUser(db, token);
    if (!user) {
      res.status(401).type("text/plain").send("Authentication required.");
      return;
    }
    req.phno = { id: user.id, clinicId: user.clinic_id, fullName: user.full_name };
    next();
  }

  router.post("/login", (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const key = `${username}|${req.ip}`;

    if (throttle.isBlocked(key)) {
      res.status(429).type("text/plain").send("Too many attempts. Please try again later.");
      return;
    }

    const user = username ? findPhnoByUsername(db, username) : undefined;
    const ok =
      user && user.disabled === 0 && verifyPassword(password, user.password_hash, user.password_salt);
    if (!ok) {
      throttle.recordFailure(key);
      res.status(401).type("text/plain").send("Invalid username or password.");
      return;
    }

    throttle.reset(key);
    const token = createSession(db, user.id);
    res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
    res.json(publicUser(user));
  });

  router.post("/logout", requireAuth, (req, res) => {
    const token = parseCookie(req.headers.cookie, COOKIE_NAME);
    if (token) deleteSession(db, token);
    res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
    res.json({ ok: true });
  });

  router.get("/me", requireAuth, (req, res) => {
    const user = db.prepare("SELECT * FROM phno_users WHERE id = ?").get(req.phno.id);
    res.json(publicUser(user));
  });

  // ---- queue/detail/review routes are appended in later tasks, BEFORE `return router` ----

  // Expose for later tasks in the same file:
  router.requireAuth = requireAuth;
  return router;
}
```

> Note for later tasks: add the queue/detail/edit/approve/reject routes inside `staffRouter`, above the `return router;` line, reusing the local `requireAuth` function. The `router.requireAuth = requireAuth` line is only so the structure is obvious; later tasks reference the in-scope `requireAuth` directly.

- [ ] **Step 4: Mount it in `backend/src/app.js`** — add the import and the `app.use` line:

Add after the other route imports (line 3 area):
```js
import { staffRouter } from "./routes/staff.js";
```
Add after the `app.use("/registration", ...)` line:
```js
  app.use("/staff", staffRouter(db));
```

- [ ] **Step 5: Run it (passes)** — `node --test test/staff.auth.test.js` → PASS (6 tests).

- [ ] **Step 6: Run full suite** — `npm test` → all green.

- [ ] **Step 7: Commit**

```bash
git add src/routes/staff.js src/app.js test/staff.auth.test.js
git commit -m "feat(staff): login/logout/me + cookie-session auth + login throttle, mounted at /staff"
```

---

### Task 8: Queue + detail routes with per-clinic scoping (backend, TDD)

**Files:**
- Modify: `backend/src/routes/staff.js`
- Create: `backend/test/staff.queue.test.js`

- [ ] **Step 1: Write the failing test** — `backend/test/staff.queue.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { freshDb, seedPhno, insertRegistration, loginAgent } from "./helpers.js";
import { createApp } from "../src/app.js";

test("queue returns only the PHNO's clinic, newest first, filtered by status", async () => {
  const db = freshDb();
  seedPhno(db); // AC-005
  insertRegistration(db, { arogyaId: "AC-005-000001", createdAt: "2026-01-01T00:00:00Z" });
  insertRegistration(db, { arogyaId: "AC-005-000002", createdAt: "2026-01-02T00:00:00Z" });
  insertRegistration(db, { arogyaId: "AC-006-000001", clinicId: "AC-006" }); // other clinic
  const app = createApp(db);
  const agent = await loginAgent(request, app);

  const res = await agent.get("/staff/registrations");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2); // only AC-005
  assert.equal(res.body[0].arogyaId, "AC-005-000002"); // newest first
  assert.ok("fullName" in res.body[0] && "triage" in res.body[0] && "status" in res.body[0]);
});

test("queue status filter and search", async () => {
  const db = freshDb();
  seedPhno(db);
  insertRegistration(db, { arogyaId: "AC-005-000001", status: "pending",
    patient: { fullName: "Alice Silva", nic: "111", phn: "", gender: "female",
      dateOfBirth: "1990-01-01", householdAddress: "", relationshipToHead: null, gnDivision: null,
      mobile: "07", maritalStatus: null, occupation: null, education: null } });
  insertRegistration(db, { arogyaId: "AC-005-000002", status: "approved" });
  const app = createApp(db);
  const agent = await loginAgent(request, app);

  const pending = await agent.get("/staff/registrations?status=pending");
  assert.equal(pending.body.length, 1);
  assert.equal(pending.body[0].status, "pending");

  const search = await agent.get("/staff/registrations?q=Alice");
  assert.equal(search.body.length, 1);
  assert.equal(search.body[0].fullName, "Alice Silva");
});

test("detail returns full record for own clinic, 403 for another clinic, 404 for missing", async () => {
  const db = freshDb();
  seedPhno(db); // AC-005
  const ownId = insertRegistration(db, { arogyaId: "AC-005-000001" });
  const otherId = insertRegistration(db, { arogyaId: "AC-006-000001", clinicId: "AC-006" });
  const app = createApp(db);
  const agent = await loginAgent(request, app);

  const own = await agent.get(`/staff/registrations/${ownId}`);
  assert.equal(own.status, 200);
  assert.equal(own.body.patient.fullName, "Nimal Perera");
  assert.deepEqual(own.body.screeningFlags.length, 11);
  assert.ok(Array.isArray(own.body.audit));

  const other = await agent.get(`/staff/registrations/${otherId}`);
  assert.equal(other.status, 403);

  const missing = await agent.get(`/staff/registrations/999999`);
  assert.equal(missing.status, 404);
});

test("queue requires auth", async () => {
  const db = freshDb();
  const app = createApp(db);
  const res = await request(app).get("/staff/registrations");
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: Run it (fails)** — `node --test test/staff.queue.test.js` → FAIL.

- [ ] **Step 3: Add the routes to `backend/src/routes/staff.js`** — insert these inside `staffRouter`, immediately ABOVE the `router.requireAuth = requireAuth;` line:

```js
  // Map a DB row to a queue summary (no full PII dump in the list).
  function toSummary(row) {
    const p = JSON.parse(row.patient_json || "{}");
    return {
      id: row.id,
      arogyaId: row.arogya_id,
      fullName: p.fullName || "",
      nic: p.nic || "",
      triage: row.triage,
      status: row.status,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
    };
  }

  router.get("/registrations", requireAuth, (req, res) => {
    const status = ["pending", "approved", "rejected"].includes(req.query.status)
      ? req.query.status
      : null;
    const q = typeof req.query.q === "string" && req.query.q.trim() ? `%${req.query.q.trim()}%` : null;

    let sql =
      "SELECT id, arogya_id, patient_json, triage, status, created_at, reviewed_at " +
      "FROM registrations WHERE clinic_id = @clinicId";
    const params = { clinicId: req.phno.clinicId };
    if (status) {
      sql += " AND status = @status";
      params.status = status;
    }
    if (q) {
      sql += " AND (arogya_id LIKE @q OR patient_json LIKE @q)";
      params.q = q;
    }
    sql += " ORDER BY created_at DESC, id DESC";
    const rows = db.prepare(sql).all(params);
    res.json(rows.map(toSummary));
  });

  // Load a registration and enforce per-clinic ownership. Returns the row or
  // sends the appropriate error response (and returns null).
  function loadOwned(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(404).type("text/plain").send("Not found.");
      return null;
    }
    const row = db.prepare("SELECT * FROM registrations WHERE id = ?").get(id);
    if (!row) {
      res.status(404).type("text/plain").send("Not found.");
      return null;
    }
    if (row.clinic_id !== req.phno.clinicId) {
      res.status(403).type("text/plain").send("Forbidden.");
      return null;
    }
    return row;
  }

  router.get("/registrations/:id", requireAuth, (req, res) => {
    const row = loadOwned(req, res);
    if (!row) return;
    const audit = db
      .prepare(
        `SELECT a.action, a.changes_json, a.reason, a.created_at, u.full_name AS by_name
         FROM registration_audit a JOIN phno_users u ON u.id = a.user_id
         WHERE a.registration_id = ? ORDER BY a.created_at ASC, a.id ASC`
      )
      .all(row.id)
      .map((a) => ({
        action: a.action,
        changes: a.changes_json ? JSON.parse(a.changes_json) : null,
        reason: a.reason,
        at: a.created_at,
        byName: a.by_name,
      }));
    res.json({
      id: row.id,
      arogyaId: row.arogya_id,
      clinicId: row.clinic_id,
      language: row.language,
      patient: JSON.parse(row.patient_json || "{}"),
      screeningFlags: JSON.parse(row.screening_flags || "[]"),
      triage: row.triage,
      status: row.status,
      reviewedAt: row.reviewed_at,
      rejectReason: row.reject_reason,
      createdAt: row.created_at,
      audit,
    });
  });
```

Also add a shared export so later tasks reuse `loadOwned`/`toSummary`: change the closing lines of `staffRouter` from `router.requireAuth = requireAuth;` to:
```js
  router.requireAuth = requireAuth;
  router.loadOwned = loadOwned;
  router.toSummary = toSummary;
```
(These attachments are harmless on the router object; later tasks just use the in-scope functions directly.)

- [ ] **Step 4: Run it (passes)** — `node --test test/staff.queue.test.js` → PASS.

- [ ] **Step 5: Run full suite** — `npm test` → all green.

- [ ] **Step 6: Commit**

```bash
git add src/routes/staff.js test/staff.queue.test.js
git commit -m "feat(staff): per-clinic review queue + record detail (status filter, search, audit history)"
```

---

### Task 9: Extract `validatePatientFields` (backend, TDD)

**Files:**
- Modify: `backend/src/lib/validation.js`
- Modify: `backend/test/validation.test.js`

- [ ] **Step 1: Add a failing test** — append to `backend/test/validation.test.js`:

```js
import { validatePatientFields } from "../src/lib/validation.js";

test("validatePatientFields accepts a valid patient and lists errors for an invalid one", () => {
  const good = validBody().patient;
  assert.deepEqual(validatePatientFields(good), []);
  const bad = { ...good, fullName: "", gender: "x", nic: "", phn: "" };
  const errs = validatePatientFields(bad);
  assert.ok(errs.some((e) => /full name/i.test(e)));
  assert.ok(errs.some((e) => /gender/i.test(e)));
  assert.ok(errs.some((e) => /nic or phn/i.test(e)));
});
```

- [ ] **Step 2: Run it (fails)** — `node --test test/validation.test.js` → new test FAILS (export missing).

- [ ] **Step 3: Refactor `backend/src/lib/validation.js`** — extract the patient checks into an exported helper and call it from `validateRegistration` (messages unchanged):

Add this exported function:
```js
export function validatePatientFields(p) {
  const errors = [];
  if (!isNonEmptyString(p.fullName)) errors.push("Full name is required.");
  if (p.gender !== "male" && p.gender !== "female") errors.push("Gender is required.");
  if (!isNonEmptyString(p.dateOfBirth)) errors.push("Date of birth is required.");
  if (!isNonEmptyString(p.mobile)) errors.push("Mobile number is required.");
  if (!isNonEmptyString(p.nic) && !isNonEmptyString(p.phn)) errors.push("NIC or PHN is required.");
  return errors;
}
```
Then in `validateRegistration`, REPLACE the inline patient-field block (the five `if (...)` lines using `p`) with:
```js
  const p = body.patient || {};
  errors.push(...validatePatientFields(p));
```

- [ ] **Step 4: Run it (passes)** — `node --test test/validation.test.js` → PASS (existing registration tests + the new one). Then `npm test` → all green (the registration route tests still pass because messages are identical).

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.js test/validation.test.js
git commit -m "refactor(validation): extract validatePatientFields (DRY, reused by staff edit)"
```

---

### Task 10: Edit + approve + reject routes (backend, TDD)

**Files:**
- Modify: `backend/src/routes/staff.js`
- Create: `backend/test/staff.review.test.js`

- [ ] **Step 1: Write the failing test** — `backend/test/staff.review.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { freshDb, seedPhno, insertRegistration, loginAgent } from "./helpers.js";
import { createApp } from "../src/app.js";

function patient(over = {}) {
  return { fullName: "Nimal Perera", nic: "199012345678", phn: "", gender: "male",
    dateOfBirth: "1990-01-01", householdAddress: "", relationshipToHead: null, gnDivision: null,
    mobile: "0771234567", maritalStatus: null, occupation: null, education: null, ...over };
}

test("edit updates patient fields and writes an audit entry", async () => {
  const db = freshDb();
  seedPhno(db);
  const id = insertRegistration(db);
  const app = createApp(db);
  const agent = await loginAgent(request, app);

  const res = await agent.patch(`/staff/registrations/${id}`).send({ patient: patient({ fullName: "Nimal Corrected" }) });
  assert.equal(res.status, 200);
  assert.equal(res.body.patient.fullName, "Nimal Corrected");

  const detail = await agent.get(`/staff/registrations/${id}`);
  const edit = detail.body.audit.find((a) => a.action === "edit");
  assert.ok(edit, "edit audit row present");
  assert.equal(edit.changes.fullName.from, "Nimal Perera");
  assert.equal(edit.changes.fullName.to, "Nimal Corrected");
});

test("edit rejects invalid patient data (400) and is blocked on non-pending (409)", async () => {
  const db = freshDb();
  seedPhno(db);
  const id = insertRegistration(db);
  const app = createApp(db);
  const agent = await loginAgent(request, app);

  const bad = await agent.patch(`/staff/registrations/${id}`).send({ patient: patient({ fullName: "" }) });
  assert.equal(bad.status, 400);

  await agent.post(`/staff/registrations/${id}/approve`).send({});
  const afterApprove = await agent.patch(`/staff/registrations/${id}`).send({ patient: patient({ fullName: "Late" }) });
  assert.equal(afterApprove.status, 409);
});

test("approve transitions pending→approved, sets reviewer, is idempotent", async () => {
  const db = freshDb();
  const user = seedPhno(db);
  const id = insertRegistration(db);
  const app = createApp(db);
  const agent = await loginAgent(request, app);

  const res = await agent.post(`/staff/registrations/${id}/approve`).send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "approved");

  const row = db.prepare("SELECT reviewed_by, status FROM registrations WHERE id = ?").get(id);
  assert.equal(row.status, "approved");
  assert.equal(row.reviewed_by, user.id);

  const again = await agent.post(`/staff/registrations/${id}/approve`).send({});
  assert.equal(again.status, 200); // idempotent no-op
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM registration_audit WHERE action='approve'").get().c, 1);
});

test("reject requires a reason and transitions pending→rejected", async () => {
  const db = freshDb();
  seedPhno(db);
  const id = insertRegistration(db);
  const app = createApp(db);
  const agent = await loginAgent(request, app);

  const noReason = await agent.post(`/staff/registrations/${id}/reject`).send({});
  assert.equal(noReason.status, 400);

  const res = await agent.post(`/staff/registrations/${id}/reject`).send({ reason: "duplicate entry" });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "rejected");
  assert.equal(res.body.rejectReason, "duplicate entry");
});

test("approving an already-rejected record is a conflict (409)", async () => {
  const db = freshDb();
  seedPhno(db);
  const id = insertRegistration(db);
  const app = createApp(db);
  const agent = await loginAgent(request, app);
  await agent.post(`/staff/registrations/${id}/reject`).send({ reason: "junk" });
  const res = await agent.post(`/staff/registrations/${id}/approve`).send({});
  assert.equal(res.status, 409);
});

test("cannot edit/approve another clinic's record (403)", async () => {
  const db = freshDb();
  seedPhno(db); // AC-005
  const otherId = insertRegistration(db, { arogyaId: "AC-006-000001", clinicId: "AC-006" });
  const app = createApp(db);
  const agent = await loginAgent(request, app);
  assert.equal((await agent.post(`/staff/registrations/${otherId}/approve`).send({})).status, 403);
  assert.equal((await agent.patch(`/staff/registrations/${otherId}`).send({ patient: patient() })).status, 403);
});
```

- [ ] **Step 2: Run it (fails)** — `node --test test/staff.review.test.js` → FAIL.

- [ ] **Step 3: Add the routes to `backend/src/routes/staff.js`** — first add the import at the top of the file:
```js
import { validatePatientFields } from "../lib/validation.js";
```
Then insert these inside `staffRouter`, immediately ABOVE the `router.requireAuth = requireAuth;` line:

```js
  const insertAudit = db.prepare(
    `INSERT INTO registration_audit (registration_id, user_id, action, changes_json, reason, created_at)
     VALUES (@registrationId, @userId, @action, @changesJson, @reason, @createdAt)`
  );

  router.patch("/registrations/:id", requireAuth, (req, res) => {
    const row = loadOwned(req, res);
    if (!row) return;
    if (row.status !== "pending") {
      res.status(409).type("text/plain").send("Only pending records can be edited.");
      return;
    }
    const incoming = req.body && req.body.patient;
    if (!incoming || typeof incoming !== "object") {
      res.status(400).type("text/plain").send("patient object is required.");
      return;
    }
    const errors = validatePatientFields(incoming);
    if (errors.length > 0) {
      res.status(400).type("text/plain").send(errors.join(" "));
      return;
    }
    const before = JSON.parse(row.patient_json || "{}");
    const after = { ...before, ...incoming };
    const changes = {};
    for (const k of Object.keys(after)) {
      if (before[k] !== after[k]) changes[k] = { from: before[k] ?? null, to: after[k] ?? null };
    }
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare("UPDATE registrations SET patient_json = ? WHERE id = ?").run(JSON.stringify(after), row.id);
      if (Object.keys(changes).length > 0) {
        insertAudit.run({
          registrationId: row.id, userId: req.phno.id, action: "edit",
          changesJson: JSON.stringify(changes), reason: null, createdAt: now,
        });
      }
    })();
    res.json({ id: row.id, patient: after });
  });

  router.post("/registrations/:id/approve", requireAuth, (req, res) => {
    const row = loadOwned(req, res);
    if (!row) return;
    if (row.status === "approved") {
      res.json({ id: row.id, status: "approved", reviewedAt: row.reviewed_at });
      return; // idempotent no-op
    }
    if (row.status !== "pending") {
      res.status(409).type("text/plain").send(`Cannot approve a ${row.status} record.`);
      return;
    }
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare(
        "UPDATE registrations SET status='approved', reviewed_by=?, reviewed_at=? WHERE id=?"
      ).run(req.phno.id, now, row.id);
      insertAudit.run({
        registrationId: row.id, userId: req.phno.id, action: "approve",
        changesJson: null, reason: null, createdAt: now,
      });
    })();
    // Layer B will trigger the DHIS2 push here.
    res.json({ id: row.id, status: "approved", reviewedAt: now });
  });

  router.post("/registrations/:id/reject", requireAuth, (req, res) => {
    const row = loadOwned(req, res);
    if (!row) return;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason) {
      res.status(400).type("text/plain").send("A rejection reason is required.");
      return;
    }
    if (row.status !== "pending") {
      res.status(409).type("text/plain").send(`Cannot reject a ${row.status} record.`);
      return;
    }
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare(
        "UPDATE registrations SET status='rejected', reviewed_by=?, reviewed_at=?, reject_reason=? WHERE id=?"
      ).run(req.phno.id, now, reason, row.id);
      insertAudit.run({
        registrationId: row.id, userId: req.phno.id, action: "reject",
        changesJson: null, reason, createdAt: now,
      });
    })();
    res.json({ id: row.id, status: "rejected", rejectReason: reason, reviewedAt: now });
  });
```

- [ ] **Step 4: Run it (passes)** — `node --test test/staff.review.test.js` → PASS.

- [ ] **Step 5: Run full suite** — `npm test` → all green.

- [ ] **Step 6: Commit**

```bash
git add src/routes/staff.js test/staff.review.test.js
git commit -m "feat(staff): edit (audited) + approve/reject with state guards + per-clinic authz"
```

---

### Task 11: Admin CLI to create a PHNO account (backend)

**Files:**
- Create: `backend/scripts/create-phno.js`
- Modify: `backend/package.json` (add a script alias)

- [ ] **Step 1: Create `backend/scripts/create-phno.js`**:

```js
// Admin CLI: create a PHNO account.
//   node scripts/create-phno.js --clinic AC-002 --username nimasha --name "Nimasha P." [--password PW]
// If --password is omitted, reads AROGYA_PHNO_PASSWORD, else prompts (hidden) on a TTY.
import { openDb } from "../src/db.js";
import { createPhnoUser } from "../src/lib/phnoUsers.js";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 ? process.argv[i + 1] : undefined;
}

// Read a line without echoing it (raw mode on a TTY; falls back to a plain read
// when stdin is piped, e.g. automation).
function promptHidden(query) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(query);
    stdin.resume();
    stdin.setRawMode?.(true);
    let input = "";
    stdin.on("data", function onData(ch) {
      const s = ch.toString("utf8");
      if (s === "\n" || s === "\r" || s === "\u0004") {
        stdin.setRawMode?.(false);
        stdin.pause();
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        resolve(input);
      } else if (s === "\u0003") {
        process.exit(1); // ctrl-c
      } else if (s === "\u007f" || s === "\b") {
        input = input.slice(0, -1); // backspace
      } else {
        input += s;
      }
    });
  });
}

async function main() {
  const clinicId = arg("clinic");
  const username = arg("username");
  const fullName = arg("name");
  if (!clinicId || !username || !fullName) {
    console.error('Usage: node scripts/create-phno.js --clinic AC-002 --username nimasha --name "Full Name" [--password PW]');
    process.exit(2);
  }
  let password = arg("password") || process.env.AROGYA_PHNO_PASSWORD;
  if (!password) password = await promptHidden("Password: ");
  if (!password || password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(2);
  }

  const db = openDb();
  try {
    const user = createPhnoUser(db, { username, password, clinicId, fullName });
    console.log(`Created PHNO #${user.id}: ${username} @ ${clinicId} (${fullName})`);
  } catch (e) {
    console.error("Failed:", e.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
```

- [ ] **Step 2: Add a script alias** — in `backend/package.json`, add to `"scripts"`:
```json
    "create-phno": "node scripts/create-phno.js"
```
(Keep the existing `start` and `test` entries; add this as an additional key.)

- [ ] **Step 3: Smoke-test against a temp DB** (does NOT touch the real DB):

Run:
```bash
AROGYA_DB_PATH=/tmp/phno-cli-test.db node scripts/create-phno.js --clinic AC-005 --username clitest --name "CLI Test" --password testpass1 && \
AROGYA_DB_PATH=/tmp/phno-cli-test.db node -e "import('./src/db.js').then(async ({openDb})=>{const db=openDb();const u=db.prepare('SELECT username,clinic_id FROM phno_users WHERE username=?').get('clitest');console.log(u);if(!u)process.exit(1)})" && \
rm -f /tmp/phno-cli-test.db /tmp/phno-cli-test.db-wal /tmp/phno-cli-test.db-shm
```
Expected: prints `Created PHNO #1: clitest @ AC-005 (CLI Test)` then `{ username: 'clitest', clinic_id: 'AC-005' }`.

- [ ] **Step 4: Commit**

```bash
git add scripts/create-phno.js package.json
git commit -m "feat(staff): admin CLI to create PHNO accounts (clinic-scoped)"
```

---

### Task 12: Staff types + API client (frontend)

**Files:**
- Create: `frontend/src/staff/types.ts`
- Create: `frontend/src/staff/staffApi.ts`

- [ ] **Step 1: Create `frontend/src/staff/types.ts`**:

```ts
import type { RegistrationData } from "../types";

export interface StaffUser {
  fullName: string;
  clinicId: string;
  clinicName: string | null;
}

export type RecordStatus = "pending" | "approved" | "rejected";

export interface RegistrationSummary {
  id: number;
  arogyaId: string;
  fullName: string;
  nic: string;
  triage: string;
  status: RecordStatus;
  createdAt: string;
  reviewedAt: string | null;
}

export interface AuditEntry {
  action: "edit" | "approve" | "reject";
  changes: Record<string, { from: unknown; to: unknown }> | null;
  reason: string | null;
  at: string;
  byName: string;
}

export interface RegistrationDetail {
  id: number;
  arogyaId: string;
  clinicId: string;
  language: string;
  patient: RegistrationData;
  screeningFlags: boolean[];
  triage: string;
  status: RecordStatus;
  reviewedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  audit: AuditEntry[];
}

export type StaffResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };
```

- [ ] **Step 2: Create `frontend/src/staff/staffApi.ts`**:

```ts
import { getConfig } from "../config";
import type {
  StaffUser,
  RegistrationSummary,
  RegistrationDetail,
  RecordStatus,
  StaffResult,
} from "./types";
import type { RegistrationData } from "../types";

async function req<T>(path: string, options: RequestInit = {}): Promise<StaffResult<T>> {
  const { apiBaseUrl } = getConfig();
  try {
    const res = await fetch(`${apiBaseUrl}/staff${path}`, {
      ...options,
      credentials: "include", // send/receive the session cookie
      headers: { "Content-Type": "application/json", ...options.headers },
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, status: res.status, error: text || `HTTP ${res.status}` };
    }
    const data = res.status === 204 ? (undefined as T) : ((await res.json()) as T);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, status: 0, error: String(err) };
  }
}

export const staffApi = {
  login: (username: string, password: string) =>
    req<StaffUser>("/login", { method: "POST", body: JSON.stringify({ username, password }) }),
  logout: () => req<{ ok: true }>("/logout", { method: "POST" }),
  me: () => req<StaffUser>("/me"),
  list: (status?: RecordStatus | "all", q?: string) => {
    const params = new URLSearchParams();
    if (status && status !== "all") params.set("status", status);
    if (q) params.set("q", q);
    const qs = params.toString();
    return req<RegistrationSummary[]>(`/registrations${qs ? `?${qs}` : ""}`);
  },
  get: (id: number) => req<RegistrationDetail>(`/registrations/${id}`),
  edit: (id: number, patient: RegistrationData) =>
    req<{ id: number; patient: RegistrationData }>(`/registrations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ patient }),
    }),
  approve: (id: number) =>
    req<{ id: number; status: RecordStatus }>(`/registrations/${id}/approve`, { method: "POST", body: "{}" }),
  reject: (id: number, reason: string) =>
    req<{ id: number; status: RecordStatus }>(`/registrations/${id}/reject`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),
};
```

- [ ] **Step 2b: Typecheck** — `npm run lint` → no errors.

- [ ] **Step 3: Commit**

```bash
git add src/staff/types.ts src/staff/staffApi.ts
git commit -m "feat(staff-ui): staff DTO types + cookie-auth API client"
```

---

### Task 13: Queue filter helper (frontend, TDD)

**Files:**
- Create: `frontend/src/staff/queueFilter.ts`
- Create: `frontend/src/staff/queueFilter.test.ts`

- [ ] **Step 1: Write the failing test** — `frontend/src/staff/queueFilter.test.ts`:

```ts
import { test, expect } from "vitest";
import { filterSummaries } from "./queueFilter";
import type { RegistrationSummary } from "./types";

const base: RegistrationSummary = {
  id: 1, arogyaId: "AC-005-000001", fullName: "Alice Silva", nic: "111",
  triage: "normal", status: "pending", createdAt: "2026-01-01T00:00:00Z", reviewedAt: null,
};

const rows: RegistrationSummary[] = [
  base,
  { ...base, id: 2, arogyaId: "AC-005-000002", fullName: "Bimal Costa", nic: "222", status: "approved" },
];

test("search matches name, NIC, or arogya id (case-insensitive)", () => {
  expect(filterSummaries(rows, "alice").map((r) => r.id)).toEqual([1]);
  expect(filterSummaries(rows, "222").map((r) => r.id)).toEqual([2]);
  expect(filterSummaries(rows, "ac-005-000002").map((r) => r.id)).toEqual([2]);
  expect(filterSummaries(rows, "").map((r) => r.id)).toEqual([1, 2]);
});
```

- [ ] **Step 2: Run it (fails)** — `npx vitest run src/staff/queueFilter.test.ts` → FAIL.

- [ ] **Step 3: Create `frontend/src/staff/queueFilter.ts`**:

```ts
import type { RegistrationSummary } from "./types";

// Client-side search over the already-clinic-scoped list (server also filters,
// this keeps typing responsive). Matches name, NIC, or Arogya ID.
export function filterSummaries(rows: RegistrationSummary[], query: string): RegistrationSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.fullName.toLowerCase().includes(q) ||
      r.nic.toLowerCase().includes(q) ||
      r.arogyaId.toLowerCase().includes(q)
  );
}
```

- [ ] **Step 4: Run it (passes)** — `npx vitest run src/staff/queueFilter.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/staff/queueFilter.ts src/staff/queueFilter.test.ts
git commit -m "feat(staff-ui): client-side queue search helper"
```

---

### Task 14: Staff shell + login + top-level split (frontend)

**Files:**
- Create: `frontend/src/staff/StaffApp.tsx`
- Create: `frontend/src/staff/LoginScreen.tsx`
- Modify: `frontend/src/main.tsx`

- [ ] **Step 1: Create `frontend/src/staff/LoginScreen.tsx`**:

```tsx
import { useState } from "react";
import { staffApi } from "./staffApi";
import type { StaffUser } from "./types";

export function LoginScreen({ onLoggedIn }: { onLoggedIn: (u: StaffUser) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await staffApi.login(username.trim(), password);
    setBusy(false);
    if (!res.ok) {
      setError(res.status === 429 ? "Too many attempts. Try again later." : "Invalid username or password.");
      return;
    }
    onLoggedIn(res.data);
  }

  return (
    <div className="min-h-screen bg-[#F6F9F7] flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-[360px] bg-white rounded-[20px] shadow-sm border border-gray-100 p-8">
        <h1 className="text-[22px] font-bold text-[#0A5C43] mb-1">Arogya — PHNO Portal</h1>
        <p className="text-[14px] text-[#4F675C] mb-6">Sign in to review patient registrations.</p>
        <label className="block text-[13px] font-semibold text-[#4F675C] mb-1">Username</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus
          className="w-full mb-4 px-3 py-2.5 rounded-[10px] border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#2C8567]" />
        <label className="block text-[13px] font-semibold text-[#4F675C] mb-1">Password</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          className="w-full mb-5 px-3 py-2.5 rounded-[10px] border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#2C8567]" />
        {error && <p className="text-[13px] text-[#D32F2F] mb-3">{error}</p>}
        <button type="submit" disabled={busy || !username || !password}
          className="w-full py-3 bg-[#0A5C43] hover:bg-[#074734] disabled:opacity-50 text-white rounded-[10px] font-bold text-[15px]">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/staff/StaffApp.tsx`** (shell + auth bootstrap; queue/detail/edit wired in the next task — for now render a placeholder once logged in):

```tsx
import { useEffect, useState } from "react";
import { staffApi } from "./staffApi";
import type { StaffUser } from "./types";
import { LoginScreen } from "./LoginScreen";
import { QueueScreen } from "./QueueScreen";

export default function StaffApp() {
  const [user, setUser] = useState<StaffUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    staffApi.me().then((res) => {
      if (res.ok) setUser(res.data);
      setReady(true);
    });
  }, []);

  if (!ready) {
    return <div className="min-h-screen bg-[#F6F9F7] flex items-center justify-center text-[#4F675C]">Loading…</div>;
  }
  if (!user) return <LoginScreen onLoggedIn={setUser} />;

  async function logout() {
    await staffApi.logout();
    setUser(null);
  }

  return <QueueScreen user={user} onLogout={logout} />;
}
```

- [ ] **Step 3: Split at the top level in `frontend/src/main.tsx`** — replace the file with:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import StaffApp from "./staff/StaffApp.tsx";
import "./index.css";

// The staff portal and the patient kiosk share one bundle; the URL path picks which.
const path = window.location.pathname.replace(/\/+$/, "");
const isStaff = path.endsWith("/staff");

createRoot(document.getElementById("root")!).render(
  <StrictMode>{isStaff ? <StaffApp /> : <App />}</StrictMode>,
);
```

- [ ] **Step 4: Temporary stub so it compiles** — create a minimal `frontend/src/staff/QueueScreen.tsx` placeholder (fully replaced in Task 15):

```tsx
import type { StaffUser } from "./types";
export function QueueScreen({ user, onLogout }: { user: StaffUser; onLogout: () => void }) {
  return (
    <div className="p-6">
      <p>Signed in as {user.fullName} ({user.clinicName}).</p>
      <button onClick={onLogout} className="underline text-[#0A5C43]">Log out</button>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck + build** — `npm run lint && npm run build` → no errors.

- [ ] **Step 6: Commit**

```bash
git add src/staff/StaffApp.tsx src/staff/LoginScreen.tsx src/staff/QueueScreen.tsx src/main.tsx
git commit -m "feat(staff-ui): top-level kiosk/staff split + auth bootstrap + login screen"
```

---

### Task 15: Queue + Detail + Edit screens (frontend)

**Files:**
- Modify: `frontend/src/staff/QueueScreen.tsx` (full replacement)
- Create: `frontend/src/staff/DetailScreen.tsx`
- Create: `frontend/src/staff/EditScreen.tsx`

- [ ] **Step 1: Replace `frontend/src/staff/QueueScreen.tsx`**:

```tsx
import { useEffect, useState, useCallback } from "react";
import { staffApi } from "./staffApi";
import { filterSummaries } from "./queueFilter";
import type { StaffUser, RegistrationSummary, RecordStatus } from "./types";
import { DetailScreen } from "./DetailScreen";

const TABS: Array<{ key: RecordStatus | "all"; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

export function QueueScreen({ user, onLogout }: { user: StaffUser; onLogout: () => void }) {
  const [tab, setTab] = useState<RecordStatus | "all">("pending");
  const [rows, setRows] = useState<RegistrationSummary[]>([]);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await staffApi.list(tab);
    setLoading(false);
    if (res.ok) setRows(res.data);
    else if (res.status === 401) onLogout();
  }, [tab, onLogout]);

  useEffect(() => { load(); }, [load]);

  if (selectedId !== null) {
    return (
      <DetailScreen
        id={selectedId}
        onBack={() => { setSelectedId(null); load(); }}
        onLogout={onLogout}
      />
    );
  }

  const visible = filterSummaries(rows, query);

  return (
    <div className="min-h-screen bg-[#F6F9F7]">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-[18px] font-bold text-[#0A5C43]">Arogya — {user.clinicName ?? user.clinicId}</h1>
          <p className="text-[13px] text-[#4F675C]">{user.fullName}</p>
        </div>
        <button onClick={onLogout} className="text-[14px] text-[#0A5C43] underline">Log out</button>
      </header>

      <div className="max-w-[1000px] mx-auto p-6">
        <div className="flex gap-2 mb-4">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-[10px] text-[14px] font-semibold ${tab === t.key ? "bg-[#0A5C43] text-white" : "bg-white border border-gray-200 text-[#4F675C]"}`}>
              {t.label}
            </button>
          ))}
        </div>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, NIC, or Arogya ID"
          className="w-full mb-4 px-3 py-2.5 rounded-[10px] border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#2C8567]" />

        {loading ? (
          <p className="text-[#4F675C]">Loading…</p>
        ) : visible.length === 0 ? (
          <p className="text-[#4F675C]">No records.</p>
        ) : (
          <div className="bg-white rounded-[12px] border border-gray-200 overflow-hidden">
            {visible.map((r) => (
              <button key={r.id} onClick={() => setSelectedId(r.id)}
                className="w-full text-left px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-[#F0F7F4] flex items-center justify-between">
                <div>
                  <div className="font-semibold text-[#1B4332]">{r.fullName || "(no name)"}</div>
                  <div className="text-[13px] text-[#758D81]">{r.arogyaId} · {r.nic || "no NIC"}</div>
                </div>
                <div className="flex items-center gap-3">
                  {r.triage === "high-risk" && <span className="text-[12px] font-bold text-[#D32F2F]">HIGH RISK</span>}
                  <span className="text-[12px] uppercase tracking-wide text-[#4F675C]">{r.status}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `frontend/src/staff/DetailScreen.tsx`**:

```tsx
import { useEffect, useState, useCallback } from "react";
import { staffApi } from "./staffApi";
import type { RegistrationDetail } from "./types";
import type { RegistrationData } from "../types";
import { EditScreen } from "./EditScreen";

const FIELD_LABELS: Array<[keyof RegistrationData, string]> = [
  ["fullName", "Full name"], ["nic", "NIC"], ["phn", "PHN"], ["gender", "Gender"],
  ["dateOfBirth", "Date of birth"], ["mobile", "Mobile"], ["householdAddress", "Address"],
  ["maritalStatus", "Marital status"], ["occupation", "Occupation"], ["education", "Education"],
];

export function DetailScreen({ id, onBack, onLogout }: { id: number; onBack: () => void; onLogout: () => void }) {
  const [record, setRecord] = useState<RegistrationDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await staffApi.get(id);
    if (res.ok) setRecord(res.data);
    else if (res.status === 401) onLogout();
    else setError(res.error);
  }, [id, onLogout]);

  useEffect(() => { load(); }, [load]);

  if (editing && record) {
    return <EditScreen record={record} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); load(); }} />;
  }
  if (error) return <div className="p-6 text-[#D32F2F]">{error} <button onClick={onBack} className="underline">Back</button></div>;
  if (!record) return <div className="p-6 text-[#4F675C]">Loading…</div>;

  const pending = record.status === "pending";

  async function approve() {
    setBusy(true); setError(null);
    const res = await staffApi.approve(id);
    setBusy(false);
    if (res.ok) load(); else setError(res.error);
  }
  async function reject() {
    const reason = window.prompt("Reason for rejection?");
    if (!reason || !reason.trim()) return;
    setBusy(true); setError(null);
    const res = await staffApi.reject(id, reason.trim());
    setBusy(false);
    if (res.ok) load(); else setError(res.error);
  }

  return (
    <div className="min-h-screen bg-[#F6F9F7]">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <button onClick={onBack} className="text-[14px] text-[#0A5C43] underline">← Back to queue</button>
        <span className="text-[12px] uppercase tracking-wide text-[#4F675C]">{record.status}</span>
      </header>
      <div className="max-w-[760px] mx-auto p-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[20px] font-bold text-[#0A5C43]">{record.patient.fullName || "(no name)"}</h1>
          {record.triage === "high-risk" && <span className="text-[13px] font-bold text-[#D32F2F]">HIGH RISK</span>}
        </div>
        <p className="text-[13px] text-[#758D81] mb-5">{record.arogyaId}</p>

        <div className="bg-white rounded-[12px] border border-gray-200 p-5 mb-5">
          <h2 className="text-[14px] font-bold text-[#4F675C] mb-3">Patient details</h2>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[14px]">
            {FIELD_LABELS.map(([k, label]) => (
              <div key={k}>
                <dt className="text-[12px] text-[#758D81]">{label}</dt>
                <dd className="text-[#1B4332]">{String(record.patient[k] ?? "—") || "—"}</dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="bg-white rounded-[12px] border border-gray-200 p-5 mb-5">
          <h2 className="text-[14px] font-bold text-[#4F675C] mb-3">Screening</h2>
          <p className="text-[14px] text-[#1B4332]">Flagged symptoms: {record.screeningFlags.filter(Boolean).length} / {record.screeningFlags.length}</p>
          <p className="text-[14px] text-[#1B4332]">Triage: {record.triage}</p>
        </div>

        {record.audit.length > 0 && (
          <div className="bg-white rounded-[12px] border border-gray-200 p-5 mb-5">
            <h2 className="text-[14px] font-bold text-[#4F675C] mb-3">History</h2>
            <ul className="text-[13px] text-[#4F675C] space-y-1">
              {record.audit.map((a, i) => (
                <li key={i}>{new Date(a.at).toLocaleString()} — <b>{a.action}</b> by {a.byName}{a.reason ? ` (${a.reason})` : ""}</li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="text-[13px] text-[#D32F2F] mb-3">{error}</p>}

        {pending && (
          <div className="flex gap-3">
            <button onClick={approve} disabled={busy}
              className="flex-1 py-3 bg-[#0A5C43] hover:bg-[#074734] disabled:opacity-50 text-white rounded-[10px] font-bold">Approve</button>
            <button onClick={() => setEditing(true)} disabled={busy}
              className="flex-1 py-3 bg-white border border-[#0A5C43] text-[#0A5C43] rounded-[10px] font-bold">Edit</button>
            <button onClick={reject} disabled={busy}
              className="flex-1 py-3 bg-white border border-[#D32F2F] text-[#D32F2F] rounded-[10px] font-bold">Reject</button>
          </div>
        )}
        {record.status === "rejected" && record.rejectReason && (
          <p className="text-[14px] text-[#D32F2F]">Rejected: {record.rejectReason}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create `frontend/src/staff/EditScreen.tsx`**:

```tsx
import { useState } from "react";
import { staffApi } from "./staffApi";
import type { RegistrationDetail } from "./types";
import type { RegistrationData } from "../types";

const EDITABLE: Array<[keyof RegistrationData, string]> = [
  ["fullName", "Full name"], ["nic", "NIC"], ["phn", "PHN"],
  ["dateOfBirth", "Date of birth (yyyy-mm-dd)"], ["mobile", "Mobile"], ["householdAddress", "Address"],
];

export function EditScreen({ record, onCancel, onSaved }: {
  record: RegistrationDetail; onCancel: () => void; onSaved: () => void;
}) {
  const [patient, setPatient] = useState<RegistrationData>({ ...record.patient });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(k: keyof RegistrationData, v: string) {
    setPatient((p) => ({ ...p, [k]: v }));
  }

  async function save() {
    setBusy(true); setError(null);
    const res = await staffApi.edit(record.id, patient);
    setBusy(false);
    if (res.ok) onSaved();
    else setError(res.error);
  }

  return (
    <div className="min-h-screen bg-[#F6F9F7]">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <button onClick={onCancel} className="text-[14px] text-[#0A5C43] underline">← Cancel</button>
      </header>
      <div className="max-w-[640px] mx-auto p-6">
        <h1 className="text-[20px] font-bold text-[#0A5C43] mb-5">Edit patient</h1>
        <div className="bg-white rounded-[12px] border border-gray-200 p-5">
          <div className="mb-4">
            <label className="block text-[13px] font-semibold text-[#4F675C] mb-1">Gender</label>
            <select value={patient.gender ?? ""} onChange={(e) => set("gender", e.target.value)}
              className="w-full px-3 py-2.5 rounded-[10px] border border-gray-300">
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          {EDITABLE.map(([k, label]) => (
            <div key={k} className="mb-4">
              <label className="block text-[13px] font-semibold text-[#4F675C] mb-1">{label}</label>
              <input value={String(patient[k] ?? "")} onChange={(e) => set(k, e.target.value)}
                className="w-full px-3 py-2.5 rounded-[10px] border border-gray-300 focus:outline-none focus:ring-2 focus:ring-[#2C8567]" />
            </div>
          ))}
          {error && <p className="text-[13px] text-[#D32F2F] mb-3">{error}</p>}
          <div className="flex gap-3">
            <button onClick={save} disabled={busy}
              className="flex-1 py-3 bg-[#0A5C43] hover:bg-[#074734] disabled:opacity-50 text-white rounded-[10px] font-bold">
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button onClick={onCancel} disabled={busy}
              className="flex-1 py-3 bg-white border border-gray-300 text-[#4F675C] rounded-[10px] font-bold">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + build** — `npm run lint && npm run build` → no errors. `npx vitest run` → all pass (including queueFilter).

- [ ] **Step 5: Commit**

```bash
git add src/staff/QueueScreen.tsx src/staff/DetailScreen.tsx src/staff/EditScreen.tsx
git commit -m "feat(staff-ui): queue + record detail (approve/reject) + edit screens"
```

---

### Task 16: Final verification

- [ ] **Step 1: Backend suite** — from `backend/`: `npm test` → all green (existing + password, phnoUsers, session, loginThrottle, staff auth/queue/review, validation, db v3).
- [ ] **Step 2: Frontend** — from `frontend/`: `npx vitest run && npm run lint && npm run build` → all pass; note the new bundle hash.
- [ ] **Step 3: Manual smoke (local, no deploy)** — start the backend against a temp DB and exercise the flow with curl:

```bash
cd backend
AROGYA_DB_PATH=/tmp/arogya-smoke.db node scripts/create-phno.js --clinic AC-005 --username smoke --name "Smoke PHNO" --password smokepass1
AROGYA_DB_PATH=/tmp/arogya-smoke.db PORT=4999 node src/server.js &  # start server
SRV=$!; sleep 1
# seed a registration through the patient API:
curl -s -X POST localhost:4999/registration -H 'Content-Type: application/json' \
  -d '{"requestId":"smoke-1","language":"en","clinicId":"AC-005","patient":{"fullName":"Test Patient","nic":"199012345678","phn":"","gender":"male","dateOfBirth":"1990-01-01","householdAddress":"","relationshipToHead":null,"gnDivision":null,"mobile":"0771234567","maritalStatus":null,"occupation":null,"education":null},"screening":{"flags":[false,false,false,false,false,false,false,false,false,false,false]},"consent":true}' >/dev/null
# login (capture cookie), list queue, approve:
curl -s -c /tmp/jar.txt -X POST localhost:4999/staff/login -H 'Content-Type: application/json' -d '{"username":"smoke","password":"smokepass1"}'
echo; curl -s -b /tmp/jar.txt localhost:4999/staff/registrations
kill $SRV; rm -f /tmp/arogya-smoke.db* /tmp/jar.txt
```
Expected: login returns the user JSON; the queue lists one pending record.

- [ ] **Step 4: Confirm no system paths touched** — `git status` shows only repo files; no deploy/sudo was run.

---

## Self-Review Notes
- **Spec coverage (Layer A):** A.1 data model → Task 1; A.2 auth (scrypt → Task 2, sessions → Task 4, throttle → Task 5, login/logout/me/requireAuth/scoping → Task 7) ; account CLI → Task 11; A.3 staff API (queue/detail → Task 8, edit/approve/reject → Task 10) ; A.4 frontend (split + login → Task 14, queue/detail/edit → Task 15, api client/types → Task 12, filter → Task 13) ; A.5 testing throughout + Task 16.
- **Layer B** intentionally deferred (separate spec); Task 10's approve route has the single insertion point marked `// Layer B will trigger the DHIS2 push here.`
- **Type/name consistency:** `req.phno = {id, clinicId, fullName}` used in Tasks 7/8/10; `staffApi` method names (`login/logout/me/list/get/edit/approve/reject`) match between Task 12 and Tasks 14/15; `RegistrationSummary`/`RegistrationDetail`/`AuditEntry` shapes match the backend JSON in Tasks 8/10; cookie name `arogya_session` + path `/arogya` consistent across session lib (Task 4) and router (Task 7).
- **Cross-task ordering:** helpers (Task 6) land before the route tests that use them (Tasks 7/8/10); `validatePatientFields` (Task 9) lands before the edit route uses it (Task 10); the `QueueScreen` placeholder (Task 14) is fully replaced in Task 15 so the build stays green at each commit.
- **No placeholders:** every code step is complete and runnable.
- **Deferred (Layer B spec):** DHIS2 mapping/config, tracker payload builder, idempotent push + retry endpoint, push-status columns, fake-DHIS2 tests.
