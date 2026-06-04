# Staff translation scaffold (English-only active)

**Date:** 2026-06-04
**Status:** Approved

## Problem

The patient-facing kiosk flow is fully trilingual (English / Sinhala / Tamil),
driven by `text[language]` in `frontend/src/translations.ts`. The staff /
operator portal (`frontend/src/staff/*`) is 100% hardcoded English with no
translation wiring.

We are **not** translating the staff portal now. We only lay the groundwork so a
translator can fill Sinhala/Tamil later and a future change can wire the
components. Scope was deliberately narrowed by the user:

- Staff language switching stays **disabled**.
- Sinhala/Tamil staff values stay **empty**.
- Staff screen components are **not** rewired — they keep their inline English
  literals.

## Scope

**Single file changed:** `frontend/src/translations.ts` (plus one test in
`frontend/src/translations.test.ts`).

Add a `staff` namespace under each of the three existing language objects
(`en`, `si`, `ta`).

- `text.en.staff` — fully populated with English, cataloging every staff-portal
  string in one place.
- `text.si.staff` and `text.ta.staff` — the **same key structure mirrored**, but
  every leaf value is the empty string `""`. This is a ready-to-fill template.

No `StaffLangProvider`, no language switcher, no component edits, no si/ta
content. The staff portal renders exactly as it does today.

## English values

```
app:    loading            "Loading…"
login:  title              "Arogya — PHNO Portal"
        subtitle           "Sign in to review patient registrations."
        username           "Username"
        password           "Password"
        signIn             "Sign in"
        signingIn          "Signing in…"
        errInvalid         "Invalid username or password."
        errThrottled       "Too many attempts. Try again later."
queue:  tabs.pending       "Pending"
        tabs.approved      "Approved"
        tabs.rejected      "Rejected"
        tabs.all           "All"
        logOut             "Log out"
        searchPlaceholder  "Search name, NIC, or Arogya ID"
        loading            "Loading…"
        noRecords          "No records."
        noName             "(no name)"
        noNic              "no NIC"
        highRisk           "HIGH RISK"
detail: backToQueue        "← Back to queue"
        patientDetails     "Patient details"
        screening          "Screening"
        flaggedSymptoms    "Flagged symptoms:"
        triage             "Triage:"
        history            "History"
        by                 "by"
        approve            "Approve"
        edit               "Edit"
        reject             "Reject"
        rejectPrompt       "Reason for rejection?"
        rejectedPrefix     "Rejected:"
        back               "Back"
        loading            "Loading…"
        fields.fullName       "Full name"
        fields.nic            "NIC"
        fields.phn            "PHN"
        fields.gender         "Gender"
        fields.dateOfBirth    "Date of birth"
        fields.mobile         "Mobile"
        fields.address        "Address"
        fields.maritalStatus  "Marital status"
        fields.occupation     "Occupation"
        fields.education      "Education"
edit:   cancel             "Cancel"
        title              "Edit patient"
        gender             "Gender"
        male               "Male"
        female             "Female"
        save               "Save changes"
        saving             "Saving…"
        fields.fullName       "Full name"
        fields.nic            "NIC"
        fields.phn            "PHN"
        fields.dateOfBirth    "Date of birth (yyyy-mm-dd)"
        fields.mobile         "Mobile"
        fields.address        "Address"
status: pending            "Pending"
        approved           "Approved"
        rejected           "Rejected"
triage: highRisk           "HIGH RISK"
        lowRisk            "Low risk"
```

`text.si.staff` / `text.ta.staff` mirror this structure exactly with `""` for
every leaf.

## Testing

In `frontend/src/translations.test.ts`, add one test that asserts the English
staff strings exist and are non-empty (walk `text.en.staff` recursively; every
leaf must be a non-empty string). No assertions on the si/ta staff blocks.

## Out of scope

- Translating staff strings into Sinhala/Tamil.
- Wiring staff components to read from the dict.
- A staff language switcher / provider / device detection.
- The stray kiosk `welcomeTitle` literal in `LanguageSelectScreen` — left as-is
  to keep this change purely additive.
- Translating stored patient data values shown in the Detail screen.
- Any backend change (this is frontend-only).
