# Arogya App — Improvement Roadmap

> Synthesis of a four-track read-only study (frontend/UX/a11y, backend/security, content/i18n/data-model, ops/testing/offline/perf) conducted 2026-06-04. Every item cites `file:line` evidence so it can be picked up directly. Severity is weighted for **this** context: a rural Sri Lankan clinic **kiosk**, used by **elderly/low-literacy trilingual** patients, holding **patient PII + health data**, on a VPS **co-hosted with DHIS2**, over **flaky rural internet**.

## What's already solid (preserve these)
- Triage high-risk mapping (`HIGH_RISK_FLAGS=[0,1,2,3,4]`) is **correct and consistent across all three languages** (verified item-by-item) — chest pain, ≥2-week depression, weight loss, breast lump, non-healing oral lesion.
- All SQL is parameterized — **no injection risk**.
- Arogya-ID counter (UPSERT…RETURNING in a transaction) is **atomic** for the current single-process pm2 config.
- Backend binds `127.0.0.1` only; 64 KB body cap; Caddy patch keeps the **DHIS2 block byte-identical** with backup→validate→reload→restore.
- Translations are structurally complete; Sinhala/Tamil clinical terminology is accurate and natural.

---

## Phase 0 — Critical safety & data integrity (do first)

These cause wrong/duplicate patient data or leak PII between patients **today**.

| # | Item | Evidence | Fix |
|---|------|----------|-----|
| 0.1 | **Double-submit creates duplicate registrations & burns Arogya IDs.** Submit-on-mount `useEffect([])` fires twice under React 19 StrictMode; "Start Over" on the error screen re-POSTs the whole form; a 10s client timeout while the server still commits → duplicate record. | `TriageSummaryScreen.tsx:25-52`; `registration.js:31-43`; `api.ts:9,19` | Client-generated `requestId` (UUID) + `UNIQUE` column + `INSERT … ON CONFLICT(request_id) DO NOTHING RETURNING` (mirrors the counter UPSERT); add a `useRef` submitted-guard. **Single most important fix.** |
| 0.2 | **Kiosk privacy: no session reset / idle timeout.** If patient A walks away mid-form, patient B sees A's name, NIC, mobile, address and health answers. State only resets on the success screen's "Return to Home". | `App.tsx:30,73`; `TriageSummaryScreen.tsx:121` | Inactivity timer (~60–90 s) → reset to language screen + wipe PII. `handleReset` already exists; just auto-trigger it. |
| 0.3 | **Consent stored as a literal `1`, not the captured value.** Column can never reflect anything but consented. | `registration.js:14` | Bind `body.consent ? 1 : 0`; add `consent_version` + `consent_at` to evidence which wording was agreed. |
| 0.4 | **Questionnaire answers silently wiped on Back.** Symptom/consent state lives in the child with no `initial` prop; Back→forward loses all 11 answers. | `QuestionnaireScreen.tsx:20-21`; `App.tsx:69` | Lift questionnaire state into `App` (as `registration` already is) and pass `initial`. |

## Phase 1 — Security & data protection (PII on a shared box)

| # | Item | Evidence | Fix |
|---|------|----------|-----|
| 1.1 | **DB dir/file not permission-hardened** — created `0755`, world-readable on a host shared with DHIS2. | `setup.sh:11-12`, `go-live.sh:34-36` (no chmod) | `chmod 0700 /var/lib/arogya`; `fs.chmodSync(dbPath,0o600)` after open; ensure `-wal`/`-shm` inherit. **Cheap, do immediately.** |
| 1.2 | **PII unencrypted at rest** (name, NIC/PHN, mobile, address, DOB + health flags in plaintext SQLite). | `db.js:7,11`; `registration.js:37` | Require full-disk encryption for `/var/lib/arogya` (document as go-live prerequisite); or app-level SQLCipher (`better-sqlite3-multiple-ciphers`) with key from systemd credential (never in repo). |
| 1.3 | **No backup of the one SQLite file** = unrecoverable total loss on disk failure / `rm` / corruption. | nothing in setup/deploy | Nightly `sqlite3 … ".backup"` (WAL-safe) → retained, off-box, `0600`, encrypted; **test a restore**. |
| 1.4 | **`/registration` is public (via Caddy), unauthenticated, unthrottled**; each call is a blocking disk write → spam/DoS/disk-fill can take down co-hosted DHIS2. | `app.js:11`; `registration.js:17` | `express-rate-limit` + a Caddy-level limit; ideally a kiosk-only shared token; disk-usage guard/alert. |
| 1.5 | **Error handler logs the full error object** → better-sqlite3 errors can carry bound params (PII) into unrotated pm2 logs. | `app.js:19` | Log `err.message`/`code` only; structured logger with field allow-list; treat pm2 logs as PII-bearing. |
| 1.6 | **No graceful shutdown / DB close on SIGTERM** (every deploy/reboot kills mid-write, WAL not checkpointed). | `server.js:7-12` | `process.on('SIGTERM'/'SIGINT')` → `server.close()` → `db.close()` (checkpoints WAL). |
| 1.7 | **pm2 boot persistence is optional** — a reboot leaves the backend down and all registrations failing. | `go-live.sh:91-94`; `setup.sh:50-51` | Make `pm2 startup systemd` + `pm2 save` a required step; verify `systemctl status pm2-developper`. |

## Phase 2 — Reliability & offline (flaky rural internet)

| # | Item | Evidence | Fix |
|---|------|----------|-----|
| 2.1 | **Network drop mid-submit = total data loss**; only recovery is "Start Over" (re-keys everything, risks duplicate). | `TriageSummaryScreen.tsx:71-84`; `App.tsx:73` | (a) **Retry** button reusing the same payload (small, big win). (b) IndexedDB offline queue: on failure/`!navigator.onLine` persist + "Saved, will sync"; drain on `online`. Depends on 0.1 idempotency. |
| 2.2 | **No PWA / app-shell caching** — UI itself may fail to load on weak links; not installable. | `index.html`; no SW/manifest; `vite.config.ts` | `vite-plugin-pwa` (Workbox): precache shell, `manifest.webmanifest` (`display:standalone`, `start_url:/arogya/?clinic=…`); **network-first / exclude `/arogya/api/*`** so POSTs never serve from cache. Natural home for 2.1(b). |
| 2.3 | **`/health` is liveness-only** — returns 200 even if the DB is corrupt/locked; deploy "verifies" a broken service. | `app.js:9`; `go-live.sh:82-83` | Add `/ready` running `SELECT 1`/`PRAGMA quick_check`; point deploy verification at it. |
| 2.4 | **Raw backend error text shown to patients**, untranslated. | `api.ts:33-35` | Map HTTP status → localized friendly messages; log raw body to console only. |

## Phase 3 — Correctness & content

| # | Item | Evidence | Fix |
|---|------|----------|-----|
| 3.1 | **Triage mapping is positional & fragile** (latent safety risk): correctness hinges on `translations.ts` item order matching hard-coded `[0,1,2,3,4]` in another package, linked only by a comment. No test catches a reorder. | `triage.js:1-3`; `translations.ts:104-116`; `screening.test.ts` | Give each screening item a stable `id` (`chestPain`, `breastLump`…); key UI **and** `HIGH_RISK_FLAGS` off ids; add a semantic test. |
| 3.2 | **Backend doesn't validate NIC/mobile format** — frontend regexes are bypassable; NIC is the identity key for record linkage. | `validation.js:21-25` vs `frontend/.../validation.ts:3-5` | Port NIC (`^[0-9]{9}[vVxX]$`/`^[0-9]{12}$`) + mobile regex into backend; add max-lengths; validate DOB is a real, non-future date; persist a whitelisted field set. |
| 3.3 | **GN Division list is wrong for ~38 of 40 clinics** — 10 hard-coded Kandy placeholders served nationwide. | `options.ts:28-33`; `clinics.seed.json` | Drive GN divisions per `clinicId` from the backend (seed already has province/rdhs). |
| 3.4 | **Age (years+months) shown but never captured** though the form spec mandates it; matters for paediatric/approximate-DOB cases. | `REGISTRATION FORM.md:19`; `DateField.tsx:36-39`; `registration.js:37` | Persist computed `{years,months}` (or `ageMonths`) in `patient_json`; allow direct age entry when DOB unknown. |
| 3.5 | **i18n/consent cleanup.** Sinhala `startOver` means "Start Over" vs en/ta "Return to Home"; Tamil/Sinhala triage destination wording differs from backend `messages.js`; dead `questions`/`yes`/`no`/duplicate `consent` keys drift. | `translations.ts:25,140,255,15-22`; `messages.js` | Align Sinhala `startOver`; mirror triage wording to `messages.js`; delete dead keys; keep only the strong `screening.consent`. |
| 3.6 | **No idempotency/dedup key (data layer)** — see 0.1; also add `busy_timeout` + a `PRAGMA user_version` migration runner + `idx_reg_clinic_created` index + `deleted_at`/`audit_log` to enable retention & staff reads. | `db.js:19-43,31-41` | Versioned migrations unlock 0.1, 3.x and Phase 5 admin work. |

## Phase 4 — Accessibility & UX (elderly · low-literacy · trilingual)

| # | Item | Evidence | Fix |
|---|------|----------|-----|
| 4.1 | **Document language never switches** — stays `lang="en"` for Sinhala/Tamil, breaking screen-reader pronunciation. | `index.html:2`; no `documentElement.lang` | Set `document.documentElement.lang = language` on selection. |
| 4.2 | **Body/label/question/consent text is 11–14px** — the most important content at the smallest size for variable eyesight (denser SI/TA glyphs compound it). | `QuestionnaireScreen.tsx:54,83`; field components; `LanguageSelectScreen.tsx:42` | Raise to ≥16px; add an A/A+ font-size toggle. |
| 4.3 | **No form a11y**: no `htmlFor`/`id`, no `aria-invalid`/`aria-describedby`/`role="alert"`, symptom/gender toggles lack `role=checkbox/radio`+`aria-checked`, no focus move on screen change. | `fields/*`; `QuestionnaireScreen.tsx:45-70`; `SegmentedControl.tsx:30`; `App.tsx:80-128` | `useId()` label wiring; aria error linking + live region; roles + `aria-checked`; focus the new screen's heading on transition. |
| 4.4 | **Language-select screen is English-only** — defeats the trilingual entry point; **no way to change language mid-flow**. | `LanguageSelectScreen.tsx:11`; `App.tsx:57` | Show welcome/instruction in all three scripts; persistent header language switcher. |
| 4.5 | **Scanner errors are invisible** (rendered only in the manual block) and **Enter does nothing** in manual entry; `SearchableSelect` shows nothing on no-match. | `ScannerScreen.tsx:101,115-126`; `SearchableSelect.tsx:22,45` | Render `validationError` in both modes; wrap manual entry in a `<form>`; add a "no matches" row. |
| 4.6 | **No review/confirm step** before the irreversible submit; **no ErrorBoundary** (a render throw white-screens the kiosk). | `TriageSummaryScreen.tsx:25-52`; no `componentDidCatch` | Add a review screen; wrap `<App/>` in a localized "please ask staff" ErrorBoundary with reset. |

## Phase 5 — Engineering & ops hygiene

| # | Item | Evidence | Fix |
|---|------|----------|-----|
| 5.1 | **No CI; frontend tests + `tsc` never run in automation**; deploy only runs backend tests. | no `.github`; `go-live.sh:41` | GitHub Actions (`Arogya-Final`): backend `npm ci && npm test`; frontend `npm ci && lint && test && build`. Pre-deploy gate. |
| 5.2 | **Zero component / E2E tests** — riskiest code (submit/failure, `?clinic` fallback, scanner guard, form gating) untested; vitest is `node`-env + `*.test.ts` only. | `vitest.config.ts:5-6`; 4 logic-only test files | Add jsdom + Testing Library component tests; one Playwright happy-path + offline/error smoke through the real flow. |
| 5.3 | **531 KB single JS chunk**; QR-scanner lib (`@yudiel/react-qr-scanner`) ships even on the common `?clinic=` deep-link path; `motion` used only for trivial fades. | `App.tsx:10-15`; `vite.config.ts`; `main.tsx` | `React.lazy` the screens (esp. scanner); `manualChunks` vendor split; trim/replace `motion`; Caddy `encode zstd gzip` + `immutable` long-cache on hashed assets. |
| 5.4 | **Frontend deploy is `rsync --delete` straight to prod** — no rollback, no staging; **Caddyfile not in version control**. | `go-live.sh:26`; no Caddyfile in repo | Release dir + `current` symlink (atomic swap + instant rollback); commit the `/arogya` Caddy snippet. |
| 5.5 | **Three overlapping deploy scripts** (`go-live.sh`, `deploy.sh`, `setup.sh`) with duplicated awk Caddy patch — drift risk; stale AI-Studio README; misleading `.env.example`. | the three scripts; `frontend/README.md`; `.env.example` | Consolidate to one idempotent `go-live.sh` (`--first-run` flag); write a real operator runbook; fix `.env.example`; add `pm2-logrotate`; external uptime check on `/arogya/api/health`. |
| 5.6 | **No staff read/export/erase path** — registrations are write-only; a data-access/erasure request needs raw SQLite (itself an uncontrolled PII exposure). | only two POST routes | After auth (1.4) + migrations (3.6): authenticated `GET /registrations?clinic=&from=&to=` (paginated), CSV export, soft-delete; define a **retention policy** (PDPA). |

---

## Recommended sequencing
1. **Phase 0** + the cheap **1.1 / 1.5 / 1.6 / 1.7** — these are correctness/privacy/PII issues live in production right now, and most are small.
2. **1.3 backup** + **1.4 rate-limit** — protect the data and the co-hosted DHIS2.
3. **Phase 2 (offline + PWA)** — the biggest day-to-day reliability win for rural clinics.
4. **Phase 3** — correctness/content (3.1 triage-ids and 3.2 backend validation first).
5. **Phase 4** — accessibility/UX, ideally with a clinic field-test.
6. **Phase 5** — CI/tests/perf/ops hygiene woven throughout (CI should land early to protect everything after).

## How to execute (superpowers)
Each phase (or even each high-value item like 0.1 idempotency) is a good candidate for **brainstorming → writing-plans → subagent-driven-development with TDD**. Suggested first plan: **"Registration idempotency + double-submit hardening" (0.1)** — small, end-to-end (frontend guard + `requestId`, backend UNIQUE + migration runner), and removes the worst data-integrity risk.
