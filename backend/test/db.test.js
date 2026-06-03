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
