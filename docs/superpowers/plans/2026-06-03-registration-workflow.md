# Registration Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the Arogya patient flow to `language → registration → questionnaire → triage`, adding a new patient-registration form, a redesigned checklist health questionnaire with mandatory consent, QR-via-URL clinic selection, and an Arogya ID on the summary.

**Architecture:** Extend the existing lightweight `useState` screen-machine in `App.tsx` (no router/form libraries). Add a `RegistrationScreen` composed of small reusable field primitives, pure helper modules for age/validation/screening logic (unit-tested with Vitest), and grouped trilingual strings in `translations.ts`. The QR is scanned by the phone's native camera, opening `…/arogya/?clinic=CL-4912`; the app reads `?clinic`, with the existing `ScannerScreen` reused only as a no-param fallback.

**Tech Stack:** React 19, TypeScript 5.8, Vite 6, Tailwind 4, motion, lucide-react. Tests: Vitest (devDependency, added in Task 1).

**Spec:** `docs/superpowers/specs/2026-06-03-registration-workflow-design.md`

---

## File Structure Map

| File | Action | Responsibility |
|------|--------|----------------|
| `frontend/package.json` | Modify | Add Vitest devDep + `test` script |
| `frontend/vitest.config.ts` | Create | Vitest config (node environment) |
| `frontend/src/types.ts` | Modify | `ScreenState`, option-key unions, `RegistrationData`, updated API types |
| `frontend/src/data/options.ts` | Create | Option-set value keys + GN placeholder list |
| `frontend/src/lib/age.ts` | Create | `ageFromDob` pure helper |
| `frontend/src/lib/validation.ts` | Create | NIC/mobile/required validators (pure) |
| `frontend/src/lib/screening.ts` | Create | Checklist/None/consent state helpers (pure) |
| `frontend/src/translations.ts` | Modify | Grouped trilingual strings for registration + screening |
| `frontend/src/services/api.ts` | Modify | New `submitRegistration` payload; remove `fetchQuestions` |
| `frontend/src/components/fields/TextField.tsx` | Create | Labelled text input + inline error |
| `frontend/src/components/fields/SegmentedControl.tsx` | Create | Two-option toggle (Gender) |
| `frontend/src/components/fields/DateField.tsx` | Create | Date input + derived-age display |
| `frontend/src/components/fields/SelectField.tsx` | Create | Native select for option sets |
| `frontend/src/components/fields/SearchableSelect.tsx` | Create | Filterable dropdown (GN Division) |
| `frontend/src/components/RegistrationScreen.tsx` | Create | The registration form |
| `frontend/src/components/QuestionnaireScreen.tsx` | Modify | Checklist + None + consent |
| `frontend/src/components/TriageSummaryScreen.tsx` | Modify | New payload + Arogya ID display |
| `frontend/src/components/ScannerScreen.tsx` | Modify | Pass clinic name; fallback routes to registration |
| `frontend/src/App.tsx` | Modify | Read `?clinic`, reorder flow, expand state |

All commands run from `frontend/`.

---

### Task 1: Add Vitest

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/vitest.config.ts`

- [ ] **Step 1: Install Vitest as a devDependency**

Run (from `frontend/`):
```bash
npm install -D vitest
```
Expected: `vitest` appears under `devDependencies` in `package.json`.

- [ ] **Step 2: Add the `test` script**

In `frontend/package.json`, add `"test"` to `scripts` (keep existing scripts):
```json
  "scripts": {
    "build": "vite build",
    "lint": "tsc --noEmit",
    "clean": "rm -rf dist",
    "deploy": "./deploy.sh",
    "test": "vitest run"
  },
```

- [ ] **Step 3: Create `frontend/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 4: Verify the runner works (no tests yet)**

Run: `npm test`
Expected: Vitest runs and reports "No test files found" (exit code may be non-zero; that's fine — fixed once Task 3 adds a test).

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json vitest.config.ts
git commit -m "test: add Vitest for unit-testing pure helpers"
```

---

### Task 2: Types and option-key unions

**Files:**
- Modify: `frontend/src/types.ts`
- Create: `frontend/src/data/options.ts`

- [ ] **Step 1: Rewrite `frontend/src/types.ts`**

```ts
import { Language } from "./translations";

export type ScreenState =
  | "language"
  | "scanner"
  | "registration"
  | "questionnaire"
  | "triage";

export type Gender = "male" | "female";

export type RelationshipKey =
  | "spouse" | "child" | "parent" | "head" | "brother" | "sister"
  | "grandparent" | "grandchild" | "daughterInLaw" | "sonInLaw";

export type MaritalKey =
  | "single" | "married" | "divorced" | "separated" | "widowed" | "notStated";

export type OccupationKey =
  | "unemployed" | "selfEmployment" | "privateSector" | "foreignLabour"
  | "government" | "semiGovernment" | "contractBasis" | "farmer"
  | "factoryWorker" | "labour" | "pension" | "other";

export type EducationKey =
  | "none" | "primary" | "secondary" | "advanced" | "diploma"
  | "bachelor" | "postgraduate";

export interface RegistrationData {
  fullName: string;
  nic: string;
  phn: string;
  gender: Gender | null;
  dateOfBirth: string; // ISO yyyy-mm-dd
  householdAddress: string;
  relationshipToHead: RelationshipKey | null;
  gnDivision: string | null;
  mobile: string;
  maritalStatus: MaritalKey | null;
  occupation: OccupationKey | null;
  education: EducationKey | null;
}

export interface TriageResult {
  level: "high-risk" | "normal";
  message: string;
  arogyaId?: string;
}

export interface AppState {
  screen: ScreenState;
  language: Language;
  clinicId: string | null;
  clinicName: string | null;
  registration: RegistrationData | null;
  screeningFlags: boolean[]; // length 11, index-aligned to the question list
  consent: boolean;
  triageResult: TriageResult | null;
  isLoading: boolean;
  error: string | null;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface ClinicValidationResponse {
  valid: boolean;
  clinicName?: string;
}

export interface RegistrationRequest {
  language: string;
  clinicId: string;
  patient: {
    fullName: string;
    nic: string;
    phn: string;
    gender: Gender | null;
    dateOfBirth: string;
    householdAddress: string;
    relationshipToHead: RelationshipKey | null;
    gnDivision: string | null;
    mobile: string;
    maritalStatus: MaritalKey | null;
    occupation: OccupationKey | null;
    education: EducationKey | null;
  };
  screening: { flags: boolean[] };
  consent: boolean;
}

export interface RegistrationResponse {
  arogyaId: string;
  triage: "high-risk" | "normal";
  message: string;
}
```

Note: `QuestionsResponse` is intentionally removed (the `/api/questions` endpoint is retired).

- [ ] **Step 2: Create `frontend/src/data/options.ts`**

```ts
import type {
  RelationshipKey,
  MaritalKey,
  OccupationKey,
  EducationKey,
} from "../types";

export const RELATIONSHIP_KEYS: RelationshipKey[] = [
  "spouse", "child", "parent", "head", "brother", "sister",
  "grandparent", "grandchild", "daughterInLaw", "sonInLaw",
];

export const MARITAL_KEYS: MaritalKey[] = [
  "single", "married", "divorced", "separated", "widowed", "notStated",
];

export const OCCUPATION_KEYS: OccupationKey[] = [
  "unemployed", "selfEmployment", "privateSector", "foreignLabour",
  "government", "semiGovernment", "contractBasis", "farmer",
  "factoryWorker", "labour", "pension", "other",
];

export const EDUCATION_KEYS: EducationKey[] = [
  "none", "primary", "secondary", "advanced", "diploma",
  "bachelor", "postgraduate",
];

// Placeholder GN divisions for the Kirinda Udapalatha area.
// TO BE REPLACED by a backend-driven, per-clinic option set.
export const GN_DIVISION_PLACEHOLDERS: string[] = [
  "Kirinda", "Udapalatha", "Galpoththawala", "Deltota", "Pussellawa",
  "Gampola", "Hindagala", "Doluwa", "Nawalapitiya", "Ulapane",
];
```

- [ ] **Step 3: Verify it compiles**

Run: `npm run lint`
Expected: PASS (no type errors). If `App.tsx`/components reference removed members, that is expected and fixed in later tasks — at this point only `types.ts`/`data` changed, so lint may report errors in unchanged consumer files. If so, proceed; those are resolved by Tasks 8–14. To check just this file in isolation: `npx tsc --noEmit src/data/options.ts` is not reliable with project settings, so rely on the final lint in Task 15.

- [ ] **Step 4: Commit**

```bash
git add src/types.ts src/data/options.ts
git commit -m "feat: registration types and option-set keys"
```

---

### Task 3: Age helper (TDD)

**Files:**
- Create: `frontend/src/lib/age.ts`
- Test: `frontend/src/lib/age.test.ts`

- [ ] **Step 1: Write the failing test**

`frontend/src/lib/age.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { ageFromDob } from "./age";

describe("ageFromDob", () => {
  const today = new Date("2026-06-03T00:00:00");

  it("returns null for empty input", () => {
    expect(ageFromDob("", today)).toBeNull();
  });

  it("returns null for a future date", () => {
    expect(ageFromDob("2027-01-01", today)).toBeNull();
  });

  it("returns 0 years 0 months for a birthday today", () => {
    expect(ageFromDob("2026-06-03", today)).toEqual({ years: 0, months: 0 });
  });

  it("computes whole years", () => {
    expect(ageFromDob("2000-06-03", today)).toEqual({ years: 26, months: 0 });
  });

  it("computes years and months", () => {
    expect(ageFromDob("2000-01-03", today)).toEqual({ years: 26, months: 5 });
  });

  it("borrows a month when the day has not arrived yet", () => {
    expect(ageFromDob("2000-05-10", today)).toEqual({ years: 25, months: 11 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/age.test.ts`
Expected: FAIL — cannot find module `./age`.

- [ ] **Step 3: Write the minimal implementation**

`frontend/src/lib/age.ts`:
```ts
export interface Age {
  years: number;
  months: number;
}

export function ageFromDob(dobISO: string, today: Date = new Date()): Age | null {
  if (!dobISO) return null;
  const dob = new Date(dobISO + "T00:00:00");
  if (isNaN(dob.getTime()) || dob.getTime() > today.getTime()) return null;

  let years = today.getFullYear() - dob.getFullYear();
  let months = today.getMonth() - dob.getMonth();
  if (today.getDate() < dob.getDate()) {
    months -= 1;
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years, months };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/age.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/age.ts src/lib/age.test.ts
git commit -m "feat: ageFromDob helper with tests"
```

---

### Task 4: Validation helpers (TDD)

**Files:**
- Create: `frontend/src/lib/validation.ts`
- Test: `frontend/src/lib/validation.test.ts`

- [ ] **Step 1: Write the failing test**

`frontend/src/lib/validation.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  isValidNic,
  isValidMobile,
  validateRegistration,
  isRegistrationValid,
} from "./validation";
import type { RegistrationData } from "../types";

function baseData(overrides: Partial<RegistrationData> = {}): RegistrationData {
  return {
    fullName: "Nimal Perera",
    nic: "199012345678",
    phn: "",
    gender: "male",
    dateOfBirth: "1990-01-01",
    householdAddress: "",
    relationshipToHead: null,
    gnDivision: null,
    mobile: "0771234567",
    maritalStatus: null,
    occupation: null,
    education: null,
    ...overrides,
  };
}

describe("isValidNic", () => {
  it("accepts old format (9 digits + V/X)", () => {
    expect(isValidNic("123456789V")).toBe(true);
    expect(isValidNic("123456789x")).toBe(true);
  });
  it("accepts new format (12 digits)", () => {
    expect(isValidNic("199012345678")).toBe(true);
  });
  it("rejects malformed values", () => {
    expect(isValidNic("12345")).toBe(false);
    expect(isValidNic("123456789")).toBe(false);
  });
});

describe("isValidMobile", () => {
  it("accepts local SL mobile formats", () => {
    expect(isValidMobile("0771234567")).toBe(true);
    expect(isValidMobile("94771234567")).toBe(true);
    expect(isValidMobile("+94771234567")).toBe(true);
  });
  it("rejects non-mobile numbers", () => {
    expect(isValidMobile("12345")).toBe(false);
    expect(isValidMobile("0112345678")).toBe(false);
  });
});

describe("validateRegistration", () => {
  it("passes for valid core data", () => {
    expect(validateRegistration(baseData())).toEqual({});
    expect(isRegistrationValid(baseData())).toBe(true);
  });
  it("flags missing required fields", () => {
    const errors = validateRegistration(
      baseData({ fullName: " ", gender: null, dateOfBirth: "", mobile: "" })
    );
    expect(errors.fullName).toBe("errRequired");
    expect(errors.gender).toBe("errRequired");
    expect(errors.dateOfBirth).toBe("errRequired");
    expect(errors.mobile).toBe("errRequired");
  });
  it("requires at least one of NIC or PHN", () => {
    const errors = validateRegistration(baseData({ nic: "", phn: "" }));
    expect(errors.idProof).toBe("errIdRequired");
  });
  it("accepts PHN alone", () => {
    const errors = validateRegistration(baseData({ nic: "", phn: "PHN-001" }));
    expect(errors.idProof).toBeUndefined();
  });
  it("flags an invalid NIC only when non-empty", () => {
    expect(validateRegistration(baseData({ nic: "bad" })).nic).toBe("errInvalidNic");
    expect(validateRegistration(baseData({ nic: "", phn: "P1" })).nic).toBeUndefined();
  });
  it("flags an invalid mobile", () => {
    expect(validateRegistration(baseData({ mobile: "123" })).mobile).toBe("errInvalidMobile");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/validation.test.ts`
Expected: FAIL — cannot find module `./validation`.

- [ ] **Step 3: Write the minimal implementation**

`frontend/src/lib/validation.ts`:
```ts
import type { RegistrationData } from "../types";

const NIC_OLD = /^[0-9]{9}[vVxX]$/;
const NIC_NEW = /^[0-9]{12}$/;
const SL_MOBILE = /^(?:0|94|\+94)?7\d{8}$/;

export function isValidNic(nic: string): boolean {
  const v = nic.trim();
  return NIC_OLD.test(v) || NIC_NEW.test(v);
}

export function isValidMobile(mobile: string): boolean {
  return SL_MOBILE.test(mobile.replace(/[\s-]/g, ""));
}

// Error values are translation keys; the screen maps them to localized strings.
export type RegistrationErrors = Partial<
  Record<keyof RegistrationData | "idProof", string>
>;

export function validateRegistration(data: RegistrationData): RegistrationErrors {
  const errors: RegistrationErrors = {};

  if (!data.fullName.trim()) errors.fullName = "errRequired";
  if (!data.gender) errors.gender = "errRequired";
  if (!data.dateOfBirth) errors.dateOfBirth = "errRequired";

  if (!data.mobile.trim()) errors.mobile = "errRequired";
  else if (!isValidMobile(data.mobile)) errors.mobile = "errInvalidMobile";

  if (!data.nic.trim() && !data.phn.trim()) errors.idProof = "errIdRequired";
  if (data.nic.trim() && !isValidNic(data.nic)) errors.nic = "errInvalidNic";

  return errors;
}

export function isRegistrationValid(data: RegistrationData): boolean {
  return Object.keys(validateRegistration(data)).length === 0;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/validation.ts src/lib/validation.test.ts
git commit -m "feat: registration validation helpers with tests"
```

---

### Task 5: Screening helpers (TDD)

**Files:**
- Create: `frontend/src/lib/screening.ts`
- Test: `frontend/src/lib/screening.test.ts`

- [ ] **Step 1: Write the failing test**

`frontend/src/lib/screening.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import {
  SCREENING_ITEM_COUNT,
  emptyScreeningState,
  toggleSymptom,
  toggleNone,
  isScreeningComplete,
} from "./screening";

describe("screening state", () => {
  it("starts empty with 11 unchecked items and none=false", () => {
    const s = emptyScreeningState();
    expect(s.flags).toHaveLength(SCREENING_ITEM_COUNT);
    expect(s.flags.every((f) => f === false)).toBe(true);
    expect(s.none).toBe(false);
  });

  it("toggles a symptom on and clears none", () => {
    const s = toggleSymptom({ flags: emptyScreeningState().flags, none: true }, 2);
    expect(s.flags[2]).toBe(true);
    expect(s.none).toBe(false);
  });

  it("toggles a symptom off again", () => {
    const on = toggleSymptom(emptyScreeningState(), 0);
    const off = toggleSymptom(on, 0);
    expect(off.flags[0]).toBe(false);
    expect(off.none).toBe(false);
  });

  it("selecting none clears all symptoms", () => {
    const withSymptom = toggleSymptom(emptyScreeningState(), 5);
    const noned = toggleNone(withSymptom);
    expect(noned.none).toBe(true);
    expect(noned.flags.every((f) => f === false)).toBe(true);
  });

  it("toggling none off leaves flags empty", () => {
    const noned = toggleNone(emptyScreeningState());
    const unnoned = toggleNone(noned);
    expect(unnoned.none).toBe(false);
  });

  it("is complete only with consent and a choice", () => {
    const empty = emptyScreeningState();
    expect(isScreeningComplete(empty, true)).toBe(false); // no choice
    expect(isScreeningComplete(toggleSymptom(empty, 1), false)).toBe(false); // no consent
    expect(isScreeningComplete(toggleSymptom(empty, 1), true)).toBe(true);
    expect(isScreeningComplete(toggleNone(empty), true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/lib/screening.test.ts`
Expected: FAIL — cannot find module `./screening`.

- [ ] **Step 3: Write the minimal implementation**

`frontend/src/lib/screening.ts`:
```ts
export const SCREENING_ITEM_COUNT = 11;

export interface ScreeningState {
  flags: boolean[]; // length SCREENING_ITEM_COUNT
  none: boolean;
}

export function emptyScreeningState(): ScreeningState {
  return { flags: Array(SCREENING_ITEM_COUNT).fill(false), none: false };
}

// Toggling any symptom clears the "None of the above" selection.
export function toggleSymptom(state: ScreeningState, index: number): ScreeningState {
  return {
    flags: state.flags.map((f, i) => (i === index ? !f : f)),
    none: false,
  };
}

// Selecting "None of the above" clears every symptom.
export function toggleNone(state: ScreeningState): ScreeningState {
  const none = !state.none;
  return {
    flags: none ? Array(SCREENING_ITEM_COUNT).fill(false) : state.flags,
    none,
  };
}

export function isScreeningComplete(state: ScreeningState, consent: boolean): boolean {
  const anyChecked = state.flags.some((f) => f);
  return consent && (anyChecked || state.none);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/screening.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/screening.ts src/lib/screening.test.ts
git commit -m "feat: screening checklist helpers with tests"
```

---

### Task 6: Translations

**Files:**
- Modify: `frontend/src/translations.ts`
- Test: `frontend/src/translations.test.ts`

The 11 screening items, the "None" line, the consent text, and the intro use authoritative trilingual wording verbatim. Option-set labels and UI chrome are best-effort si/ta translations flagged for native-speaker review.

- [ ] **Step 1: Write the failing test (key parity)**

`frontend/src/translations.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { text } from "./translations";
import { SCREENING_ITEM_COUNT } from "./lib/screening";
import {
  RELATIONSHIP_KEYS,
  MARITAL_KEYS,
  OCCUPATION_KEYS,
  EDUCATION_KEYS,
} from "./data/options";

const langs = ["en", "si", "ta"] as const;

describe("translations", () => {
  it("has 11 screening items in every language", () => {
    for (const l of langs) {
      expect(text[l].screening.items).toHaveLength(SCREENING_ITEM_COUNT);
    }
  });

  it("has a label for every option key in every language", () => {
    for (const l of langs) {
      const o = text[l].options;
      for (const k of RELATIONSHIP_KEYS) expect(o.relationship[k]).toBeTruthy();
      for (const k of MARITAL_KEYS) expect(o.marital[k]).toBeTruthy();
      for (const k of OCCUPATION_KEYS) expect(o.occupation[k]).toBeTruthy();
      for (const k of EDUCATION_KEYS) expect(o.education[k]).toBeTruthy();
    }
  });

  it("has core registration labels in every language", () => {
    for (const l of langs) {
      expect(text[l].reg.title).toBeTruthy();
      expect(text[l].reg.fullName).toBeTruthy();
      expect(text[l].screening.consent).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run src/translations.test.ts`
Expected: FAIL — `text[l].screening` / `.reg` / `.options` undefined.

- [ ] **Step 3: Add the grouped translation blocks**

In `frontend/src/translations.ts`, keep the existing `Language` type and the existing keys in each language object, and **add** these three nested objects (`reg`, `options`, `screening`) inside each of `en`, `si`, and `ta`. Insert them before the closing brace of each language object.

For `en`:
```ts
    reg: {
      title: "Patient Registration",
      stepLabel: "Step 1: Patient Details",
      enrollmentSection: "Enrollment Information",
      orgUnit: "Enrolling Organisation Unit",
      enrollmentDate: "Enrollment Date",
      arogyaId: "Arogya ID",
      arogyaIdPending: "Auto-generated",
      profileSection: "Profile",
      fullName: "Full Name",
      nic: "NIC Number",
      phn: "Personal Health Number (PHN)",
      gender: "Gender / Sex",
      male: "Male",
      female: "Female",
      dob: "Date of Birth",
      age: "Age",
      years: "Years",
      months: "Months",
      address: "Household Number / Address",
      relationship: "Relationship to Household Head",
      gnDivision: "GN Division of Residence",
      gnSearchPlaceholder: "Search your GN division…",
      mobile: "Contact Number (Mobile)",
      marital: "Marital Status",
      occupation: "Occupation",
      education: "Highest Education Level",
      selectPlaceholder: "Select…",
      next: "Next step",
      errRequired: "This field is required",
      errInvalidNic: "Enter a valid NIC (e.g. 123456789V or 200012345678)",
      errInvalidMobile: "Enter a valid mobile number (e.g. 0771234567)",
      errIdRequired: "Enter your NIC or PHN",
    },
    options: {
      relationship: {
        spouse: "Spouse", child: "Child", parent: "Parent",
        head: "Head of the family", brother: "Brother", sister: "Sister",
        grandparent: "Grandparent", grandchild: "Grandchild",
        daughterInLaw: "Daughter-in-law", sonInLaw: "Son-in-law",
      },
      marital: {
        single: "Single", married: "Married", divorced: "Divorced",
        separated: "Separated", widowed: "Widowed",
        notStated: "Not stated / Prefer not to say",
      },
      occupation: {
        unemployed: "Unemployed", selfEmployment: "Self-employment",
        privateSector: "Private sector", foreignLabour: "Foreign labour",
        government: "Government employment", semiGovernment: "Semi government",
        contractBasis: "Contract basis", farmer: "Farmer",
        factoryWorker: "Factory worker", labour: "Labour",
        pension: "Pension", other: "Other",
      },
      education: {
        none: "No formal education", primary: "Primary education",
        secondary: "Secondary education (O/L or equivalent)",
        advanced: "Advanced Level (A/L or equivalent)",
        diploma: "Diploma / Technical certificate",
        bachelor: "Bachelor's degree",
        postgraduate: "Postgraduate degree (Master's / PhD)",
      },
    },
    screening: {
      title: "Health Screening",
      stepLabel: "Step 2: Health Screening",
      intro: "To help us provide timely care, please indicate if any of the following apply to you.",
      none: "None of the above apply to me.",
      consent: "I consent to the Ministry of Health collecting, storing, and processing my personal health information for healthcare service delivery, follow-up care, monitoring, and related healthcare purposes.",
      submit: "Submit Registration",
      items: [
        "I currently have chest pain, chest discomfort, or become unusually short of breath during daily activities.",
        "I have been feeling very sad, depressed, or hopeless for more than two weeks.",
        "I have lost a significant amount of weight without trying during the past few months.",
        "I have noticed a new lump or unusual change in my breast.",
        "I have a mouth ulcer, red or white patch, lump, or other unusual change in my mouth that has not healed within three weeks.",
        "I have been diagnosed with high blood pressure (hypertension).",
        "I have been diagnosed with diabetes or high blood sugar.",
        "I have oral health problems such as tooth pain, swollen or bleeding gums, loose teeth, difficulty chewing, or other concerns affecting my mouth or teeth.",
        "I currently smoke tobacco or use tobacco products.",
        "I consume alcohol frequently or in large amounts.",
        "I use recreational or non-prescribed substances.",
      ],
    },
```

For `si`:
```ts
    reg: {
      title: "රෝගී ලියාපදිංචිය",
      stepLabel: "පියවර 1: රෝගියාගේ විස්තර",
      enrollmentSection: "ලියාපදිංචි තොරතුරු",
      orgUnit: "ලියාපදිංචි කරන ආයතන ඒකකය",
      enrollmentDate: "ලියාපදිංචි දිනය",
      arogyaId: "ආරෝග්‍යා හැඳුනුම්පත",
      arogyaIdPending: "ස්වයංක්‍රීයව ජනනය වේ",
      profileSection: "පැතිකඩ",
      fullName: "සම්පූර්ණ නම",
      nic: "ජා.හැ. අංකය",
      phn: "පුද්ගලික සෞඛ්‍ය අංකය (PHN)",
      gender: "ස්ත්‍රී / පුරුෂ භාවය",
      male: "පුරුෂ",
      female: "ස්ත්‍රී",
      dob: "උපන් දිනය",
      age: "වයස",
      years: "අවුරුදු",
      months: "මාස",
      address: "නිවසේ අංකය / ලිපිනය",
      relationship: "පවුලේ ප්‍රධානියා සමඟ ඇති සම්බන්ධතාවය",
      gnDivision: "පදිංචි ග්‍රාම නිලධාරී වසම",
      gnSearchPlaceholder: "ඔබගේ ග්‍රාම නිලධාරී වසම සොයන්න…",
      mobile: "දුරකථන අංකය (ජංගම)",
      marital: "විවාහක තත්ත්වය",
      occupation: "රැකියාව",
      education: "උපරිම අධ්‍යාපන මට්ටම",
      selectPlaceholder: "තෝරන්න…",
      next: "ඊළඟ පියවර",
      errRequired: "මෙම ක්ෂේත්‍රය අවශ්‍ය වේ",
      errInvalidNic: "වලංගු ජා.හැ. අංකයක් ඇතුළත් කරන්න (උදා. 123456789V හෝ 200012345678)",
      errInvalidMobile: "වලංගු ජංගම දුරකථන අංකයක් ඇතුළත් කරන්න (උදා. 0771234567)",
      errIdRequired: "ඔබගේ ජා.හැ. අංකය හෝ PHN ඇතුළත් කරන්න",
    },
    options: {
      relationship: {
        spouse: "කලත්‍රයා", child: "දරුවා", parent: "මව්පියා",
        head: "පවුලේ ප්‍රධානියා", brother: "සහෝදරයා", sister: "සහෝදරිය",
        grandparent: "මුත්තා / ආච්චි", grandchild: "මුනුපුරා / මිණිපිරිය",
        daughterInLaw: "ලේලි", sonInLaw: "බෑණා",
      },
      marital: {
        single: "අවිවාහක", married: "විවාහක", divorced: "දික්කසාද",
        separated: "වෙන්ව සිටින", widowed: "වැන්දඹු",
        notStated: "සඳහන් කර නැත / කීමට අකැමැතියි",
      },
      occupation: {
        unemployed: "රැකියා විරහිත", selfEmployment: "ස්වයං රැකියා",
        privateSector: "පෞද්ගලික අංශය", foreignLabour: "විදේශ ශ්‍රමය",
        government: "රාජ්‍ය සේවය", semiGovernment: "අර්ධ රාජ්‍ය",
        contractBasis: "කොන්ත්‍රාත් පදනම", farmer: "ගොවියා",
        factoryWorker: "කම්හල් සේවකයා", labour: "කම්කරු",
        pension: "විශ්‍රාම වැටුප", other: "වෙනත්",
      },
      education: {
        none: "විධිමත් අධ්‍යාපනයක් නැත", primary: "ප්‍රාථමික අධ්‍යාපනය",
        secondary: "ද්විතීයික අධ්‍යාපනය (සා.පෙළ හෝ සමාන)",
        advanced: "උසස් පෙළ (උ.පෙළ හෝ සමාන)",
        diploma: "ඩිප්ලෝමා / කාර්මික සහතිකය",
        bachelor: "උපාධිය",
        postgraduate: "පශ්චාත් උපාධි (ශාස්ත්‍රපති / දර්ශනපති)",
      },
    },
    screening: {
      title: "සෞඛ්‍ය පිරික්සුම",
      stepLabel: "පියවර 2: සෞඛ්‍ය පිරික්සුම",
      intro: "ඔබට කාලෝචිත හා සුදුසු සෞඛ්‍ය සේවාවක් ලබාදීමට පහත සඳහන් තත්ත්වයන් ඔබට අදාළ වේ නම් සලකුණු කරන්න.",
      none: "ඉහත සඳහන් කිසිවක් මට අදාළ නොවේ.",
      consent: "සෞඛ්‍ය සේවා ලබාදීම, පසු විපරම් කිරීම, නිරීක්ෂණය කිරීම සහ අදාළ සෞඛ්‍ය කටයුතු සඳහා සෞඛ්‍ය අමාත්‍යාංශය විසින් මගේ පුද්ගලික සෞඛ්‍ය තොරතුරු රැස් කිරීම, ගබඩා කිරීම සහ සැකසීම සඳහා මම එකඟ වෙමි.",
      submit: "ලියාපදිංචිය යොමු කරන්න",
      items: [
        "මට දැනට පපුවේ වේදනාවක්, පපුවේ අපහසුතාවයක් හෝ දෛනික කටයුතු කිරීමේදී අසාමාන්‍ය ලෙස හුස්ම හිරවීමක් ඇත.",
        "සති දෙකකට වැඩි කාලයක් තිස්සේ මට දැඩි දුකක්, මානසික අවපීඩනයක් හෝ බලාපොරොත්තු රහිත බවක් දැනී ඇත.",
        "පසුගිය මාස කිහිපය තුළ උත්සාහයකින් තොරව සැලකිය යුතු බර අඩුවීමක් සිදුවී ඇත.",
        "මගේ පියයුරු තුළ නව ගැටයක් හෝ අසාමාන්‍ය වෙනසක් මම නිරීක්ෂණය කර ඇත.",
        "සති තුනක් ඇතුළත සුව නොවූ මුඛයේ වණයක්, රතු හෝ සුදු පැල්ලමක්, ගැටයක් හෝ වෙනත් අසාමාන්‍ය වෙනසක් මට ඇත.",
        "මට අධි රුධිර පීඩනය ඇති බව වෛද්‍යවරයෙකු විසින් පවසා ඇත.",
        "මට දියවැඩියාව හෝ රුධිරයේ සීනි මට්ටම වැඩි බව පවසා ඇත.",
        "මට දත් වේදනාව, ඉදිමුණු හෝ ලේ ගැලෙන දත් මස්, සෙලවෙන දත්, ආහාර හපීමට අපහසු වීම හෝ මුඛය හා දත් සම්බන්ධ වෙනත් සෞඛ්‍ය ගැටලු පවතී.",
        "මම දැනට දුම්පානය කරනවා හෝ දුම්කොළ නිෂ්පාදන භාවිතා කරනවා.",
        "මම නිතර හෝ වැඩි ප්‍රමාණයෙන් මත්පැන් භාවිතා කරමි.",
        "මම වෛද්‍ය උපදෙස් නොමැතිව මත්ද්‍රව්‍ය හෝ වෙනත් ඇබ්බැහි විය හැකි ද්‍රව්‍ය භාවිතා කරමි.",
      ],
    },
```

For `ta`:
```ts
    reg: {
      title: "நோயாளர் பதிவு",
      stepLabel: "படி 1: நோயாளர் விவரங்கள்",
      enrollmentSection: "பதிவு தகவல்",
      orgUnit: "பதிவு செய்யும் நிறுவன அலகு",
      enrollmentDate: "பதிவு தேதி",
      arogyaId: "ஆரோக்யா அடையாள எண்",
      arogyaIdPending: "தானாக உருவாக்கப்படும்",
      profileSection: "சுயவிவரம்",
      fullName: "முழுப் பெயர்",
      nic: "தே.அ.அட்டை எண்",
      phn: "தனிப்பட்ட சுகாதார எண் (PHN)",
      gender: "பாலினம்",
      male: "ஆண்",
      female: "பெண்",
      dob: "பிறந்த தேதி",
      age: "வயது",
      years: "வருடங்கள்",
      months: "மாதங்கள்",
      address: "வீட்டு எண் / முகவரி",
      relationship: "குடும்பத் தலைவருடன் உறவு",
      gnDivision: "வசிக்கும் கிராம சேவகர் பிரிவு",
      gnSearchPlaceholder: "உங்கள் கிராம சேவகர் பிரிவைத் தேடுங்கள்…",
      mobile: "தொடர்பு எண் (கைபேசி)",
      marital: "திருமண நிலை",
      occupation: "தொழில்",
      education: "உயர் கல்வி நிலை",
      selectPlaceholder: "தேர்ந்தெடுக்கவும்…",
      next: "அடுத்த படி",
      errRequired: "இந்தப் புலம் தேவை",
      errInvalidNic: "சரியான தே.அ.அட்டை எண்ணை உள்ளிடவும் (எ.கா. 123456789V அல்லது 200012345678)",
      errInvalidMobile: "சரியான கைபேசி எண்ணை உள்ளிடவும் (எ.கா. 0771234567)",
      errIdRequired: "உங்கள் தே.அ.அட்டை எண் அல்லது PHN ஐ உள்ளிடவும்",
    },
    options: {
      relationship: {
        spouse: "வாழ்க்கைத் துணை", child: "குழந்தை", parent: "பெற்றோர்",
        head: "குடும்பத் தலைவர்", brother: "சகோதரன்", sister: "சகோதரி",
        grandparent: "தாத்தா / பாட்டி", grandchild: "பேரன் / பேத்தி",
        daughterInLaw: "மருமகள்", sonInLaw: "மருமகன்",
      },
      marital: {
        single: "திருமணமாகாதவர்", married: "திருமணமானவர்", divorced: "விவாகரத்து",
        separated: "பிரிந்து வாழ்பவர்", widowed: "விதவை / துணை இழந்தவர்",
        notStated: "குறிப்பிடவில்லை / சொல்ல விரும்பவில்லை",
      },
      occupation: {
        unemployed: "வேலையில்லாதவர்", selfEmployment: "சுயதொழில்",
        privateSector: "தனியார் துறை", foreignLabour: "வெளிநாட்டு வேலை",
        government: "அரசு வேலை", semiGovernment: "அரை-அரசு",
        contractBasis: "ஒப்பந்த அடிப்படை", farmer: "விவசாயி",
        factoryWorker: "தொழிற்சாலை தொழிலாளி", labour: "கூலி வேலை",
        pension: "ஓய்வூதியம்", other: "மற்றவை",
      },
      education: {
        none: "முறையான கல்வி இல்லை", primary: "ஆரம்பக் கல்வி",
        secondary: "இடைநிலைக் கல்வி (சா.த அல்லது சமமானது)",
        advanced: "உயர்தரம் (உ.த அல்லது சமமானது)",
        diploma: "டிப்ளோமா / தொழில்நுட்பச் சான்றிதழ்",
        bachelor: "இளங்கலைப் பட்டம்",
        postgraduate: "முதுகலைப் பட்டம் (முதுகலை / முனைவர்)",
      },
    },
    screening: {
      title: "சுகாதார திரையிடல்",
      stepLabel: "படி 2: சுகாதார திரையிடல்",
      intro: "உங்களுக்கு தகுந்த மற்றும் துரிதமான சுகாதார சேவையை வழங்க உதவுவதற்காக, கீழ்க்காணும் நிலைகளில் ஏதேனும் உங்களுக்கு பொருந்துமானால் தெரிவுசெய்யவும்.",
      none: "மேலே குறிப்பிடப்பட்ட எதுவும் எனக்கு பொருந்தாது.",
      consent: "சுகாதார சேவைகள் வழங்குதல், தொடர்ச்சியான பராமரிப்பு, கண்காணிப்பு மற்றும் தொடர்புடைய சுகாதார நோக்கங்களுக்காக சுகாதார அமைச்சகம் எனது தனிப்பட்ட சுகாதார தகவல்களை சேகரித்து, சேமித்து, செயலாக்குவதற்கு நான் சம்மதிக்கிறேன்.",
      submit: "பதிவைச் சமர்ப்பிக்கவும்",
      items: [
        "எனக்கு தற்போது நெஞ்சுவலி, நெஞ்சு அசௌகரியம் அல்லது அன்றாட செயல்பாடுகளின் போது அசாதாரண மூச்சுத்திணறல் உள்ளது.",
        "இரண்டு வாரங்களுக்கும் மேலாக நான் மிகுந்த சோகம், மனச்சோர்வு அல்லது நம்பிக்கையின்மை உணர்ந்து வருகிறேன்.",
        "கடந்த சில மாதங்களில் முயற்சியின்றி குறிப்பிடத்தக்க அளவு உடல் எடை குறைந்துள்ளது.",
        "என் மார்பகத்தில் புதிய கட்டி அல்லது அசாதாரண மாற்றம் ஒன்றைக் கவனித்துள்ளேன்.",
        "மூன்று வாரங்களுக்குள் ஆறாத வாய்ப்புண், சிவப்பு அல்லது வெள்ளை தழும்பு, கட்டி அல்லது வாயில் பிற அசாதாரண மாற்றம் எனக்கு உள்ளது.",
        "எனக்கு உயர் இரத்த அழுத்தம் இருப்பதாக மருத்துவர் தெரிவித்துள்ளார்.",
        "எனக்கு நீரிழிவு நோய் அல்லது அதிக இரத்த சர்க்கரை இருப்பதாக தெரிவிக்கப்பட்டுள்ளது.",
        "எனக்கு பல் வலி, வீங்கிய அல்லது இரத்தம் வரும் ஈறுகள், அசையும் பற்கள், மெல்வதில் சிரமம் அல்லது வாய் மற்றும் பற்கள் தொடர்பான பிற சுகாதார பிரச்சினைகள் உள்ளன.",
        "நான் தற்போது புகைபிடிக்கிறேன் அல்லது புகையிலைப் பொருட்களை பயன்படுத்துகிறேன்.",
        "நான் அடிக்கடி அல்லது அதிக அளவில் மதுபானம் அருந்துகிறேன்.",
        "நான் மருத்துவர் பரிந்துரையின்றி போதைப்பொருள் அல்லது பிற பழக்கப்பொருட்களை பயன்படுத்துகிறேன்.",
      ],
    },
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/translations.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/translations.ts src/translations.test.ts
git commit -m "feat: trilingual strings for registration and screening"
```

---

### Task 7: API service update

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1: Replace `frontend/src/services/api.ts`**

Remove `fetchQuestions` and `QuestionsResponse`; update imports and the `submitRegistration` body type.

```ts
import { getConfig } from "../config";
import type {
  ApiResult,
  ClinicValidationResponse,
  RegistrationRequest,
  RegistrationResponse,
} from "../types";

const TIMEOUT_MS = 10000;

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<ApiResult<T>> {
  const { apiBaseUrl } = getConfig();
  const url = `${apiBaseUrl}${path}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        ...options.headers,
      },
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const body = await response.text();
      const message = body ? body : `Request failed with status ${response.status}`;
      return { ok: false, error: message };
    }

    const data = await response.json();
    return { ok: true, data };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === "AbortError") {
      return { ok: false, error: "Request timed out. Please try again." };
    }
    return {
      ok: false,
      error: "Unable to connect to the server. Please check your connection.",
    };
  }
}

export function validateClinic(
  clinicId: string
): Promise<ApiResult<ClinicValidationResponse>> {
  return request<ClinicValidationResponse>("/clinics/validate", {
    method: "POST",
    body: JSON.stringify({ clinicId }),
  });
}

export function submitRegistration(
  body: RegistrationRequest
): Promise<ApiResult<RegistrationResponse>> {
  return request<RegistrationResponse>("/registration", {
    method: "POST",
    body: JSON.stringify(body),
  });
}
```

- [ ] **Step 2: Commit (lint deferred to Task 15)**

```bash
git add src/services/api.ts
git commit -m "feat: richer registration payload, drop questions fetch"
```

---

### Task 8: Field primitive — TextField

**Files:**
- Create: `frontend/src/components/fields/TextField.tsx`

- [ ] **Step 1: Create the component**

```tsx
import React from "react";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  type?: string;
  placeholder?: string;
  inputMode?: "text" | "tel" | "numeric";
}

export function TextField({
  label, value, onChange, required, error, type = "text", placeholder, inputMode,
}: Props) {
  return (
    <div>
      <label className="block text-[13px] font-bold text-[#122A21] mb-2">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`w-full p-4 border-[1.5px] rounded-[12px] bg-white focus:outline-none focus:ring-4 focus:ring-[#D6F2E5] text-[#122A21] placeholder-gray-400 text-[16px] transition-all ${
          error ? "border-red-400" : "border-gray-200 focus:border-[#0A5C43]"
        }`}
      />
      {error && <p className="mt-1.5 text-[13px] text-red-600 font-medium">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/fields/TextField.tsx
git commit -m "feat: TextField primitive"
```

---

### Task 9: Field primitive — SegmentedControl

**Files:**
- Create: `frontend/src/components/fields/SegmentedControl.tsx`

- [ ] **Step 1: Create the component**

```tsx
import React from "react";

interface Option<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  label: string;
  options: Option<T>[];
  value: T | null;
  onChange: (value: T) => void;
  required?: boolean;
  error?: string;
}

export function SegmentedControl<T extends string>({
  label, options, value, onChange, required, error,
}: Props<T>) {
  return (
    <div>
      <label className="block text-[13px] font-bold text-[#122A21] mb-2">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <div className="flex gap-3">
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`flex-1 py-3.5 rounded-[12px] border-[1.5px] font-semibold text-[15px] transition-all ${
                active
                  ? "bg-[#E1F0E9] border-[#0A5C43] text-[#0A5C43]"
                  : "bg-white border-gray-200 text-[#4F675C]"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-1.5 text-[13px] text-red-600 font-medium">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/fields/SegmentedControl.tsx
git commit -m "feat: SegmentedControl primitive"
```

---

### Task 10: Field primitive — DateField

**Files:**
- Create: `frontend/src/components/fields/DateField.tsx`

- [ ] **Step 1: Create the component**

```tsx
import React from "react";
import { ageFromDob } from "../../lib/age";

interface Props {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  error?: string;
  ageLabel: string;
  yearsLabel: string;
  monthsLabel: string;
}

export function DateField({
  label, value, onChange, required, error, ageLabel, yearsLabel, monthsLabel,
}: Props) {
  const age = ageFromDob(value);
  const max = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <label className="block text-[13px] font-bold text-[#122A21] mb-2">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <input
        type="date"
        value={value}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full p-4 border-[1.5px] rounded-[12px] bg-white focus:outline-none focus:ring-4 focus:ring-[#D6F2E5] text-[#122A21] text-[16px] transition-all ${
          error ? "border-red-400" : "border-gray-200 focus:border-[#0A5C43]"
        }`}
      />
      {age && (
        <p className="mt-1.5 text-[13px] text-[#4F675C] font-medium">
          {ageLabel}: {age.years} {yearsLabel} {age.months} {monthsLabel}
        </p>
      )}
      {error && <p className="mt-1.5 text-[13px] text-red-600 font-medium">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/fields/DateField.tsx
git commit -m "feat: DateField primitive with derived age"
```

---

### Task 11: Field primitive — SelectField

**Files:**
- Create: `frontend/src/components/fields/SelectField.tsx`

- [ ] **Step 1: Create the component**

```tsx
import React from "react";

interface Option {
  value: string;
  label: string;
}

interface Props {
  label: string;
  options: Option[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder: string;
  required?: boolean;
  error?: string;
}

export function SelectField({
  label, options, value, onChange, placeholder, required, error,
}: Props) {
  return (
    <div>
      <label className="block text-[13px] font-bold text-[#122A21] mb-2">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </label>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full p-4 border-[1.5px] rounded-[12px] bg-white focus:outline-none focus:ring-4 focus:ring-[#D6F2E5] text-[16px] transition-all ${
          value ? "text-[#122A21]" : "text-gray-400"
        } ${error ? "border-red-400" : "border-gray-200 focus:border-[#0A5C43]"}`}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value} className="text-[#122A21]">
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1.5 text-[13px] text-red-600 font-medium">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/fields/SelectField.tsx
git commit -m "feat: SelectField primitive"
```

---

### Task 12: Field primitive — SearchableSelect

**Files:**
- Create: `frontend/src/components/fields/SearchableSelect.tsx`

- [ ] **Step 1: Create the component**

```tsx
import React, { useState } from "react";

interface Props {
  label: string;
  options: string[];
  value: string | null;
  onChange: (value: string) => void;
  placeholder: string;
}

export function SearchableSelect({ label, options, value, onChange, placeholder }: Props) {
  const [query, setQuery] = useState(value ?? "");
  const [open, setOpen] = useState(false);

  const filtered = options
    .filter((o) => o.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  const pick = (option: string) => {
    onChange(option);
    setQuery(option);
    setOpen(false);
  };

  return (
    <div className="relative">
      <label className="block text-[13px] font-bold text-[#122A21] mb-2">{label}</label>
      <input
        type="text"
        value={query}
        placeholder={placeholder}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="w-full p-4 border-[1.5px] border-gray-200 rounded-[12px] bg-white focus:outline-none focus:border-[#0A5C43] focus:ring-4 focus:ring-[#D6F2E5] text-[#122A21] placeholder-gray-400 text-[16px] transition-all"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full bg-white border-[1.5px] border-gray-200 rounded-[12px] shadow-lg max-h-56 overflow-y-auto">
          {filtered.map((option) => (
            <li key={option}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(option)}
                className="w-full text-left px-4 py-3 text-[15px] text-[#122A21] hover:bg-[#EAF5F0]"
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/fields/SearchableSelect.tsx
git commit -m "feat: SearchableSelect primitive"
```

---

### Task 13: RegistrationScreen

**Files:**
- Create: `frontend/src/components/RegistrationScreen.tsx`

- [ ] **Step 1: Create the component**

```tsx
import React, { useState } from "react";
import { Language, text } from "../translations";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type {
  RegistrationData,
  Gender,
  RelationshipKey,
  MaritalKey,
  OccupationKey,
  EducationKey,
} from "../types";
import {
  RELATIONSHIP_KEYS,
  MARITAL_KEYS,
  OCCUPATION_KEYS,
  EDUCATION_KEYS,
  GN_DIVISION_PLACEHOLDERS,
} from "../data/options";
import { validateRegistration, type RegistrationErrors } from "../lib/validation";
import { TextField } from "./fields/TextField";
import { SegmentedControl } from "./fields/SegmentedControl";
import { DateField } from "./fields/DateField";
import { SelectField } from "./fields/SelectField";
import { SearchableSelect } from "./fields/SearchableSelect";

interface Props {
  language: Language;
  clinicId: string;
  clinicName: string | null;
  initial: RegistrationData | null;
  onBack: () => void;
  onComplete: (data: RegistrationData) => void;
}

function emptyData(): RegistrationData {
  return {
    fullName: "", nic: "", phn: "", gender: null, dateOfBirth: "",
    householdAddress: "", relationshipToHead: null, gnDivision: null,
    mobile: "", maritalStatus: null, occupation: null, education: null,
  };
}

export function RegistrationScreen({
  language, clinicId, clinicName, initial, onBack, onComplete,
}: Props) {
  const t = text[language];
  const [data, setData] = useState<RegistrationData>(initial ?? emptyData());
  const [errors, setErrors] = useState<RegistrationErrors>({});

  const today = new Date().toISOString().slice(0, 10);
  const set = <K extends keyof RegistrationData>(key: K, value: RegistrationData[K]) =>
    setData((d) => ({ ...d, [key]: value }));

  const msg = (key?: string): string | undefined =>
    key ? (t.reg as Record<string, string>)[key] : undefined;

  const handleNext = () => {
    const found = validateRegistration(data);
    setErrors(found);
    if (Object.keys(found).length === 0) {
      onComplete(data);
    } else {
      document.querySelector("[data-error='true']")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  };

  const opt = <T extends string>(keys: T[], dict: Record<T, string>) =>
    keys.map((k) => ({ value: k, label: dict[k] }));

  return (
    <div className="h-full bg-[#F6F9F7] flex flex-col relative overflow-hidden">
      <div className="bg-[#F6F9F7] pt-5 pb-4 px-4 flex items-center sticky top-0 z-10 border-b border-gray-200">
        <button onClick={onBack} className="text-[#122A21] mr-3 p-2 -ml-2 rounded-full focus:bg-gray-100 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-[19px] font-bold text-[#0A5C43] tracking-tight">{t.reg.stepLabel}</h1>
      </div>

      <div className="flex-1 overflow-y-auto hidden-scrollbar p-5 pb-28 space-y-6">
        {/* Enrollment Information */}
        <section className="bg-white border-[1.5px] border-[#D6EFE3] rounded-[16px] p-5 space-y-3">
          <h2 className="text-[15px] font-bold text-[#0A5C43]">{t.reg.enrollmentSection}</h2>
          <Readonly label={t.reg.orgUnit} value={clinicName ?? clinicId} />
          <Readonly label={t.reg.enrollmentDate} value={today} />
          <Readonly label={t.reg.arogyaId} value={t.reg.arogyaIdPending} muted />
        </section>

        {/* Profile */}
        <section className="space-y-5">
          <h2 className="text-[15px] font-bold text-[#0A5C43] pb-2 border-b-[1.5px] border-[#D6EFE3]">
            {t.reg.profileSection}
          </h2>

          <div data-error={!!errors.fullName}>
            <TextField label={t.reg.fullName} value={data.fullName} required
              error={msg(errors.fullName)} onChange={(v) => set("fullName", v)} />
          </div>
          <div data-error={!!errors.nic || !!errors.idProof}>
            <TextField label={t.reg.nic} value={data.nic}
              error={msg(errors.nic) ?? msg(errors.idProof)} onChange={(v) => set("nic", v)} />
          </div>
          <TextField label={t.reg.phn} value={data.phn} onChange={(v) => set("phn", v)} />
          <div data-error={!!errors.gender}>
            <SegmentedControl<Gender> label={t.reg.gender} value={data.gender} required
              error={msg(errors.gender)}
              options={[{ value: "male", label: t.reg.male }, { value: "female", label: t.reg.female }]}
              onChange={(v) => set("gender", v)} />
          </div>
          <div data-error={!!errors.dateOfBirth}>
            <DateField label={t.reg.dob} value={data.dateOfBirth} required
              error={msg(errors.dateOfBirth)}
              ageLabel={t.reg.age} yearsLabel={t.reg.years} monthsLabel={t.reg.months}
              onChange={(v) => set("dateOfBirth", v)} />
          </div>
          <TextField label={t.reg.address} value={data.householdAddress}
            onChange={(v) => set("householdAddress", v)} />
          <SelectField label={t.reg.relationship} placeholder={t.reg.selectPlaceholder}
            value={data.relationshipToHead}
            options={opt<RelationshipKey>(RELATIONSHIP_KEYS, t.options.relationship)}
            onChange={(v) => set("relationshipToHead", v as RelationshipKey)} />
          <SearchableSelect label={t.reg.gnDivision} placeholder={t.reg.gnSearchPlaceholder}
            options={GN_DIVISION_PLACEHOLDERS} value={data.gnDivision}
            onChange={(v) => set("gnDivision", v)} />
          <div data-error={!!errors.mobile}>
            <TextField label={t.reg.mobile} value={data.mobile} required type="tel" inputMode="tel"
              error={msg(errors.mobile)} onChange={(v) => set("mobile", v)} />
          </div>
          <SelectField label={t.reg.marital} placeholder={t.reg.selectPlaceholder}
            value={data.maritalStatus}
            options={opt<MaritalKey>(MARITAL_KEYS, t.options.marital)}
            onChange={(v) => set("maritalStatus", v as MaritalKey)} />
          <SelectField label={t.reg.occupation} placeholder={t.reg.selectPlaceholder}
            value={data.occupation}
            options={opt<OccupationKey>(OCCUPATION_KEYS, t.options.occupation)}
            onChange={(v) => set("occupation", v as OccupationKey)} />
          <SelectField label={t.reg.education} placeholder={t.reg.selectPlaceholder}
            value={data.education}
            options={opt<EducationKey>(EDUCATION_KEYS, t.options.education)}
            onChange={(v) => set("education", v as EducationKey)} />
        </section>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-5 bg-[#F6F9F7] border-t border-gray-200">
        <button onClick={handleNext}
          className="w-full py-[18px] bg-[#0A5C43] hover:bg-[#074734] text-white rounded-[12px] font-semibold text-[16px] transition-all shadow-[0_4px_12px_rgba(10,92,67,0.15)] flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-[#2C8567]">
          {t.reg.next}
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}

function Readonly({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between items-center gap-3">
      <span className="text-[13px] font-semibold text-[#4F675C]">{label}</span>
      <span className={`text-[14px] font-bold text-right ${muted ? "text-[#8C9E95] italic" : "text-[#122A21]"}`}>
        {value}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/RegistrationScreen.tsx
git commit -m "feat: RegistrationScreen form"
```

---

### Task 14: Questionnaire redesign

**Files:**
- Modify: `frontend/src/components/QuestionnaireScreen.tsx` (full replacement)

- [ ] **Step 1: Replace the component**

```tsx
import React, { useState } from "react";
import { Language, text } from "../translations";
import { ArrowLeft, CheckCircle2, AlertCircle, Check } from "lucide-react";
import { motion } from "motion/react";
import {
  emptyScreeningState,
  toggleSymptom,
  toggleNone,
  isScreeningComplete,
} from "../lib/screening";

interface Props {
  language: Language;
  onBack: () => void;
  onComplete: (flags: boolean[], consent: boolean) => void;
}

export function QuestionnaireScreen({ language, onBack, onComplete }: Props) {
  const t = text[language];
  const [state, setState] = useState(emptyScreeningState());
  const [consent, setConsent] = useState(false);

  const complete = isScreeningComplete(state, consent);

  return (
    <div className="h-full bg-[#F6F9F7] flex flex-col relative overflow-y-auto hidden-scrollbar">
      <div className="bg-[#F6F9F7] pt-5 pb-4 px-4 flex items-center sticky top-0 z-10 border-b border-gray-200">
        <button onClick={onBack} className="text-[#122A21] mr-3 p-2 -ml-2 rounded-full focus:bg-gray-100 transition-colors">
          <ArrowLeft size={24} />
        </button>
        <h1 className="text-[19px] font-bold text-[#0A5C43] tracking-tight">{t.screening.stepLabel}</h1>
      </div>

      <div className="p-5 pb-10">
        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="bg-white border-[1.5px] border-[#D6EFE3] rounded-[16px] p-5 flex gap-3.5 mb-6 shadow-sm">
          <AlertCircle className="text-[#0A5C43] shrink-0 mt-0.5" size={22} strokeWidth={2.5} />
          <p className="text-[13px] text-[#4F675C] leading-relaxed font-medium">{t.screening.intro}</p>
        </motion.div>

        <div className="space-y-3 mb-6">
          {t.screening.items.map((item, index) => {
            const checked = state.flags[index];
            return (
              <button key={index} type="button" onClick={() => setState((s) => toggleSymptom(s, index))}
                className={`w-full text-left flex items-start gap-3.5 p-4 rounded-[16px] border-[1.5px] transition-colors ${
                  checked ? "bg-[#E1F0E9] border-[#0A5C43]" : "bg-white border-gray-200"
                }`}>
                <div className={`w-[22px] h-[22px] rounded-[6px] mt-0.5 border-[2px] flex items-center justify-center shrink-0 transition-colors ${
                  checked ? "border-[#0A5C43] bg-[#0A5C43]" : "border-gray-400 bg-white"
                }`}>
                  {checked && <Check size={14} className="text-white" strokeWidth={3.5} />}
                </div>
                <span className="text-[14px] font-medium text-[#122A21] leading-relaxed">{item}</span>
              </button>
            );
          })}

          {/* None of the above */}
          <button type="button" onClick={() => setState((s) => toggleNone(s))}
            className={`w-full text-left flex items-start gap-3.5 p-4 rounded-[16px] border-[1.5px] transition-colors ${
              state.none ? "bg-[#E1F0E9] border-[#0A5C43]" : "bg-white border-gray-200"
            }`}>
            <div className={`w-[22px] h-[22px] rounded-[6px] mt-0.5 border-[2px] flex items-center justify-center shrink-0 transition-colors ${
              state.none ? "border-[#0A5C43] bg-[#0A5C43]" : "border-gray-400 bg-white"
            }`}>
              {state.none && <Check size={14} className="text-white" strokeWidth={3.5} />}
            </div>
            <span className="text-[14px] font-semibold text-[#122A21] leading-relaxed">{t.screening.none}</span>
          </button>
        </div>

        {/* Consent */}
        <div className="bg-[#EAF5F0] border-[1.5px] border-[#CDEAE0] p-5 rounded-[16px] mb-8">
          <label className="flex items-start gap-4 cursor-pointer group">
            <input type="checkbox" className="sr-only" checked={consent}
              onChange={(e) => setConsent(e.target.checked)} />
            <div className={`w-[22px] h-[22px] rounded-[6px] mt-0.5 border-[2px] flex items-center justify-center transition-colors shrink-0 ${
              consent ? "border-[#0A5C43] bg-[#0A5C43]" : "border-gray-400 bg-white group-hover:border-[#0A5C43]"
            }`}>
              {consent && <Check size={14} className="text-white" strokeWidth={3.5} />}
            </div>
            <span className="text-[13px] text-[#2C4138] leading-relaxed font-medium">{t.screening.consent}</span>
          </label>
        </div>

        <button onClick={() => complete && onComplete(state.flags, consent)} disabled={!complete}
          className="w-full py-[18px] bg-[#0A5C43] hover:bg-[#074734] text-white rounded-[12px] font-semibold text-[16px] transition-all shadow-[0_4px_12px_rgba(10,92,67,0.15)] disabled:bg-[#A8DEC3] disabled:text-[#F6F9F7] disabled:shadow-none disabled:cursor-not-allowed flex items-center justify-center gap-2 focus:outline-none focus:ring-4 focus:ring-[#2C8567]">
          {t.screening.submit} <CheckCircle2 size={20} />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/QuestionnaireScreen.tsx
git commit -m "feat: checklist questionnaire with None and consent"
```

---

### Task 15: TriageSummaryScreen update

**Files:**
- Modify: `frontend/src/components/TriageSummaryScreen.tsx` (full replacement)

- [ ] **Step 1: Replace the component**

```tsx
import React, { useState, useEffect } from "react";
import { Language, text } from "../translations";
import type { RegistrationData, TriageResult } from "../types";
import { submitRegistration } from "../services/api";
import { motion } from "motion/react";
import { AlertCircle, CheckCircle2, RotateCcw } from "lucide-react";

interface Props {
  language: Language;
  clinicId: string;
  registration: RegistrationData;
  screeningFlags: boolean[];
  consent: boolean;
  onReset: () => void;
}

export function TriageSummaryScreen({
  language, clinicId, registration, screeningFlags, consent, onReset,
}: Props) {
  const t = text[language];
  const [isSubmitting, setIsSubmitting] = useState(true);
  const [result, setResult] = useState<(TriageResult & { arogyaId?: string }) | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function submit() {
      setIsSubmitting(true);
      setSubmitError(null);

      const res = await submitRegistration({
        language,
        clinicId,
        patient: { ...registration },
        screening: { flags: screeningFlags },
        consent,
      });

      if (cancelled) return;
      if (!res.ok) {
        setSubmitError(res.error);
        setIsSubmitting(false);
        return;
      }
      setResult({ level: res.data.triage, message: res.data.message, arogyaId: res.data.arogyaId });
      setIsSubmitting(false);
    }

    submit();
    return () => { cancelled = true; };
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
        <h2 className="text-[22px] font-bold text-[#0A5C43] mb-3">Submitting...</h2>
        <p className="text-[15px] text-[#4F675C] text-center">Please wait while we process your registration.</p>
      </div>
    );
  }

  if (submitError) {
    return (
      <div className="h-full bg-[#F6F9F7] flex flex-col items-center justify-center p-6">
        <div className="w-20 h-20 rounded-full bg-[#FFF2F2] flex items-center justify-center mb-6">
          <AlertCircle size={36} className="text-[#D32F2F]" strokeWidth={2.5} />
        </div>
        <h2 className="text-[22px] font-bold text-[#B71C1C] mb-3">Unable to Submit</h2>
        <p className="text-[15px] text-[#4F675C] text-center mb-2">{submitError}</p>
        <p className="text-[14px] text-[#4F675C] text-center mb-8">Please ask staff for assistance.</p>
        <button onClick={onReset}
          className="w-full max-w-[300px] py-[16px] bg-white border-[1.5px] border-[#0A5C43] text-[#0A5C43] hover:bg-[#EAF5F0] rounded-[12px] font-bold text-[15px] transition-all flex items-center justify-center gap-2">
          <RotateCcw size={18} strokeWidth={2.5} />
          {t.startOver}
        </button>
      </div>
    );
  }

  return (
    <div className="h-full bg-[#F6F9F7] flex flex-col relative overflow-y-auto hidden-scrollbar">
      <div className="bg-[#F6F9F7] pt-5 pb-4 px-4 flex items-center sticky top-0 z-10 border-b border-gray-200">
        <h1 className="text-[19px] font-bold text-[#0A5C43] tracking-tight mx-auto">Registration Complete</h1>
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
              {isHighRisk ? "Attention Required" : "All Set"}
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

- [ ] **Step 2: Commit**

```bash
git add src/components/TriageSummaryScreen.tsx
git commit -m "feat: summary submits rich payload and shows Arogya ID"
```

---

### Task 16: ScannerScreen fallback

**Files:**
- Modify: `frontend/src/components/ScannerScreen.tsx`

The scanner is now reached only when there is no `?clinic` param. Change `onScanSuccess` to also pass the validated clinic name, and pass it on the camera-scan path after validating.

- [ ] **Step 1: Update the Props and handlers**

Change the `Props` interface:
```tsx
interface Props {
  language: Language;
  onScanSuccess: (clinicId: string, clinicName?: string) => void;
}
```

Replace `handleSubmit` so the manual-entry path forwards the clinic name:
```tsx
  const handleSubmit = async () => {
    const idToValidate = manualId.trim();
    if (!idToValidate) return;

    setValidationError('');
    setIsValidating(true);

    const result = await validateClinic(idToValidate);
    setIsValidating(false);

    if (!result.ok) {
      setValidationError(result.error);
      return;
    }
    if (result.data.valid) {
      onScanSuccess(idToValidate, result.data.clinicName);
    } else {
      setValidationError('Invalid clinic ID. Please check and try again.');
    }
  };
```

For the camera path, validate before continuing. Replace the `<Scanner onScan={...}>` handler:
```tsx
                    <Scanner
                      onScan={async (codes) => {
                        if (!codes || codes.length === 0) return;
                        const scanned = codes[0].rawValue;
                        const result = await validateClinic(scanned);
                        if (result.ok && result.data.valid) {
                          onScanSuccess(scanned, result.data.clinicName);
                        } else {
                          setValidationError('Invalid clinic QR. Please try manual entry.');
                        }
                      }}
                      onError={() => setCameraError(true)}
                    />
```

- [ ] **Step 2: Commit**

```bash
git add src/components/ScannerScreen.tsx
git commit -m "feat: scanner fallback forwards clinic name"
```

---

### Task 17: App flow rewiring

**Files:**
- Modify: `frontend/src/App.tsx` (full replacement)

- [ ] **Step 1: Replace the component**

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { AppState, RegistrationData } from "./types";
import { Language } from "./translations";
import { validateClinic } from "./services/api";
import { LanguageSelectScreen } from "./components/LanguageSelectScreen";
import { ScannerScreen } from "./components/ScannerScreen";
import { RegistrationScreen } from "./components/RegistrationScreen";
import { QuestionnaireScreen } from "./components/QuestionnaireScreen";
import { TriageSummaryScreen } from "./components/TriageSummaryScreen";
import { AnimatePresence, motion } from "motion/react";

function initialState(clinicId: string | null = null): AppState {
  return {
    screen: "language",
    language: "en",
    clinicId,
    clinicName: null,
    registration: null,
    screeningFlags: [],
    consent: false,
    triageResult: null,
    isLoading: false,
    error: null,
  };
}

export default function App() {
  const [state, setState] = useState<AppState>(initialState());

  // Read ?clinic from the URL (QR opens the app with the clinic embedded).
  useEffect(() => {
    const clinic = new URLSearchParams(window.location.search).get("clinic");
    if (clinic) setState((s) => ({ ...s, clinicId: clinic }));
  }, []);

  // Resolve the clinic name when entering registration with a clinic but no name yet.
  useEffect(() => {
    let cancelled = false;
    if (state.screen === "registration" && state.clinicId && state.clinicName === null) {
      validateClinic(state.clinicId).then((res) => {
        if (!cancelled && res.ok && res.data.valid && res.data.clinicName) {
          setState((s) => ({ ...s, clinicName: res.data.clinicName! }));
        }
      });
    }
    return () => { cancelled = true; };
  }, [state.screen, state.clinicId, state.clinicName]);

  const handleLanguageSelect = (language: Language) => {
    setState((s) => ({ ...s, language, screen: s.clinicId ? "registration" : "scanner" }));
  };

  const handleScanSuccess = (clinicId: string, clinicName?: string) => {
    setState((s) => ({ ...s, clinicId, clinicName: clinicName ?? null, screen: "registration" }));
  };

  const handleRegistrationComplete = (registration: RegistrationData) => {
    setState((s) => ({ ...s, registration, screen: "questionnaire" }));
  };

  const handleQuestionnaireComplete = (flags: boolean[], consent: boolean) => {
    setState((s) => ({ ...s, screeningFlags: flags, consent, screen: "triage" }));
  };

  const handleReset = () => {
    setState((s) => ({ ...initialState(s.clinicId), clinicName: s.clinicName }));
  };

  return (
    <div className="min-h-screen bg-[#F6F9F7] font-sans flex justify-center selection:bg-[#D6F2E5]">
      <div className="w-full max-w-[420px] h-[100dvh] relative shadow-[0_0_20px_rgba(0,60,30,0.03)] border-x border-gray-100 bg-[#F6F9F7] overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {state.screen === "language" && (
            <motion.div key="language" exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.2 }} className="absolute inset-0">
              <LanguageSelectScreen onSelectLanguage={handleLanguageSelect} />
            </motion.div>
          )}

          {state.screen === "scanner" && (
            <motion.div key="scanner" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="absolute inset-0">
              <ScannerScreen language={state.language} onScanSuccess={handleScanSuccess} />
            </motion.div>
          )}

          {state.screen === "registration" && (
            <motion.div key="registration" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="absolute inset-0">
              <RegistrationScreen
                language={state.language}
                clinicId={state.clinicId ?? ""}
                clinicName={state.clinicName}
                initial={state.registration}
                onBack={() => setState((s) => ({ ...s, screen: "language" }))}
                onComplete={handleRegistrationComplete}
              />
            </motion.div>
          )}

          {state.screen === "questionnaire" && (
            <motion.div key="questionnaire" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.25 }} className="absolute inset-0">
              <QuestionnaireScreen
                language={state.language}
                onBack={() => setState((s) => ({ ...s, screen: "registration" }))}
                onComplete={handleQuestionnaireComplete}
              />
            </motion.div>
          )}

          {state.screen === "triage" && state.registration && (
            <motion.div key="triage" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.25 }} className="absolute inset-0">
              <TriageSummaryScreen
                language={state.language}
                clinicId={state.clinicId ?? ""}
                registration={state.registration}
                screeningFlags={state.screeningFlags}
                consent={state.consent}
                onReset={handleReset}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/App.tsx
git commit -m "feat: rewire flow to language -> registration -> questionnaire -> triage"
```

---

### Task 18: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: PASS — age, validation, screening, and translations suites all green.

- [ ] **Step 2: Type-check the whole project**

Run: `npm run lint`
Expected: PASS — no TypeScript errors. If errors mention removed `fetchQuestions`/`QuestionsResponse`, ensure no file still imports them (only `services/api.ts` and `types.ts` referenced them).

- [ ] **Step 3: Production build**

Run: `npm run build`
Expected: Vite build completes, `dist/` is produced with no errors.

- [ ] **Step 4: Final commit (if any lint fixes were needed)**

```bash
git add -A
git commit -m "chore: registration workflow lint/build verification"
```

(If Steps 1–3 passed with no changes, skip this commit.)

---

## Self-Review Notes

- **Spec coverage:** QR-via-URL + scanner fallback (Tasks 16–17); clinic name resolution (Task 17); Registration screen with all fields, required rules, derived age, searchable GN (Tasks 8–13); checklist questionnaire with mutually-exclusive None + mandatory consent (Tasks 5, 14); updated `/api/registration` contract + Arogya ID display (Tasks 2, 7, 15); retire `/api/questions` (Task 7); trilingual strings with authoritative content (Task 6); Vitest unit tests for pure helpers (Tasks 1, 3–6); privacy (no persistence — state only, Task 17).
- **Type consistency:** `RegistrationData`, `ScreeningState`, option-key unions, and `RegistrationRequest.patient` shape are defined once (Task 2 / Task 5) and reused verbatim by consumers.
- **No placeholders:** every code step contains complete, runnable content.
```
