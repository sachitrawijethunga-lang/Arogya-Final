# Arogya Phase 0 Safety + Server Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the worst live data-integrity and privacy risks in the Arogya app — duplicate registrations / burned Arogya IDs from double-submit, lost data on submit failure, kiosk PII leakage between patients — and add cheap server/script hardening (PII-safe logging, graceful shutdown, DB file perms, pm2 boot persistence).

**Architecture:** The real safety net is **server-side idempotency**: the client sends a stable `requestId` (UUID) per registration attempt; the backend dedups on a `request_id UNIQUE` index inside the existing write transaction, returning the original result on replay **without** advancing the per-clinic counter. The frontend adds a one-shot submit guard, an idempotent in-place Retry, friendly localized errors, lifted questionnaire state (Back no longer wipes answers), and an inactivity reset that wipes PII. A `PRAGMA user_version` migration runner makes the schema change safe on the (future) live DB.

**Tech Stack:** Backend Node v24 ESM + Express 5 + better-sqlite3, `node:test` + supertest. Frontend React 19 + TS + Vite, vitest. Source-of-truth: `docs/arogya-improvement-roadmap.md` (items 0.1, 0.2, 0.3, 0.4, 1.1, 1.5, 1.6, 1.7, 2.1a, 2.4).

---

## Conventions
- Backend commands run from `/home/developper/arogya-entry/backend`; frontend from `/home/developper/arogya-entry/frontend`.
- Backend ESM: always `import express from "express"` / `import Database from "better-sqlite3"` (default imports).
- One commit per task. Do NOT run `setup.sh`/`deploy.sh`/`go-live.sh`, pm2, sudo, or touch `/var/www`, `/var/lib/arogya`, or Caddy — those are operator-run.

## File Structure Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/src/db.js` | Modify | Versioned migrations, `request_id`, indexes, `busy_timeout` |
| `backend/test/db.test.js` | Modify | Assert schema v2 |
| `backend/src/lib/validation.js` | Modify | Require `requestId` |
| `backend/src/routes/registration.js` | Modify | Idempotent insert, real consent value |
| `backend/test/registration.route.test.js` | Modify | requestId in payloads + replay/idempotency tests |
| `backend/test/validation.test.js` | Modify | requestId validation tests |
| `backend/src/app.js` | Modify | PII-safe error logging |
| `backend/src/server.js` | Modify | Graceful shutdown (SIGTERM/SIGINT) |
| `frontend/src/types.ts` | Modify | `requestId` in request; structured `ApiError`; `AppState` fields |
| `frontend/src/services/api.ts` | Modify | Structured error kind/status |
| `frontend/src/lib/apiError.ts` | Create | `mapApiError(err, language)` |
| `frontend/src/lib/apiError.test.ts` | Create | Tests for the mapper |
| `frontend/src/translations.ts` | Modify | `tryAgain` + `errors.*` in en/si/ta |
| `frontend/src/components/TriageSummaryScreen.tsx` | Modify | One-shot guard, retry, friendly errors, requestId |
| `frontend/src/components/QuestionnaireScreen.tsx` | Modify | Accept initial state |
| `frontend/src/App.tsx` | Modify | requestId, lifted screening state, idle reset |
| `go-live.sh` | Modify | DB perms 0700/0600, required pm2 boot persistence |

---

### Task 1: Versioned migration runner + request_id + indexes (backend, TDD)

**Files:**
- Modify: `backend/src/db.js`
- Modify: `backend/test/db.test.js`

- [ ] **Step 1: Add the failing test** — append to `backend/test/db.test.js`:

```js
test("schema is at version 2 with request_id column and idempotency + lookup indexes", () => {
  const db = freshDb();
  assert.equal(db.pragma("user_version", { simple: true }), 2);
  const cols = db.prepare("PRAGMA table_info(registrations)").all().map((c) => c.name);
  assert.ok(cols.includes("request_id"), "request_id column missing");
  const idx = db.prepare("PRAGMA index_list(registrations)").all().map((i) => i.name);
  assert.ok(idx.includes("idx_reg_request_id"), "request_id unique index missing");
  assert.ok(idx.includes("idx_reg_clinic_created"), "clinic/created index missing");
});
```

- [ ] **Step 2: Run it (fails)** — `node --test test/db.test.js` → FAIL (user_version 0, no request_id).

- [ ] **Step 3: Rewrite `backend/src/db.js`** (replace the file's `openDb` + `migrate`; keep `seedClinics` unchanged):

```js
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = "/var/lib/arogya/arogya.db";
const SEED_PATH = join(__dirname, "data", "clinics.seed.json");

export function openDb(dbPath = process.env.AROGYA_DB_PATH || DEFAULT_DB_PATH) {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  seedClinics(db);
  return db;
}

// Versioned, append-only migrations keyed on PRAGMA user_version.
// Each block is applied once and bumps the version. Never edit a shipped block.
function migrate(db) {
  let version = db.pragma("user_version", { simple: true });

  if (version < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS clinics (
        clinic_id TEXT PRIMARY KEY,
        name      TEXT NOT NULL,
        rdhs      TEXT,
        province  TEXT
      );
      CREATE TABLE IF NOT EXISTS clinic_counters (
        clinic_id TEXT PRIMARY KEY REFERENCES clinics(clinic_id),
        last_seq  INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS registrations (
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
    `);
    db.pragma("user_version = 1");
    version = 1;
  }

  if (version < 2) {
    db.exec(`
      ALTER TABLE registrations ADD COLUMN request_id TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_request_id
        ON registrations(request_id) WHERE request_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_reg_clinic_created
        ON registrations(clinic_id, created_at);
    `);
    db.pragma("user_version = 2");
    version = 2;
  }
}

function seedClinics(db) {
  const clinics = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  const upsert = db.prepare(`
    INSERT INTO clinics (clinic_id, name, rdhs, province)
    VALUES (@clinicId, @name, @rdhs, @province)
    ON CONFLICT(clinic_id) DO UPDATE SET
      name = excluded.name, rdhs = excluded.rdhs, province = excluded.province
  `);
  const tx = db.transaction((rows) => {
    for (const r of rows) upsert.run(r);
  });
  tx(clinics);
}
```

- [ ] **Step 4: Run it (passes)** — `node --test test/db.test.js` → PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/db.js test/db.test.js
git commit -m "feat(db): versioned migrations, request_id idempotency column + indexes, busy_timeout"
```

---

### Task 2: Idempotent registration + real consent value (backend, TDD)

**Files:**
- Modify: `backend/src/lib/validation.js`
- Modify: `backend/test/validation.test.js`
- Modify: `backend/src/routes/registration.js`
- Modify: `backend/test/registration.route.test.js`

- [ ] **Step 1: Add the failing validation test** — append to `backend/test/validation.test.js` (note: `validBody` here already returns a valid object; add `requestId`):

First, update the existing `validBody()` in this file to include `requestId: "req-1"` in the returned object (add the line alongside `language`/`clinicId`). Then append:

```js
test("requestId is required", () => {
  const body = validBody();
  delete body.requestId;
  assert.ok(validateRegistration(body, true).some((e) => /request id/i.test(e)));
});
```

- [ ] **Step 2: Run it (fails)** — `node --test test/validation.test.js` → the new test FAILS.

- [ ] **Step 3: Add requestId check to `backend/src/lib/validation.js`** — inside `validateRegistration`, after the `body.consent` check, add:

```js
  if (!isNonEmptyString(body.requestId)) errors.push("Request ID is required.");
```

- [ ] **Step 4: Run it (passes)** — `node --test test/validation.test.js` → PASS (all, including the new test).

- [ ] **Step 5: Rewrite `backend/src/routes/registration.js`**:

```js
import express from "express";
import { validateRegistration } from "../lib/validation.js";
import { computeTriage } from "../lib/triage.js";
import { nextArogyaId } from "../lib/arogyaId.js";
import { triageMessage } from "../lib/messages.js";

export function registrationRouter(db) {
  const router = express.Router();
  const clinicExistsStmt = db.prepare("SELECT 1 AS one FROM clinics WHERE clinic_id = ?");
  const findByRequestId = db.prepare(
    "SELECT arogya_id, triage FROM registrations WHERE request_id = ?"
  );
  const insert = db.prepare(
    `INSERT INTO registrations
       (arogya_id, clinic_id, language, patient_json, screening_flags, triage, consent, created_at, request_id)
     VALUES
       (@arogyaId, @clinicId, @language, @patientJson, @flags, @triage, @consent, @createdAt, @requestId)`
  );

  router.post("/", (req, res) => {
    const body = req.body || {};
    const clinicId = typeof body.clinicId === "string" ? body.clinicId.trim() : "";
    const clinicExists = !!clinicExistsStmt.get(clinicId);

    const errors = validateRegistration(body, clinicExists);
    if (errors.length > 0) {
      res.status(400).type("text/plain").send(errors.join(" "));
      return;
    }

    const triage = computeTriage(body.screening.flags);
    const createdAt = new Date().toISOString();
    const requestId = body.requestId;

    // Idempotent: a replay of the same requestId returns the original result
    // and does NOT advance the per-clinic counter or insert a duplicate.
    const outcome = db.transaction(() => {
      const existing = findByRequestId.get(requestId);
      if (existing) {
        return { arogyaId: existing.arogya_id, triage: existing.triage };
      }
      const id = nextArogyaId(db, clinicId);
      insert.run({
        arogyaId: id,
        clinicId,
        language: body.language,
        patientJson: JSON.stringify(body.patient),
        flags: JSON.stringify(body.screening.flags),
        triage,
        consent: body.consent ? 1 : 0,
        createdAt,
        requestId,
      });
      return { arogyaId: id, triage };
    })();

    res.json({
      arogyaId: outcome.arogyaId,
      triage: outcome.triage,
      message: triageMessage(outcome.triage, body.language),
    });
  });

  return router;
}
```

- [ ] **Step 6: Update `backend/test/registration.route.test.js`** — make `validBody` mint a unique requestId by default, and add idempotency tests. Replace the `validBody` helper with:

```js
import { randomUUID } from "node:crypto";

function validBody(overrides = {}) {
  return {
    requestId: randomUUID(),
    language: "en",
    clinicId: "AC-005",
    patient: {
      fullName: "Nimal Perera", nic: "199012345678", phn: "",
      gender: "male", dateOfBirth: "1990-01-01", householdAddress: "",
      relationshipToHead: null, gnDivision: null, mobile: "0771234567",
      maritalStatus: null, occupation: null, education: null,
    },
    screening: { flags: Array(11).fill(false) },
    consent: true,
    ...overrides,
  };
}
```

Then append these tests:

```js
test("replaying the same requestId returns the original id, inserts no duplicate, and does not advance the counter", async () => {
  const db = freshDb();
  const app = createApp(db);
  const body = validBody();
  const first = await request(app).post("/registration").send(body);
  const second = await request(app).post("/registration").send(body); // same requestId
  assert.equal(second.status, 200);
  assert.equal(second.body.arogyaId, first.body.arogyaId);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM registrations").get().c, 1);
  // A fresh (different requestId) submission gets the NEXT sequence, proving no ID was burned.
  const third = await request(app).post("/registration").send(validBody());
  assert.equal(third.body.arogyaId, "AC-005-000002");
});

test("missing requestId is rejected with 400", async () => {
  const app = createApp(freshDb());
  const body = validBody();
  delete body.requestId;
  const res = await request(app).post("/registration").send(body);
  assert.equal(res.status, 400);
});

test("consent is persisted as 1 for a consenting registration", async () => {
  const db = freshDb();
  const app = createApp(db);
  await request(app).post("/registration").send(validBody());
  assert.equal(db.prepare("SELECT consent FROM registrations").get().consent, 1);
});
```

- [ ] **Step 7: Run the full backend suite** — `npm test` → all green (existing + new). The "increments on second submission" test passes because each `validBody()` now has a distinct requestId.

- [ ] **Step 8: Commit**

```bash
git add src/lib/validation.js src/routes/registration.js test/validation.test.js test/registration.route.test.js
git commit -m "feat(api): idempotent registration via request_id (no duplicate rows / burned ids); persist consent value"
```

---

### Task 3: PII-safe error logging + graceful shutdown (backend)

**Files:**
- Modify: `backend/src/app.js`
- Modify: `backend/src/server.js`
- Modify: `backend/test/registration.route.test.js` (one error-path test)

- [ ] **Step 1: Add a failing test** for the malformed-JSON path — append to `backend/test/registration.route.test.js`:

```js
test("malformed JSON body is rejected with 400 plain text", async () => {
  const app = createApp(freshDb());
  const res = await request(app)
    .post("/registration")
    .set("Content-Type", "application/json")
    .send('{"clinicId":'); // truncated JSON
  assert.equal(res.status, 400);
  assert.match(res.text, /JSON/i);
});
```

- [ ] **Step 2: Run it** — `node --test test/registration.route.test.js` → PASS already (the existing `entity.parse.failed` handler covers it). This test locks the behavior so the Step 3 logging change can't regress it.

- [ ] **Step 3: Make the error handler PII-safe in `backend/src/app.js`** — replace the error-handler block's `console.error(err);` line with a message/code-only log:

```js
  app.use((err, _req, res, _next) => {
    if (err && err.type === "entity.parse.failed") {
      res.status(400).type("text/plain").send("Invalid JSON body.");
      return;
    }
    // Log message + code only — never the full error (better-sqlite3 errors can
    // carry bound params, i.e. patient PII) into pm2's plaintext logs.
    console.error(
      "[arogya] request error:",
      err && err.message ? err.message : String(err),
      err && err.code ? `(${err.code})` : ""
    );
    res.status(500).type("text/plain").send("Internal server error.");
  });
```

- [ ] **Step 4: Add graceful shutdown to `backend/src/server.js`** — replace the file with:

```js
import { openDb } from "./db.js";
import { createApp } from "./app.js";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 4000;

const db = openDb();
const app = createApp(db);

const server = app.listen(PORT, HOST, () => {
  console.log(`Arogya backend listening on http://${HOST}:${PORT}`);
});

// On deploy/reboot pm2 sends SIGTERM: stop accepting, finish in-flight,
// then close the DB so WAL is checkpointed cleanly.
function shutdown(signal) {
  console.log(`[arogya] ${signal} received, shutting down`);
  server.close(() => {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
```

- [ ] **Step 5: Run the full suite** — `npm test` → all green. (Graceful shutdown is smoke-verified by the operator at deploy time, not unit-tested.)

- [ ] **Step 6: Commit**

```bash
git add src/app.js src/server.js test/registration.route.test.js
git commit -m "feat(backend): PII-safe error logging + graceful shutdown (SIGTERM/SIGINT closes DB)"
```

---

### Task 4: Structured API errors + `mapApiError` helper (frontend, TDD)

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/services/api.ts`
- Create: `frontend/src/lib/apiError.ts`
- Create: `frontend/src/lib/apiError.test.ts`

- [ ] **Step 1: Update `frontend/src/types.ts`** — replace the `ApiResult` definition with a structured error, add `requestId` to the request, and add `requestId` to `AppState`:

```ts
export interface ApiSuccess<T> {
  ok: true;
  data: T;
}

export interface ApiError {
  ok: false;
  error: string; // raw text, for console/logging only — never shown to patients
  status?: number; // HTTP status, when the failure was an HTTP error
  kind: "timeout" | "network" | "http";
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;
```

In `RegistrationRequest`, add `requestId: string;` as the first field:

```ts
export interface RegistrationRequest {
  requestId: string;
  language: string;
  clinicId: string;
  patient: RegistrationData;
  screening: { flags: boolean[] };
  consent: boolean;
}
```

In `AppState`, add `requestId: string | null;` (after `clinicName`).

- [ ] **Step 2: Update `frontend/src/services/api.ts`** — replace the error returns in `request<T>()` so callers get a `kind`:

Replace the `if (!response.ok) { ... }` block with:

```ts
    if (!response.ok) {
      const body = await response.text();
      return { ok: false, error: body || `HTTP ${response.status}`, status: response.status, kind: "http" };
    }
```

Replace the `catch (err) { ... }` block with:

```ts
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "timeout", kind: "timeout" };
    }
    return { ok: false, error: String(err), kind: "network" };
  }
```

- [ ] **Step 3: Write the failing test** — `frontend/src/lib/apiError.test.ts`:

```ts
import { test, expect } from "vitest";
import { mapApiError } from "./apiError";
import type { ApiError } from "../types";

const langs = ["en", "si", "ta"] as const;

test("returns a non-empty localized string for every error kind and language", () => {
  const cases: ApiError[] = [
    { ok: false, error: "x", kind: "timeout" },
    { ok: false, error: "x", kind: "network" },
    { ok: false, error: "x", status: 400, kind: "http" },
    { ok: false, error: "x", status: 500, kind: "http" },
  ];
  for (const lang of langs) {
    for (const c of cases) {
      expect(mapApiError(c, lang).length).toBeGreaterThan(0);
    }
  }
});

test("never returns the raw backend error text", () => {
  const raw = "Error: SQLITE_CONSTRAINT at /var/lib/arogya/arogya.db";
  const msg = mapApiError({ ok: false, error: raw, status: 500, kind: "http" }, "en");
  expect(msg).not.toContain(raw);
});
```

- [ ] **Step 4: Run it (fails)** — `npx vitest run src/lib/apiError.test.ts` → FAIL (module/translations not present).

- [ ] **Step 5: Create `frontend/src/lib/apiError.ts`**:

```ts
import type { ApiError } from "../types";
import { Language, text } from "../translations";

// Maps a structured API failure to a friendly, localized message.
// Patients must never see raw backend/stack text.
export function mapApiError(err: ApiError, language: Language): string {
  const e = text[language].errors;
  if (err.kind === "timeout") return e.timeout;
  if (err.kind === "network") return e.network;
  if (err.status && err.status >= 400 && err.status < 500) return e.rejected;
  return e.server;
}
```

(`text[language].errors` is added in Task 7. Implement Task 7's translations first if the typecheck blocks you, or proceed — the test run in Step 6 comes after Task 7 in execution order.)

- [ ] **Step 6: Run it (passes)** — after Task 7 lands the `errors` keys: `npx vitest run src/lib/apiError.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/services/api.ts src/lib/apiError.ts src/lib/apiError.test.ts
git commit -m "feat(frontend): structured API errors + mapApiError (friendly localized messages)"
```

---

### Task 5: requestId + one-shot submit guard + idempotent retry (frontend)

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/TriageSummaryScreen.tsx`

- [ ] **Step 1: Thread `requestId` through `App.tsx`.**

In `initialState()`, add `requestId: null,` to the returned object.

In `handleQuestionnaireComplete`, mint a fresh id when entering the summary:

```ts
  const handleQuestionnaireComplete = (flags: boolean[], consent: boolean) => {
    setState((s) => ({
      ...s,
      screeningFlags: flags,
      consent,
      requestId: crypto.randomUUID(),
      screen: "triage",
    }));
  };
```

In the `triage` screen render, pass `requestId={state.requestId ?? ""}` to `<TriageSummaryScreen ... />`.

- [ ] **Step 2: Rewrite `frontend/src/components/TriageSummaryScreen.tsx`** — add the `requestId` prop, a one-shot `useRef` guard (survives React 19 StrictMode double-invoke), a reusable `submit()`, friendly errors, and an in-place Retry:

```tsx
import React, { useState, useEffect, useRef } from "react";
import { Language, text } from "../translations";
import type { RegistrationData, TriageResult } from "../types";
import { submitRegistration } from "../services/api";
import { mapApiError } from "../lib/apiError";
import { motion } from "motion/react";
import { AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";

interface Props {
  language: Language;
  clinicId: string;
  requestId: string;
  registration: RegistrationData;
  screeningFlags: boolean[];
  consent: boolean;
  onReset: () => void;
}

export function TriageSummaryScreen({
  language, clinicId, requestId, registration, screeningFlags, consent, onReset,
}: Props) {
  const t = text[language];
  const [isSubmitting, setIsSubmitting] = useState(true);
  const [result, setResult] = useState<TriageResult | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const startedRef = useRef(false);

  // Reusable so the Retry button can re-run it with the SAME requestId (idempotent server-side).
  async function submit() {
    setIsSubmitting(true);
    setSubmitError(null);
    const res = await submitRegistration({
      requestId,
      language,
      clinicId,
      patient: { ...registration },
      screening: { flags: screeningFlags },
      consent,
    });
    if (!res.ok) {
      setSubmitError(mapApiError(res, language));
      setIsSubmitting(false);
      return;
    }
    setResult({ level: res.data.triage, message: res.data.message, arogyaId: res.data.arogyaId });
    setIsSubmitting(false);
  }

  useEffect(() => {
    if (startedRef.current) return; // StrictMode's second invoke bails — exactly one submit
    startedRef.current = true;
    submit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isHighRisk = result?.level === "high-risk";

  if (isSubmitting) {
    return (
      <div className="h-full bg-[#F6F9F7] flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 rounded-full bg-[#E1F0E9] flex items-center justify-center mb-6">
          <svg className="animate-spin h-10 w-10 text-[#0A5C43]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path>
          </svg>
        </div>
        <h2 className="text-[22px] font-bold text-[#0A5C43] mb-3">{t.screening.submitting}</h2>
        <p className="text-[15px] text-[#4F675C] text-center">{t.screening.submittingHint}</p>
      </div>
    );
  }

  if (submitError) {
    return (
      <div className="h-full bg-[#F6F9F7] flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 rounded-full bg-[#FFF2F2] flex items-center justify-center mb-6">
          <AlertCircle size={36} className="text-[#D32F2F]" strokeWidth={2.5} />
        </div>
        <h2 className="text-[22px] font-bold text-[#B71C1C] mb-3">{t.screening.unableTitle}</h2>
        <p className="text-[15px] text-[#4F675C] text-center mb-2">{submitError}</p>
        <p className="text-[14px] text-[#4F675C] text-center mb-8">{t.screening.askStaff}</p>
        <button onClick={submit}
          className="w-full max-w-[300px] py-[16px] bg-[#0A5C43] hover:bg-[#074734] text-white rounded-[12px] font-bold text-[15px] transition-all flex items-center justify-center gap-2 mb-3 focus:outline-none focus:ring-4 focus:ring-[#2C8567]">
          <RotateCcw size={18} strokeWidth={2.5} />
          {t.tryAgain}
        </button>
        <button onClick={onReset}
          className="w-full max-w-[300px] py-[16px] bg-white border-[1.5px] border-[#0A5C43] text-[#0A5C43] hover:bg-[#EAF5F0] rounded-[12px] font-bold text-[15px] transition-all flex items-center justify-center gap-2">
          {t.startOver}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#F6F9F7] flex flex-col relative overflow-y-auto hidden-scrollbar">
      <div className="bg-[#F6F9F7] pt-5 pb-4 px-4 flex items-center sticky top-0 z-10 border-b border-gray-200">
        <h1 className="text-[19px] font-bold text-[#0A5C43] tracking-tight mx-auto">{t.screening.complete}</h1>
      </div>

      <div className="flex-1 p-6 flex flex-col items-center justify-center -mt-6">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="w-full bg-white rounded-[24px] shadow-sm border border-gray-100 overflow-hidden">
          <div className={`p-10 flex flex-col items-center text-center ${isHighRisk ? "bg-[#FFF2F2]" : "bg-[#E1F0E9]"}`}>
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.2 }}
              className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm border-[2px] ${
                isHighRisk ? "bg-[#FFE5E5] text-[#D32F2F] border-[#FFCDCD]" : "bg-[#D6F2E5] text-[#0A5C43] border-[#BCE4D3]"
              }`}>
              {isHighRisk ? <AlertCircle size={36} strokeWidth={2.5} /> : <CheckCircle2 size={36} strokeWidth={2.5} />}
            </motion.div>
            <h2 className={`text-[22px] font-bold mb-3 tracking-tight ${isHighRisk ? "text-[#B71C1C]" : "text-[#0A5C43]"}`}>
              {isHighRisk ? t.screening.attention : t.screening.allSet}
            </h2>
            <p className={`text-[15px] font-medium leading-relaxed ${isHighRisk ? "text-[#C62828]" : "text-[#1B4332]"}`}>
              {result?.message || (isHighRisk ? t.triageDengue : t.triageNormal)}
            </p>
          </div>
          {result?.arogyaId && (
            <div className="p-5 flex flex-col items-center border-t border-gray-100">
              <span className="text-[12px] font-bold text-[#758D81] uppercase tracking-[0.12em] mb-1">{t.reg.arogyaId}</span>
              <span className="text-[22px] font-bold text-[#0A5C43] tracking-wide">{result.arogyaId}</span>
            </div>
          )}
        </motion.div>

        <div className="w-full mt-10">
          <button onClick={onReset}
            className="w-full py-[16px] bg-white border-[1.5px] border-[#0A5C43] text-[#0A5C43] hover:bg-[#EAF5F0] rounded-[12px] font-bold text-[15px] transition-all flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-[#D6F2E5]">
            <RotateCcw size={18} strokeWidth={2.5} />
            {t.startOver}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2b: Typecheck + build** — `npm run lint && npm run build` → no errors. (`t.tryAgain` resolves after Task 7; run this step after Task 7 if needed.)

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx src/components/TriageSummaryScreen.tsx
git commit -m "feat(frontend): stable requestId + one-shot submit guard + idempotent retry + friendly errors"
```

---

### Task 6: Lift questionnaire state + idle reset (frontend)

**Files:**
- Modify: `frontend/src/components/QuestionnaireScreen.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Make `QuestionnaireScreen` accept initial state.** Change its `Props` and the two `useState` initializers:

```tsx
import { emptyScreeningState, toggleSymptom, toggleNone, isScreeningComplete } from "../lib/screening";
import { SCREENING_ITEM_COUNT } from "../lib/screening";

interface Props {
  language: Language;
  initialFlags?: boolean[];
  initialNone?: boolean;
  initialConsent?: boolean;
  onBack: () => void;
  onComplete: (flags: boolean[], none: boolean, consent: boolean) => void;
}

export function QuestionnaireScreen({
  language, initialFlags, initialNone, initialConsent, onBack, onComplete,
}: Props) {
  const t = text[language];
  const [state, setState] = useState(() =>
    initialFlags && initialFlags.length === SCREENING_ITEM_COUNT
      ? { flags: [...initialFlags], none: !!initialNone }
      : emptyScreeningState()
  );
  const [consent, setConsent] = useState(!!initialConsent);
```

And update the submit handler call at the bottom (the `onClick` on the submit button) to pass `none`:

```tsx
        <button onClick={() => complete && onComplete(state.flags, state.none, consent)} disabled={!complete}
```

(Everything else in the component is unchanged.)

- [ ] **Step 2: Lift the state into `App.tsx`.**

Add to `AppState` in `types.ts`: `screeningNone: boolean;` (next to `screeningFlags`).

In `initialState()` add `screeningNone: false,`.

Change `handleQuestionnaireComplete` to capture `none`:

```ts
  const handleQuestionnaireComplete = (flags: boolean[], none: boolean, consent: boolean) => {
    setState((s) => ({
      ...s,
      screeningFlags: flags,
      screeningNone: none,
      consent,
      requestId: crypto.randomUUID(),
      screen: "triage",
    }));
  };
```

Pass the stored values back into the questionnaire so Back→forward preserves answers — in the `questionnaire` render:

```tsx
              <QuestionnaireScreen
                language={state.language}
                initialFlags={state.screeningFlags.length ? state.screeningFlags : undefined}
                initialNone={state.screeningNone}
                initialConsent={state.consent}
                onBack={() => setState((s) => ({ ...s, screen: "registration" }))}
                onComplete={handleQuestionnaireComplete}
              />
```

- [ ] **Step 3: Add the inactivity reset.** In `App.tsx`, add this effect inside the component (after the existing effects):

```ts
  // Kiosk privacy: after inactivity, wipe PII and return to the language screen so
  // the next patient never sees the previous patient's data. Disabled on the
  // language screen (no PII entered yet).
  useEffect(() => {
    if (state.screen === "language") return;
    const IDLE_MS = 90_000;
    let timer = window.setTimeout(() => handleReset(), IDLE_MS);
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => handleReset(), IDLE_MS);
    };
    const events: Array<keyof WindowEventMap> = ["pointerdown", "keydown", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, bump));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.screen]);
```

`handleReset` already resets to `initialState(s.clinicId)` (preserving clinic, wiping registration/screening/consent) — confirm it also clears `requestId` (it does, via `initialState`).

- [ ] **Step 4: Typecheck + build** — `npm run lint && npm run build` → no errors.

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/QuestionnaireScreen.tsx src/types.ts
git commit -m "feat(frontend): preserve questionnaire answers on Back + idle reset wipes PII between patients"
```

---

### Task 7: Translations — retry + friendly error strings (frontend)

**Files:**
- Modify: `frontend/src/translations.ts`

- [ ] **Step 1: Add keys to all three languages.** For each of the `en`, `si`, `ta` blocks, add a top-level `tryAgain` string and an `errors` object. Use these values:

English (`en`):
```ts
    tryAgain: "Try Again",
    errors: {
      timeout: "The connection is slow. Please tap Try Again.",
      network: "Cannot reach the server. Please check the connection and try again.",
      rejected: "We could not process this submission. Please ask staff for assistance.",
      server: "Something went wrong on our side. Please tap Try Again or ask staff.",
    },
```

Sinhala (`si`):
```ts
    tryAgain: "නැවත උත්සාහ කරන්න",
    errors: {
      timeout: "සම්බන්ධතාවය මන්දගාමීයි. කරුණාකර නැවත උත්සාහ කරන්න ඔබන්න.",
      network: "සේවාදායකය වෙත සම්බන්ධ විය නොහැක. කරුණාකර සම්බන්ධතාවය පරීක්ෂා කර නැවත උත්සාහ කරන්න.",
      rejected: "මෙම ඉදිරිපත් කිරීම සැකසිය නොහැකි විය. කරුණාකර කාර්ය මණ්ඩලයෙන් සහාය ලබා ගන්න.",
      server: "අපගේ පැත්තෙන් දෝෂයක් ඇති විය. කරුණාකර නැවත උත්සාහ කරන්න හෝ කාර්ය මණ්ඩලයෙන් අසන්න.",
    },
```

Tamil (`ta`):
```ts
    tryAgain: "மீண்டும் முயற்சிக்கவும்",
    errors: {
      timeout: "இணைப்பு மெதுவாக உள்ளது. மீண்டும் முயற்சிக்கவும் என்பதை அழுத்தவும்.",
      network: "சேவையகத்தை அணுக முடியவில்லை. இணைப்பைச் சரிபார்த்து மீண்டும் முயற்சிக்கவும்.",
      rejected: "இந்தச் சமர்ப்பிப்பைச் செயலாக்க முடியவில்லை. பணியாளரிடம் உதவி கேட்கவும்.",
      server: "எங்கள் தரப்பில் ஒரு பிழை ஏற்பட்டது. மீண்டும் முயற்சிக்கவும் அல்லது பணியாளரிடம் கேட்கவும்.",
    },
```

> The si/ta strings are natural translations consistent with the existing tone; a Sinhala/Tamil reviewer should confirm wording before a clinical rollout.

- [ ] **Step 2: Typecheck + build** — `npm run lint && npm run build` → no errors. TypeScript enforces that all three language objects share the same shape, so a missing key in any language fails the build.

- [ ] **Step 3: Run the frontend unit tests** — `npx vitest run` → all pass, including `src/lib/apiError.test.ts` (now that `errors.*` exists) and the existing `translations.test.ts` parity test.

- [ ] **Step 4: Commit**

```bash
git add src/translations.ts
git commit -m "feat(i18n): add tryAgain + friendly error messages (en/si/ta)"
```

---

### Task 8: Operational hardening in `go-live.sh` (DB perms + pm2 boot)

**Files:**
- Modify: `go-live.sh` (repo root)

- [ ] **Step 1: Restrict the DB directory.** In the `[4/8]` block, after the `chown` line, add a `chmod`:

```bash
sudo mkdir -p "$DBDIR"
sudo chown "$(id -un)":"$(id -gn)" "$DBDIR"
sudo chmod 0700 "$DBDIR"
```

- [ ] **Step 2: Restrict the DB file** (it's created by the backend on first start). In the `[6/8]` block, after `pm2 save`, add:

```bash
# Lock down the SQLite files once the backend has created them (PII at rest).
sleep 1
for f in "$DBDIR/arogya.db" "$DBDIR/arogya.db-wal" "$DBDIR/arogya.db-shm"; do
  [ -f "$f" ] && chmod 0600 "$f" || true
done
```

- [ ] **Step 3: Make pm2 boot persistence required, not optional.** Replace the final optional block (the `echo "Optional — start the backend automatically..."` heredoc lines) with an executed startup:

```bash
log "Enabling pm2 start-on-boot (systemd)"
sudo env PATH="$PATH" "$(command -v pm2)" startup systemd -u "$(id -un)" --hp "$HOME"
pm2 save
```

- [ ] **Step 4: Syntax-check** — `bash -n go-live.sh` → no output. Do NOT run the script (operator-run).

- [ ] **Step 5: Commit**

```bash
git add go-live.sh
git commit -m "feat(ops): restrict SQLite dir/file perms (0700/0600) + required pm2 boot persistence"
```

---

### Task 9: Final verification

- [ ] **Step 1: Backend suite** — from `backend/`: `npm test` → all green (triage, messages, validation, db, arogyaId, clinics route, registration route incl. idempotency).
- [ ] **Step 2: Frontend tests + build** — from `frontend/`: `npx vitest run && npm run lint && npm run build` → all pass; note the new bundle hash.
- [ ] **Step 3: Confirm `go-live.sh` is syntactically valid and executable** — `bash -n go-live.sh && ls -l go-live.sh`.

---

## Self-Review Notes
- **Spec coverage:** 0.1 (Tasks 1,2,5), 0.2 (Task 6), 0.3 (Task 2), 0.4 (Task 6), 1.1 (Task 8), 1.5 (Task 3), 1.6 (Task 3), 1.7 (Task 8), 2.1a retry (Task 5), 2.4 friendly errors (Tasks 4,5,7).
- **Idempotency correctness lives server-side** (Task 2, fully TDD) — the frontend guard (Task 5) is belt-and-suspenders; even a double-fire dedups to one row with no burned ID.
- **No placeholders:** every code step is complete.
- **Type/naming consistency:** `requestId` used end-to-end (types.ts → api.ts → App.tsx → TriageSummaryScreen → backend body → `request_id` column); `mapApiError`, `ApiError`, `text[lang].errors`, `tryAgain` consistent across Tasks 4/5/7; `onComplete(flags, none, consent)` signature matches between QuestionnaireScreen (Task 6) and App (Task 6).
- **Cross-task ordering:** Task 4 references `text[lang].errors`/`tryAgain` added in Task 7; the typecheck/test steps in Tasks 4 and 5 are explicitly deferred until Task 7 lands. Execute 1→9 in order and the chain is green at each commit except the noted deferred verifications.
- **Deferred (next plan):** NIC/mobile backend validation (3.2), per-clinic GN divisions (3.3), persist age (3.4), id-based triage mapping (3.1), PWA/offline queue (2.2), component-test infra (5.2), backups (1.3), rate-limiting (1.4).
