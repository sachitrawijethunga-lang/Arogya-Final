import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRegistration } from "../src/lib/validation.js";

function validBody(overrides = {}) {
  return {
    requestId: "req-1",
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

test("requestId is required", () => {
  const body = validBody();
  delete body.requestId;
  assert.ok(validateRegistration(body, true).some((e) => /request id/i.test(e)));
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
