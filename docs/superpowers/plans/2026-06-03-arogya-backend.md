# Arogya Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Node.js (Express + better-sqlite3) backend for the Arogya registration app — clinic validation, triage, per-clinic Arogya-ID generation, SQLite persistence — plus pm2 config and safe build/ship/deploy scripts that never disturb the co-hosted DHIS2.

**Architecture:** A small Express app bound to `127.0.0.1:4000`, run under pm2, reverse-proxied by Caddy at `/arogya/api/*` (Caddy strips the prefix → routes `/clinics/validate`, `/registration`). SQLite at `/var/lib/arogya/arogya.db` with idempotent migrations and clinic seeding. Pure helpers (triage, validation, Arogya-ID) are unit-tested; routes are integration-tested with supertest against a temp DB.

**Tech Stack:** Node v24 (ESM), Express, better-sqlite3, `node:test` + supertest. pm2 for process management. Caddy reverse proxy.

**Spec:** `docs/superpowers/specs/2026-06-03-arogya-backend-design.md`

---

## Conventions

- All backend code lives in `/home/developper/arogya-entry/backend/` (its own git repo).
- ESM (`"type": "module"`). Because Express is CommonJS, **always** use
  `import express from "express"` and `express.Router()` (do **not** use
  `import { Router } from "express"` — named imports of runtime-assigned properties are
  unreliable under Node ESM). Same for `import Database from "better-sqlite3"`.
- Run all commands from `/home/developper/arogya-entry/backend` unless stated otherwise.
- The two orchestration scripts (`setup.sh`, `deploy.sh`) also live in `backend/` but use
  absolute repo paths so they can build/ship the sibling `frontend/`.

## File Structure Map

| File | Action | Responsibility |
|------|--------|----------------|
| `backend/package.json` | Create | Scripts + deps |
| `backend/.gitignore` | Create | Ignore node_modules, logs, local data |
| `backend/src/data/clinics.seed.json` | Create | 40-clinic seed (copied from docs) |
| `backend/src/lib/triage.js` | Create | `computeTriage(flags)` |
| `backend/src/lib/messages.js` | Create | Trilingual triage messages |
| `backend/src/lib/validation.js` | Create | `validateRegistration(body, clinicExists)` |
| `backend/src/db.js` | Create | better-sqlite3 connection, migrations, seeding |
| `backend/src/lib/arogyaId.js` | Create | `nextArogyaId(db, clinicId)` |
| `backend/src/routes/clinics.js` | Create | `POST /clinics/validate` |
| `backend/src/routes/registration.js` | Create | `POST /registration` |
| `backend/src/app.js` | Create | Express app + route mounting (exported) |
| `backend/src/server.js` | Create | Bootstrap + listen |
| `backend/test/helpers.js` | Create | `freshDb()` temp-DB helper |
| `backend/test/*.test.js` | Create | Unit + integration tests |
| `backend/ecosystem.config.cjs` | Create | pm2 process config |
| `backend/setup.sh` | Create | One-time bootstrap (pm2, DB dir, Caddy patch) |
| `backend/deploy.sh` | Create | Build frontend+backend, ship, restart, reload Caddy |

---

### Task 1: Scaffold the backend project

**Files:**
- Create: `backend/package.json`, `backend/.gitignore`

- [ ] **Step 1: Initialise git and create `backend/package.json`**

From `/home/developper/arogya-entry/backend`:
```bash
git init
```

`backend/package.json`:
```json
{
  "name": "arogya-entry-backend",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "start": "node src/server.js",
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Create `backend/.gitignore`**

```gitignore
node_modules/
*.log
data/
.env
```

- [ ] **Step 3: Install dependencies**

Run:
```bash
npm install express better-sqlite3
npm install --save-dev supertest
```
Expected: `package.json` gains `dependencies` (express, better-sqlite3) and `devDependencies` (supertest); `package-lock.json` is created. Note: better-sqlite3 may compile from source on Node 24 (build tools are present) — this can take a minute and is normal.

- [ ] **Step 4: Verify the test runner works (no tests yet)**

Run: `npm test`
Expected: `node --test` runs and reports no test files (exit code may be non-zero; that's fine until Task 3 adds a test).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: scaffold backend (express, better-sqlite3, supertest)"
```

---

### Task 2: Clinic seed data

**Files:**
- Create: `backend/src/data/clinics.seed.json`

- [ ] **Step 1: Copy the 40-clinic seed from docs**

Run:
```bash
mkdir -p src/data
cp /home/developper/arogya-entry/docs/clinics.seed.json src/data/clinics.seed.json
```

- [ ] **Step 2: Verify it has 40 records with the expected shape**

Run:
```bash
node -e "const c=require('./src/data/clinics.seed.json'); console.log(c.length, c[4].clinicId, c[4].name)"
```
Expected output: `40 AC-005 Kirinda`
(Note: this uses `require` only as a quick check; the app reads it with `readFileSync`.)

- [ ] **Step 3: Commit**

```bash
git add src/data/clinics.seed.json
git commit -m "feat: add 40-clinic seed data"
```

---

### Task 3: Triage helper (TDD)

**Files:**
- Create: `backend/src/lib/triage.js`
- Test: `backend/test/triage.test.js`

- [ ] **Step 1: Write the failing test**

`backend/test/triage.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTriage } from "../src/lib/triage.js";

function flags(...indices) {
  const a = Array(11).fill(false);
  for (const i of indices) a[i] = true;
  return a;
}

test("high-risk when any of flags 1-5 (index 0-4) is set", () => {
  assert.equal(computeTriage(flags(0)), "high-risk");
  assert.equal(computeTriage(flags(4)), "high-risk");
  assert.equal(computeTriage(flags(2, 7)), "high-risk");
});

test("normal when only flags 6-11 (index 5-10) are set", () => {
  assert.equal(computeTriage(flags(5)), "normal");
  assert.equal(computeTriage(flags(5, 6, 7, 8, 9, 10)), "normal");
});

test("normal when none are set", () => {
  assert.equal(computeTriage(flags()), "normal");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/triage.test.js`
Expected: FAIL — cannot find module `../src/lib/triage.js`.

- [ ] **Step 3: Write the implementation**

`backend/src/lib/triage.js`:
```js
// Screening flag indices (0-based) that mean high-risk / urgent referral:
// items 1-5 = chest pain, 2-week depression, weight loss, breast lump, non-healing oral lesion.
export const HIGH_RISK_FLAGS = [0, 1, 2, 3, 4];

export function computeTriage(flags) {
  const highRisk = HIGH_RISK_FLAGS.some((i) => flags[i] === true);
  return highRisk ? "high-risk" : "normal";
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/triage.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/triage.js test/triage.test.js
git commit -m "feat: triage helper with tests"
```

---

### Task 4: Triage messages (TDD)

**Files:**
- Create: `backend/src/lib/messages.js`
- Test: `backend/test/messages.test.js`

- [ ] **Step 1: Write the failing test**

`backend/test/messages.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { triageMessage } from "../src/lib/messages.js";

test("returns a non-empty string for each triage/language", () => {
  for (const triage of ["high-risk", "normal"]) {
    for (const lang of ["en", "si", "ta"]) {
      assert.ok(triageMessage(triage, lang).length > 0);
    }
  }
});

test("falls back to English for an unknown language", () => {
  assert.equal(triageMessage("normal", "xx"), triageMessage("normal", "en"));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/messages.test.js`
Expected: FAIL — cannot find module `../src/lib/messages.js`.

- [ ] **Step 3: Write the implementation**

`backend/src/lib/messages.js`:
```js
const MESSAGES = {
  "high-risk": {
    en: "Some of your responses need prompt attention. Please proceed to the triage counter.",
    si: "ඔබගේ පිළිතුරු කිහිපයකට කඩිනම් අවධානය අවශ්‍ය වේ. කරුණාකර ත්‍රියාජ් කවුන්ටරයට යන්න.",
    ta: "உங்கள் சில பதில்களுக்கு உடனடி கவனம் தேவை. தயவுசெய்து திரியேஜ் கவுண்டருக்குச் செல்லவும்.",
  },
  normal: {
    en: "Registration successful. Please proceed to the main clinic lobby.",
    si: "ලියාපදිංචිය සාර්ථකයි. කරුණාකර ප්‍රධාන සායන ශාලාවට යන්න.",
    ta: "பதிவு வெற்றிகரமானது. தயவுசெய்து முதன்மை கிளினிக் மண்டபத்திற்குச் செல்லவும்.",
  },
};

export function triageMessage(triage, language) {
  const byLang = MESSAGES[triage] || MESSAGES.normal;
  return byLang[language] || byLang.en;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/messages.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/messages.js test/messages.test.js
git commit -m "feat: trilingual triage messages with tests"
```

---

### Task 5: Registration validation (TDD)

**Files:**
- Create: `backend/src/lib/validation.js`
- Test: `backend/test/validation.test.js`

- [ ] **Step 1: Write the failing test**

`backend/test/validation.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRegistration } from "../src/lib/validation.js";

function validBody(overrides = {}) {
  return {
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

test("valid payload returns no errors", () => {
  assert.deepEqual(validateRegistration(validBody(), true), []);
});

test("unknown clinic is rejected", () => {
  const errors = validateRegistration(validBody(), false);
  assert.ok(errors.some((e) => /clinic/i.test(e)));
});

test("consent must be true", () => {
  const errors = validateRegistration(validBody({ consent: false }), true);
  assert.ok(errors.some((e) => /consent/i.test(e)));
});

test("flags must be 11 booleans", () => {
  assert.ok(validateRegistration(validBody({ screening: { flags: [true, false] } }), true).length > 0);
  assert.ok(validateRegistration(validBody({ screening: { flags: Array(11).fill("x") } }), true).length > 0);
});

test("missing required patient fields are rejected", () => {
  const body = validBody();
  body.patient.fullName = " ";
  body.patient.gender = null;
  body.patient.dateOfBirth = "";
  body.patient.mobile = "";
  const errors = validateRegistration(body, true);
  assert.ok(errors.some((e) => /name/i.test(e)));
  assert.ok(errors.some((e) => /gender/i.test(e)));
  assert.ok(errors.some((e) => /birth/i.test(e)));
  assert.ok(errors.some((e) => /mobile/i.test(e)));
});

test("requires at least one of NIC or PHN", () => {
  const body = validBody();
  body.patient.nic = "";
  body.patient.phn = "";
  assert.ok(validateRegistration(body, true).some((e) => /NIC|PHN/i.test(e)));
  const ok = validBody();
  ok.patient.nic = "";
  ok.patient.phn = "PHN-1";
  assert.deepEqual(validateRegistration(ok, true), []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/validation.test.js`
Expected: FAIL — cannot find module `../src/lib/validation.js`.

- [ ] **Step 3: Write the implementation**

`backend/src/lib/validation.js`:
```js
const LANGS = ["en", "si", "ta"];

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

export function validateRegistration(body, clinicExists) {
  if (!body || typeof body !== "object") return ["Invalid request body."];
  const errors = [];

  if (!clinicExists) errors.push("Unknown clinic.");
  if (!LANGS.includes(body.language)) errors.push("Invalid language.");
  if (body.consent !== true) errors.push("Consent is required.");

  const flags = body.screening && body.screening.flags;
  if (!Array.isArray(flags) || flags.length !== 11 || !flags.every((f) => typeof f === "boolean")) {
    errors.push("Screening flags must be an array of 11 booleans.");
  }

  const p = body.patient || {};
  if (!isNonEmptyString(p.fullName)) errors.push("Full name is required.");
  if (p.gender !== "male" && p.gender !== "female") errors.push("Gender is required.");
  if (!isNonEmptyString(p.dateOfBirth)) errors.push("Date of birth is required.");
  if (!isNonEmptyString(p.mobile)) errors.push("Mobile number is required.");
  if (!isNonEmptyString(p.nic) && !isNonEmptyString(p.phn)) errors.push("NIC or PHN is required.");

  return errors;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/validation.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.js test/validation.test.js
git commit -m "feat: registration payload validation with tests"
```

---

### Task 6: Database module (connection, migrations, seeding)

**Files:**
- Create: `backend/src/db.js`
- Create: `backend/test/helpers.js`
- Test: `backend/test/db.test.js`

- [ ] **Step 1: Write the test helper**

`backend/test/helpers.js`:
```js
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";

// Opens a fresh, seeded SQLite database in a unique temp directory.
export function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), "arogya-test-"));
  return openDb(join(dir, "test.db"));
}
```

- [ ] **Step 2: Write the failing test**

`backend/test/db.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";

test("opening the db creates tables and seeds 40 clinics", () => {
  const db = freshDb();
  const count = db.prepare("SELECT COUNT(*) AS c FROM clinics").get().c;
  assert.equal(count, 40);
});

test("a known clinic is seeded with its name", () => {
  const db = freshDb();
  const row = db.prepare("SELECT name FROM clinics WHERE clinic_id = ?").get("AC-005");
  assert.equal(row.name, "Kirinda");
});

test("re-opening the same db keeps registrations and re-seeds clinics idempotently", () => {
  const db = freshDb();
  const c1 = db.prepare("SELECT COUNT(*) AS c FROM clinics").get().c;
  assert.equal(c1, 40);
  // registrations table exists and is empty
  const r = db.prepare("SELECT COUNT(*) AS c FROM registrations").get().c;
  assert.equal(r, 0);
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --test test/db.test.js`
Expected: FAIL — cannot find module `../src/db.js`.

- [ ] **Step 4: Write the implementation**

`backend/src/db.js`:
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
  migrate(db);
  seedClinics(db);
  return db;
}

function migrate(db) {
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

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/db.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/db.js test/helpers.js test/db.test.js
git commit -m "feat: sqlite connection, migrations, clinic seeding with tests"
```

---

### Task 7: Arogya-ID generator (TDD)

**Files:**
- Create: `backend/src/lib/arogyaId.js`
- Test: `backend/test/arogyaId.test.js`

- [ ] **Step 1: Write the failing test**

`backend/test/arogyaId.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import { nextArogyaId } from "../src/lib/arogyaId.js";

test("formats AC-005-000001 and increments per clinic", () => {
  const db = freshDb();
  assert.equal(nextArogyaId(db, "AC-005"), "AC-005-000001");
  assert.equal(nextArogyaId(db, "AC-005"), "AC-005-000002");
});

test("counters are independent per clinic", () => {
  const db = freshDb();
  assert.equal(nextArogyaId(db, "AC-005"), "AC-005-000001");
  assert.equal(nextArogyaId(db, "AC-001"), "AC-001-000001");
  assert.equal(nextArogyaId(db, "AC-005"), "AC-005-000002");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/arogyaId.test.js`
Expected: FAIL — cannot find module `../src/lib/arogyaId.js`.

- [ ] **Step 3: Write the implementation**

`backend/src/lib/arogyaId.js`:
```js
// Atomically bumps the per-clinic counter and returns the next Arogya ID,
// e.g. "AC-005-000042". Relies on SQLite UPSERT ... RETURNING (SQLite >= 3.35).
export function nextArogyaId(db, clinicId) {
  const row = db
    .prepare(
      `INSERT INTO clinic_counters (clinic_id, last_seq)
       VALUES (?, 1)
       ON CONFLICT(clinic_id) DO UPDATE SET last_seq = last_seq + 1
       RETURNING last_seq`
    )
    .get(clinicId);
  const seq = String(row.last_seq).padStart(6, "0");
  return `${clinicId}-${seq}`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/arogyaId.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/arogyaId.js test/arogyaId.test.js
git commit -m "feat: per-clinic Arogya ID generator with tests"
```

---

### Task 8: Clinics route + Express app (integration)

**Files:**
- Create: `backend/src/routes/clinics.js`
- Create: `backend/src/app.js`
- Test: `backend/test/clinics.route.test.js`

- [ ] **Step 1: Write the failing test**

`backend/test/clinics.route.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { freshDb } from "./helpers.js";

test("POST /clinics/validate returns clinic name for a known id", async () => {
  const app = createApp(freshDb());
  const res = await request(app).post("/clinics/validate").send({ clinicId: "AC-005" });
  assert.equal(res.status, 200);
  assert.equal(res.body.valid, true);
  assert.equal(res.body.clinicName, "Kirinda");
});

test("POST /clinics/validate returns valid:false for an unknown id", async () => {
  const app = createApp(freshDb());
  const res = await request(app).post("/clinics/validate").send({ clinicId: "ZZ-999" });
  assert.equal(res.status, 200);
  assert.equal(res.body.valid, false);
});

test("POST /clinics/validate returns 400 for a blank id", async () => {
  const app = createApp(freshDb());
  const res = await request(app).post("/clinics/validate").send({ clinicId: "" });
  assert.equal(res.status, 400);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/clinics.route.test.js`
Expected: FAIL — cannot find module `../src/app.js`.

- [ ] **Step 3: Write the clinics route**

`backend/src/routes/clinics.js`:
```js
import express from "express";

export function clinicsRouter(db) {
  const router = express.Router();
  const findClinic = db.prepare("SELECT clinic_id, name FROM clinics WHERE clinic_id = ?");

  router.post("/validate", (req, res) => {
    const clinicId =
      req.body && typeof req.body.clinicId === "string" ? req.body.clinicId.trim() : "";
    if (!clinicId) {
      res.status(400).type("text/plain").send("clinicId is required.");
      return;
    }
    const row = findClinic.get(clinicId);
    if (row) res.json({ valid: true, clinicName: row.name });
    else res.json({ valid: false });
  });

  return router;
}
```

- [ ] **Step 4: Write the app (clinics mounted; registration added in Task 9)**

`backend/src/app.js`:
```js
import express from "express";
import { clinicsRouter } from "./routes/clinics.js";

export function createApp(db) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/clinics", clinicsRouter(db));

  // Error handler (must be last, 4 args).
  app.use((err, _req, res, _next) => {
    if (err && err.type === "entity.parse.failed") {
      res.status(400).type("text/plain").send("Invalid JSON body.");
      return;
    }
    console.error(err);
    res.status(500).type("text/plain").send("Internal server error.");
  });

  return app;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/clinics.route.test.js`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/routes/clinics.js src/app.js test/clinics.route.test.js
git commit -m "feat: clinics validate route + express app with tests"
```

---

### Task 9: Registration route (integration)

**Files:**
- Create: `backend/src/routes/registration.js`
- Modify: `backend/src/app.js` (mount registration router)
- Test: `backend/test/registration.route.test.js`

- [ ] **Step 1: Write the failing test**

`backend/test/registration.route.test.js`:
```js
import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { freshDb } from "./helpers.js";

function validBody(overrides = {}) {
  return {
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

test("happy path returns arogyaId, normal triage, message, and persists a row", async () => {
  const db = freshDb();
  const app = createApp(db);
  const res = await request(app).post("/registration").send(validBody());
  assert.equal(res.status, 200);
  assert.equal(res.body.arogyaId, "AC-005-000001");
  assert.equal(res.body.triage, "normal");
  assert.ok(res.body.message.length > 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM registrations").get().c, 1);
});

test("arogya id increments on a second submission to the same clinic", async () => {
  const app = createApp(freshDb());
  await request(app).post("/registration").send(validBody());
  const res = await request(app).post("/registration").send(validBody());
  assert.equal(res.body.arogyaId, "AC-005-000002");
});

test("a high-risk flag (item 1) yields high-risk triage", async () => {
  const app = createApp(freshDb());
  const flags = Array(11).fill(false);
  flags[0] = true;
  const res = await request(app).post("/registration").send(validBody({ screening: { flags } }));
  assert.equal(res.body.triage, "high-risk");
});

test("only chronic/lifestyle flags (items 6-11) yield normal triage", async () => {
  const app = createApp(freshDb());
  const flags = Array(11).fill(false);
  flags[5] = true;
  flags[8] = true;
  const res = await request(app).post("/registration").send(validBody({ screening: { flags } }));
  assert.equal(res.body.triage, "normal");
});

test("consent false is rejected with 400", async () => {
  const app = createApp(freshDb());
  const res = await request(app).post("/registration").send(validBody({ consent: false }));
  assert.equal(res.status, 400);
});

test("unknown clinic is rejected with 400", async () => {
  const app = createApp(freshDb());
  const res = await request(app).post("/registration").send(validBody({ clinicId: "ZZ-999" }));
  assert.equal(res.status, 400);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/registration.route.test.js`
Expected: FAIL — cannot find module `../src/routes/registration.js`.

- [ ] **Step 3: Write the registration route**

`backend/src/routes/registration.js`:
```js
import express from "express";
import { validateRegistration } from "../lib/validation.js";
import { computeTriage } from "../lib/triage.js";
import { nextArogyaId } from "../lib/arogyaId.js";
import { triageMessage } from "../lib/messages.js";

export function registrationRouter(db) {
  const router = express.Router();
  const clinicExistsStmt = db.prepare("SELECT 1 AS one FROM clinics WHERE clinic_id = ?");
  const insert = db.prepare(
    `INSERT INTO registrations
       (arogya_id, clinic_id, language, patient_json, screening_flags, triage, consent, created_at)
     VALUES
       (@arogyaId, @clinicId, @language, @patientJson, @flags, @triage, 1, @createdAt)`
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

    const arogyaId = db.transaction(() => {
      const id = nextArogyaId(db, clinicId);
      insert.run({
        arogyaId: id,
        clinicId,
        language: body.language,
        patientJson: JSON.stringify(body.patient),
        flags: JSON.stringify(body.screening.flags),
        triage,
        createdAt,
      });
      return id;
    })();

    res.json({ arogyaId, triage, message: triageMessage(triage, body.language) });
  });

  return router;
}
```

- [ ] **Step 4: Mount the registration router in `app.js`**

Replace `backend/src/app.js` with:
```js
import express from "express";
import { clinicsRouter } from "./routes/clinics.js";
import { registrationRouter } from "./routes/registration.js";

export function createApp(db) {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  app.get("/health", (_req, res) => res.json({ ok: true }));
  app.use("/clinics", clinicsRouter(db));
  app.use("/registration", registrationRouter(db));

  // Error handler (must be last, 4 args).
  app.use((err, _req, res, _next) => {
    if (err && err.type === "entity.parse.failed") {
      res.status(400).type("text/plain").send("Invalid JSON body.");
      return;
    }
    console.error(err);
    res.status(500).type("text/plain").send("Internal server error.");
  });

  return app;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test test/registration.route.test.js`
Expected: PASS (6 tests).

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all suites pass (triage, messages, validation, db, arogyaId, clinics route, registration route).

- [ ] **Step 7: Commit**

```bash
git add src/routes/registration.js src/app.js test/registration.route.test.js
git commit -m "feat: registration route (triage, arogya id, persistence) with tests"
```

---

### Task 10: Server bootstrap

**Files:**
- Create: `backend/src/server.js`

- [ ] **Step 1: Write the server**

`backend/src/server.js`:
```js
import { openDb } from "./db.js";
import { createApp } from "./app.js";

const HOST = process.env.HOST || "127.0.0.1";
const PORT = Number(process.env.PORT) || 4000;

const db = openDb();
const app = createApp(db);

app.listen(PORT, HOST, () => {
  console.log(`Arogya backend listening on http://${HOST}:${PORT}`);
});
```

- [ ] **Step 2: Smoke-test the server against a temp DB**

Run:
```bash
AROGYA_DB_PATH="$(mktemp -d)/smoke.db" PORT=4099 node src/server.js &
SERVER_PID=$!
sleep 1
curl -s -X POST http://127.0.0.1:4099/clinics/validate -H 'Content-Type: application/json' -d '{"clinicId":"AC-005"}'
echo
kill $SERVER_PID
```
Expected: prints `{"valid":true,"clinicName":"Kirinda"}` then the server is stopped.

- [ ] **Step 3: Commit**

```bash
git add src/server.js
git commit -m "feat: server bootstrap binding 127.0.0.1:4000"
```

---

### Task 11: pm2 ecosystem config

**Files:**
- Create: `backend/ecosystem.config.cjs`

- [ ] **Step 1: Write the pm2 config**

`backend/ecosystem.config.cjs`:
```js
module.exports = {
  apps: [
    {
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
        AROGYA_DB_PATH: "/var/lib/arogya/arogya.db",
      },
    },
  ],
};
```

- [ ] **Step 2: Validate the config parses**

Run: `node -e "console.log(require('./ecosystem.config.cjs').apps[0].name)"`
Expected: `arogya-backend`

- [ ] **Step 3: Commit**

```bash
git add ecosystem.config.cjs
git commit -m "feat: pm2 ecosystem config (local-only, db path via env)"
```

---

### Task 12: One-time setup script

**Files:**
- Create: `backend/setup.sh`

- [ ] **Step 1: Write `backend/setup.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO="/home/developper/arogya-entry"
CADDYFILE="/etc/caddy/Caddyfile"

echo "==> Installing pm2 (user-global, no sudo)"
npm i -g pm2

echo "==> Creating SQLite data directory"
sudo mkdir -p /var/lib/arogya
sudo chown developper:developper /var/lib/arogya

echo "==> Installing backend dependencies"
cd "$REPO/backend"
npm ci

echo "==> Starting backend under pm2"
pm2 start ecosystem.config.cjs
pm2 save

echo "==> Patching Caddy (adds /arogya/api route; DHIS2 block untouched)"
if grep -q "/arogya/api" "$CADDYFILE"; then
  echo "    /arogya/api route already present — skipping"
else
  TS="$(date +%Y%m%d%H%M%S)"
  sudo cp "$CADDYFILE" "${CADDYFILE}.bak.${TS}"
  awk '
    /handle_path \/arogya\/\* \{/ && !ins {
      print "    handle_path /arogya/api/* {"
      print "        reverse_proxy 127.0.0.1:4000"
      print "    }"
      print ""
      ins = 1
    }
    { print }
  ' "${CADDYFILE}.bak.${TS}" | sudo tee "$CADDYFILE" > /dev/null

  if caddy validate --adapter caddyfile --config "$CADDYFILE"; then
    sudo systemctl reload caddy
    echo "    Caddy validated and reloaded"
  else
    echo "    caddy validate FAILED — restoring backup and aborting"
    sudo cp "${CADDYFILE}.bak.${TS}" "$CADDYFILE"
    exit 1
  fi
fi

echo ""
echo "==> To enable start-on-boot, run the sudo command pm2 prints below ONCE:"
pm2 startup systemd -u developper --hp /home/developper || true
echo ""
echo "Setup complete. Backend: http://127.0.0.1:4000  | App: https://vmi3065909.contaboserver.net/arogya/"
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x setup.sh`

- [ ] **Step 3: Syntax-check the script**

Run: `bash -n setup.sh`
Expected: no output (valid syntax). Do NOT run the script itself in tests — it changes server state; it is operator-run.

- [ ] **Step 4: Commit**

```bash
git add setup.sh
git commit -m "feat: one-time setup script (pm2, db dir, safe Caddy patch)"
```

---

### Task 13: Ultimate deploy script

**Files:**
- Create: `backend/deploy.sh`

- [ ] **Step 1: Write `backend/deploy.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

REPO="/home/developper/arogya-entry"
CADDYFILE="/etc/caddy/Caddyfile"
WWW="/var/www/arogya-entry"

echo "==> [1/5] Building frontend"
cd "$REPO/frontend"
npm ci
npm run build

echo "==> [2/5] Shipping frontend to ${WWW}"
sudo rsync -a --delete "$REPO/frontend/dist/" "${WWW}/"
sudo cp "$REPO/frontend/config.js" "${WWW}/config.js"

echo "==> [3/5] Building + testing backend"
cd "$REPO/backend"
npm ci
npm test

echo "==> [4/5] Restarting backend (pm2)"
pm2 restart arogya-backend --update-env || pm2 start ecosystem.config.cjs

echo "==> [5/5] Ensuring Caddy /arogya/api route, then reloading"
if ! grep -q "/arogya/api" "$CADDYFILE"; then
  TS="$(date +%Y%m%d%H%M%S)"
  sudo cp "$CADDYFILE" "${CADDYFILE}.bak.${TS}"
  awk '
    /handle_path \/arogya\/\* \{/ && !ins {
      print "    handle_path /arogya/api/* {"
      print "        reverse_proxy 127.0.0.1:4000"
      print "    }"
      print ""
      ins = 1
    }
    { print }
  ' "${CADDYFILE}.bak.${TS}" | sudo tee "$CADDYFILE" > /dev/null
fi

if caddy validate --adapter caddyfile --config "$CADDYFILE"; then
  sudo systemctl reload caddy
else
  echo "    caddy validate FAILED — NOT reloading. Inspect ${CADDYFILE}"
  exit 1
fi

echo ""
echo "Deploy complete: https://vmi3065909.contaboserver.net/arogya/"
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x deploy.sh`

- [ ] **Step 3: Syntax-check the script**

Run: `bash -n deploy.sh`
Expected: no output (valid syntax). Do NOT run it in tests — it builds/ships and touches the server; it is operator-run.

- [ ] **Step 4: Commit**

```bash
git add deploy.sh
git commit -m "feat: ultimate deploy script (build+ship frontend, build+restart backend, reload Caddy)"
```

---

### Task 14: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run (from `backend/`): `npm test`
Expected: PASS — triage, messages, validation, db, arogyaId, clinics route, registration route suites all green.

- [ ] **Step 2: Confirm both scripts are syntactically valid and executable**

Run:
```bash
bash -n setup.sh && bash -n deploy.sh && ls -l setup.sh deploy.sh | awk '{print $1, $NF}'
```
Expected: no syntax errors; both files show executable bits (`-rwxr-xr-x`).

- [ ] **Step 3: Confirm the server binds locally only (manual check)**

This is documented for the operator (not an automated test): after `setup.sh`, `pm2 list`
shows `arogya-backend` online, and `curl -s http://127.0.0.1:4000/health` returns
`{"ok":true}`, while the port is not reachable on the public interface.

---

## Self-Review Notes

- **Spec coverage:** routing/local-port (server.js Task 10, ecosystem Task 11, Caddy patch Tasks 12–13); two endpoints with the exact contract (Tasks 8–9); server-side validation mirroring the frontend (Task 5); flags-1–5 triage (Task 3); atomic per-clinic `AC-005-000123` IDs (Tasks 7, 9); localized messages (Task 4); plain-text errors (Tasks 8–9); SQLite schema + WAL + seed-on-startup (Task 6); 40-clinic seed (Task 2); pm2 + boot persistence (Tasks 11–12); safe Caddy patch with backup→insert-before-static→validate→reload, DHIS2 untouched (Tasks 12–13); `node:test`+supertest against temp DB (Tasks 3–9); ultimate deploy script (Task 13).
- **No placeholders:** every code/script step contains complete, runnable content.
- **Type/naming consistency:** `openDb`, `createApp`, `clinicsRouter`, `registrationRouter`, `computeTriage`, `nextArogyaId`, `validateRegistration`, `triageMessage` are defined once and referenced consistently; seed keys (`clinicId/name/rdhs/province`) match `docs/clinics.seed.json`; `AROGYA_DB_PATH`/`HOST`/`PORT` consistent across `db.js`, `server.js`, `ecosystem.config.cjs`, and the scripts.
- **ESM caveat called out:** routes use `express.Router()` via default import (not named `Router`) to avoid Node ESM/CJS interop failures.
```
