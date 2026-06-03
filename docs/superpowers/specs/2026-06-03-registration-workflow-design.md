# Arogya Entry — Registration Workflow Design

**Date:** 2026-06-03
**Status:** Approved
**Scope:** Frontend only (`frontend/`). Backend wiring is a separate, later effort.

## Overview

Rework the patient-registration flow for the Arogya clinic mobile web app. A patient
scans a per-clinic QR code with their phone's native camera, which opens the app with
the clinic embedded in the URL. Inside the app the patient picks a language, completes a
**new patient-registration form**, answers a **redesigned health-screening questionnaire**,
gives consent, and submits. The summary screen shows the auto-generated Arogya ID and a
triage result.

This builds on the existing standalone frontend
(see `2026-06-03-arogya-frontend-standalone-design.md`): React 19 + TypeScript 5.8 +
Vite 6 + Tailwind 4 + motion + lucide-react, served as a static SPA at `/arogya/`,
talking to `/api/*`.

---

## Workflow

The QR scan happens **outside** the app via the phone's native camera, which opens a URL
with the clinic embedded. The app is served at `https://vmi3065909.contaboserver.net/arogya/`,
so each clinic's QR encodes `https://vmi3065909.contaboserver.net/arogya/?clinic=<CLINIC_ID>`
(e.g. `…/arogya/?clinic=CL-4912`). Language is therefore always the first in-app screen
("they will be prompted to pick their language" right after load).

- **Primary path (URL has `?clinic`):**
  `language → registration → questionnaire → triage`
- **Fallback path (no `?clinic`):**
  `language → scanner → registration → questionnaire → triage`
  (the existing `ScannerScreen` / manual entry is reused **only** as this fallback)

### Clinic resolution

- On mount, read `?clinic` from the URL into `clinicId`.
- When entering the Registration screen, call `POST /api/clinics/validate`:
  - success → `clinicName` is shown read-only as the **Enrolling Organisation Unit**.
  - backend unreachable (this frontend-only phase) → gracefully fall back to showing the
    raw `clinicId` as the org unit so the flow remains testable. The authoritative gate is
    the final registration submit.

---

## Data model

```ts
type ScreenState =
  | "language" | "scanner" | "registration" | "questionnaire" | "triage";

interface AppState {
  screen: ScreenState;
  language: Language;             // 'en' | 'si' | 'ta'
  clinicId: string | null;        // from ?clinic or scanner fallback
  clinicName: string | null;      // from /api/clinics/validate
  registration: RegistrationData | null;
  screeningFlags: boolean[];      // length 11, index-aligned to the question list
  consent: boolean;
  triageResult: TriageResult | null;
  isLoading: boolean;
  error: string | null;
}

interface RegistrationData {
  fullName: string;
  nic: string;
  phn: string;
  gender: "male" | "female" | null;
  dateOfBirth: string;            // ISO yyyy-mm-dd
  householdAddress: string;
  relationshipToHead: RelationshipKey | null;
  gnDivision: string | null;
  mobile: string;
  maritalStatus: MaritalKey | null;
  occupation: OccupationKey | null;
  education: EducationKey | null;
  // Age is NOT stored; it is derived from dateOfBirth for display only.
}
```

Option-set keys (`RelationshipKey`, `MaritalKey`, `OccupationKey`, `EducationKey`) are
string-literal unions defined in `data/options.ts`; their human labels live in
`translations.ts` keyed per language.

---

## Registration screen

New component `components/RegistrationScreen.tsx`, matching the existing green (`#0A5C43`)
card theme: sticky header ("Step 1: Patient Details"), scrollable body, sticky "Next step"
button.

### Section A — Enrollment Information (read-only / auto)

| Field | Source |
|---|---|
| Enrolling Organisation Unit | `clinicName ?? clinicId` |
| Enrollment Date | today's date, auto |
| Arogya ID | "Auto-generated" placeholder; real value shown on the summary after submit |

### Section B — Profile (patient-entered)

| Field | Control | Required |
|---|---|---|
| Full Name | text | ✅ |
| NIC Number | text (light SL NIC format) | ⬦ at least one of NIC / PHN |
| Personal Health Number (PHN) | text | ⬦ at least one of NIC / PHN |
| Gender / Sex | segmented Male / Female | ✅ |
| Date of Birth | native date picker (`max` = today) | ✅ |
| Age | **derived**, read-only → "X Years Y Months" | — |
| Household Number / Address | text | optional |
| Relationship to Household Head | select (10 options) | optional |
| GN Division of Residence | searchable dropdown (placeholder list) | optional |
| Contact Number (Mobile) | tel (light SL mobile format) | ✅ |
| Marital Status | select (6 options) | optional |
| Occupation | select (12 options) | optional |
| Highest Education Level | select (7 options) | optional |

### Option-set values (from the source form)

- **Relationship to Household Head:** Spouse, Child, Parent, Head of the family, Brother,
  Sister, Grand parent, Grand Child, Daughter in Law, Son in Law
- **Marital Status:** Single, Married, Divorced, Separated, Widowed, Not stated / Prefer not to say
- **Occupation:** Unemployed, Self-employment, Private sector, Foreign Labour,
  Government employment, Semi Government, Contract basis, Farmer, Factory worker, Labour,
  Pension, Other
- **Highest Education Level:** No formal education, Primary education,
  Secondary education (O/L or equivalent), Advanced Level (A/L or equivalent),
  Diploma / Technical certificate, Bachelor's degree, Postgraduate degree (Master's / PhD)
- **GN Division of Residence:** searchable dropdown seeded with a small placeholder list for
  the Kirinda Udapalatha area. **To be replaced** by a backend-driven, per-clinic option
  set once that data/API exists.

### Reusable field primitives — `components/fields/`

Each is small and single-purpose:
`TextField`, `SegmentedControl` (Gender), `DateField` (date input + derived-age display),
`SelectField` (relationship / marital / occupation / education), `SearchableSelect`
(GN Division — text input + filtered list).

### Validation — `lib/validation.ts` (pure functions)

- **Required:** Full Name, Gender, Date of Birth, Mobile, and ≥1 of NIC / PHN.
- **Light format checks** (block only when the field is non-empty and clearly malformed):
  - NIC: `^[0-9]{9}[vVxX]$` (old) or `^[0-9]{12}$` (new).
  - Mobile: Sri Lankan mobile, e.g. `^(?:0|94|\+94)?7\d{8}$`.
- Errors render inline beneath each field. "Next step" runs validation on press and scrolls
  to the first error.
- **Age** computed by pure `ageFromDob(dobISO, today)` → `{ years, months }` in `lib/age.ts`.

---

## Questionnaire screen (redesigned)

`components/QuestionnaireScreen.tsx` becomes a checklist:

- Intro line: "To help us provide timely care, please indicate if any of the following
  apply to you." (trilingual, authoritative wording).
- **Items 1–11:** tappable checkbox rows ("tick all that apply"), styled like the existing
  cards.
- **Item 12 "None of the above":** mutually exclusive — ticking it clears 1–11, and ticking
  any of 1–11 clears it. Pure helper `toggleScreeningFlag(flags, none, index)` in
  `lib/screening.ts`.
- **Consent:** a separate **mandatory** checkbox below the list, full trilingual MoH consent
  text.
- **Proceed enabled when** consent is checked **and** the patient has made a screening choice
  (≥1 item ticked, or "None of the above"). Helper `isScreeningComplete(flags, none, consent)`.
- Header "Step 2: Health Screening"; progress bar updated.
- The 11 questions + "None" + consent + intro all live in `translations.ts`. The old
  `GET /api/questions` fetch is **retired**.

### The 11 screening items (English; si/ta verbatim from source)

1. Chest pain / discomfort / unusual shortness of breath during daily activities.
2. Feeling very sad, depressed, or hopeless for more than two weeks.
3. Significant unintentional weight loss over the past few months.
4. New lump or unusual change in the breast.
5. Mouth ulcer / red or white patch / lump / other unhealed oral change (>3 weeks).
6. Diagnosed with high blood pressure (hypertension).
7. Diagnosed with diabetes or high blood sugar.
8. Oral health problems (tooth pain, swollen/bleeding gums, loose teeth, chewing difficulty, etc.).
9. Currently smokes tobacco or uses tobacco products.
10. Consumes alcohol frequently or in large amounts.
11. Uses recreational or non-prescribed substances.

(Item 12 = "None of the above".)

**Triage is the backend's decision.** The frontend sends `screening.flags` and does **not**
compute risk locally.

---

## Summary screen

`components/TriageSummaryScreen.tsx`:

- Builds and POSTs the richer payload (below), reusing its current "Submitting…" loading
  state.
- On success, prominently displays the returned **Arogya ID** plus the triage message,
  keeping the existing high-risk vs normal visual treatment.
- On failure, keeps the existing "Unable to submit — please ask staff" error state with a
  retry/reset. This is the state shown during the current no-backend phase.

---

## API contract

`POST /api/clinics/validate` — unchanged:
```
Body:     { clinicId: string }
Response: { valid: boolean, clinicName?: string }
```

`POST /api/registration` — updated (richer payload; response now carries the Arogya ID):
```
Body: {
  language: string,
  clinicId: string,
  patient: {
    fullName, nic, phn, gender, dateOfBirth,
    householdAddress, relationshipToHead, gnDivision,
    mobile, maritalStatus, occupation, education
  },
  screening: { flags: boolean[] },   // 11 items, index-aligned to the question list
  consent: boolean
}
Response: {
  arogyaId: string,
  triage: "high-risk" | "normal",
  message: string
}
```

`GET /api/questions` — **removed** (questions now sourced from `translations.ts`).

---

## Translations (`translations.ts`)

Add grouped keys per screen for all three languages (en / si / ta) without breaking existing
keys:

- Enrollment labels (org unit, enrollment date, Arogya ID)
- All registration field labels, placeholders, and validation messages
- Option-set labels: Gender (2), Relationship (10), Marital (6), Occupation (12), Education (7)
- Questionnaire: intro line, 11 questions, "None of the above", consent text, buttons

The 11 questions, the "None of the above" line, and the consent text use the
**authoritative trilingual wording** supplied for this task, verbatim. Option-set labels and
UI chrome use **best-effort si/ta translations** that a **native-speaker / clinical reviewer
must verify** before production use.

---

## File structure

**New:**
- `src/components/RegistrationScreen.tsx`
- `src/components/fields/TextField.tsx`
- `src/components/fields/SegmentedControl.tsx`
- `src/components/fields/DateField.tsx`
- `src/components/fields/SelectField.tsx`
- `src/components/fields/SearchableSelect.tsx`
- `src/lib/validation.ts`
- `src/lib/age.ts`
- `src/lib/screening.ts`
- `src/data/options.ts`

**Modified:**
- `src/App.tsx` — read `?clinic`, add `registration` screen, reorder flow, expand state
- `src/types.ts` — `RegistrationData`, option-set key unions, `arogyaId`, `ScreenState`
- `src/translations.ts` — additions above
- `src/services/api.ts` — new `submitRegistration` payload type; remove `fetchQuestions`
- `src/components/QuestionnaireScreen.tsx` — checklist redesign, drop API fetch
- `src/components/TriageSummaryScreen.tsx` — new payload + Arogya ID display
- `src/components/ScannerScreen.tsx` — fallback `onScanSuccess` routes to registration

---

## Testing & verification

The repo currently has no test framework. Following the superpowers TDD preference:

- Add **Vitest** as a **devDependency only** (zero impact on the production bundle). Add an
  `npm test` script.
- Write unit tests **first** for the pure helpers:
  - `ageFromDob` — boundary cases (birthday today, leap years, month rollover).
  - validators — required-field logic, NIC old/new formats, SL mobile formats, NIC/PHN
    either-or rule.
  - `toggleScreeningFlag` / `isScreeningComplete` — None-of-the-above exclusivity and the
    proceed-enabled rule.
- Components and overall flow are verified with `npm run lint` (`tsc --noEmit`) and
  `npm run build`, consistent with the project's "no dev server — build → deploy → test live"
  constraint. No dev server is stood up.

---

## Privacy & constraints

- No patient data persisted client-side (no localStorage / IndexedDB); it lives in React
  state only until submit. Failed submissions are not cached.
- Inherits all constraints from the standalone-frontend design: no Gemini/Google AI, never
  touch the DHIS2 nginx config, build-and-deploy workflow.

---

## Out of scope (this spec)

- Backend implementation (clinic validation, Arogya ID generation, triage logic,
  persistence).
- Real GN Division option set / API.
- Verified professional si/ta translations of option-set labels and UI chrome.
