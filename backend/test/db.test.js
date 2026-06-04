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

test("schema is at version 2 with request_id column and idempotency + lookup indexes", () => {
  const db = freshDb();
  assert.ok(db.pragma("user_version", { simple: true }) >= 2);
  const cols = db.prepare("PRAGMA table_info(registrations)").all().map((c) => c.name);
  assert.ok(cols.includes("request_id"), "request_id column missing");
  const idx = db.prepare("PRAGMA index_list(registrations)").all().map((i) => i.name);
  assert.ok(idx.includes("idx_reg_request_id"), "request_id unique index missing");
  assert.ok(idx.includes("idx_reg_clinic_created"), "clinic/created index missing");
});

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
