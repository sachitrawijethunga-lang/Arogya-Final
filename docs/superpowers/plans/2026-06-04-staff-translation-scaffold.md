# Staff Translation Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `staff` translation namespace to `frontend/src/translations.ts` — English fully populated, Sinhala/Tamil mirrored with empty strings — so the staff portal can be translated later without touching the components now.

**Architecture:** Purely additive change to the existing `text` dictionary (keyed by `en`/`si`/`ta`). No component is rewired, no language switcher is added; the staff portal renders exactly as today. A single new test asserts the English staff strings are present and non-empty.

**Tech Stack:** TypeScript, React, Vite, Vitest.

---

### Task 1: Add `staff` namespace + English-only test

**Files:**
- Modify: `frontend/src/translations.ts` (add a `staff` block inside each of the `en`, `si`, `ta` objects)
- Test: `frontend/src/translations.test.ts` (add one test)

**Context the engineer needs:**
- `text` is a plain object: `{ en: {...}, si: {...}, ta: {...} }`. Each language object currently ends with a `screening` block. Add the new `staff` block as the **last** key inside each language object (after `screening`).
- `Language` type (`'en' | 'si' | 'ta'`) is already exported; no type change needed. The object is untyped/inferred, so adding `staff` to all three keeps them shape-compatible.
- Tests run from the `frontend/` directory with `npm test` (Vitest).

- [ ] **Step 1: Write the failing test**

In `frontend/src/translations.test.ts`, add this test inside the existing `describe("translations", ...)` block (after the last `it(...)`):

```ts
  it("has non-empty English staff strings throughout", () => {
    const assertAllNonEmpty = (node: unknown, path: string) => {
      if (typeof node === "string") {
        expect(node, `empty staff string at ${path}`).not.toBe("");
        return;
      }
      expect(node, `missing staff node at ${path}`).toBeTruthy();
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        assertAllNonEmpty(v, `${path}.${k}`);
      }
    };
    assertAllNonEmpty(text.en.staff, "en.staff");
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- translations`
Expected: FAIL — `text.en.staff` is `undefined` (the `assertAllNonEmpty` call throws / `toBeTruthy` fails on `en.staff`).

- [ ] **Step 3: Add the English `staff` block**

In `frontend/src/translations.ts`, inside the `en: { ... }` object, after the closing of the `screening` block (before the `},` that ends the `en` object), add:

```ts
    staff: {
      app: { loading: "Loading…" },
      login: {
        title: "Arogya — PHNO Portal",
        subtitle: "Sign in to review patient registrations.",
        username: "Username",
        password: "Password",
        signIn: "Sign in",
        signingIn: "Signing in…",
        errInvalid: "Invalid username or password.",
        errThrottled: "Too many attempts. Try again later.",
      },
      queue: {
        tabs: { pending: "Pending", approved: "Approved", rejected: "Rejected", all: "All" },
        logOut: "Log out",
        searchPlaceholder: "Search name, NIC, or Arogya ID",
        loading: "Loading…",
        noRecords: "No records.",
        noName: "(no name)",
        noNic: "no NIC",
        highRisk: "HIGH RISK",
      },
      detail: {
        backToQueue: "← Back to queue",
        patientDetails: "Patient details",
        screening: "Screening",
        flaggedSymptoms: "Flagged symptoms:",
        triage: "Triage:",
        history: "History",
        by: "by",
        approve: "Approve",
        edit: "Edit",
        reject: "Reject",
        rejectPrompt: "Reason for rejection?",
        rejectedPrefix: "Rejected:",
        back: "Back",
        loading: "Loading…",
        fields: {
          fullName: "Full name",
          nic: "NIC",
          phn: "PHN",
          gender: "Gender",
          dateOfBirth: "Date of birth",
          mobile: "Mobile",
          address: "Address",
          maritalStatus: "Marital status",
          occupation: "Occupation",
          education: "Education",
        },
      },
      edit: {
        cancel: "Cancel",
        title: "Edit patient",
        gender: "Gender",
        male: "Male",
        female: "Female",
        save: "Save changes",
        saving: "Saving…",
        fields: {
          fullName: "Full name",
          nic: "NIC",
          phn: "PHN",
          dateOfBirth: "Date of birth (yyyy-mm-dd)",
          mobile: "Mobile",
          address: "Address",
        },
      },
      status: { pending: "Pending", approved: "Approved", rejected: "Rejected" },
      triage: { highRisk: "HIGH RISK", lowRisk: "Low risk" },
    },
```

- [ ] **Step 4: Add the empty `si` and `ta` `staff` mirrors**

In the same file, inside the `si: { ... }` object (after its `screening` block) add the identical structure with every leaf set to `""`:

```ts
    staff: {
      app: { loading: "" },
      login: {
        title: "", subtitle: "", username: "", password: "",
        signIn: "", signingIn: "", errInvalid: "", errThrottled: "",
      },
      queue: {
        tabs: { pending: "", approved: "", rejected: "", all: "" },
        logOut: "", searchPlaceholder: "", loading: "", noRecords: "",
        noName: "", noNic: "", highRisk: "",
      },
      detail: {
        backToQueue: "", patientDetails: "", screening: "", flaggedSymptoms: "",
        triage: "", history: "", by: "", approve: "", edit: "", reject: "",
        rejectPrompt: "", rejectedPrefix: "", back: "", loading: "",
        fields: {
          fullName: "", nic: "", phn: "", gender: "", dateOfBirth: "",
          mobile: "", address: "", maritalStatus: "", occupation: "", education: "",
        },
      },
      edit: {
        cancel: "", title: "", gender: "", male: "", female: "",
        save: "", saving: "",
        fields: {
          fullName: "", nic: "", phn: "", dateOfBirth: "", mobile: "", address: "",
        },
      },
      status: { pending: "", approved: "", rejected: "" },
      triage: { highRisk: "", lowRisk: "" },
    },
```

Then paste the **same empty block** into the `ta: { ... }` object after its `screening` block.

- [ ] **Step 5: Run the staff test and the full suite to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS — the new staff test passes, and all existing translation/option/screening tests still pass (the additive `staff` key does not affect them). Also confirm the TypeScript build is clean: `cd frontend && npx tsc --noEmit` → no errors.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/translations.ts frontend/src/translations.test.ts
git commit -m "feat(i18n): staff translation scaffold (EN active, si/ta empty)"
```
