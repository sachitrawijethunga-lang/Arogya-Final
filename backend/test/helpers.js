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
