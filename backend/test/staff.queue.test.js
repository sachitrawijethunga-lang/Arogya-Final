import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { freshDb, seedPhno, insertRegistration, loginAgent } from "./helpers.js";
import { createApp } from "../src/app.js";

test("queue returns only the PHNO's clinic, newest first, filtered by status", async () => {
  const db = freshDb();
  seedPhno(db); // AC-005
  insertRegistration(db, { arogyaId: "AC-005-000001", createdAt: "2026-01-01T00:00:00Z" });
  insertRegistration(db, { arogyaId: "AC-005-000002", createdAt: "2026-01-02T00:00:00Z" });
  insertRegistration(db, { arogyaId: "AC-006-000001", clinicId: "AC-006" }); // other clinic
  const app = createApp(db);
  const agent = await loginAgent(request, app);

  const res = await agent.get("/staff/registrations");
  assert.equal(res.status, 200);
  assert.equal(res.body.length, 2); // only AC-005
  assert.equal(res.body[0].arogyaId, "AC-005-000002"); // newest first
  assert.ok("fullName" in res.body[0] && "triage" in res.body[0] && "status" in res.body[0]);
});

test("queue status filter and search", async () => {
  const db = freshDb();
  seedPhno(db);
  insertRegistration(db, { arogyaId: "AC-005-000001", status: "pending",
    patient: { fullName: "Alice Silva", nic: "111", phn: "", gender: "female",
      dateOfBirth: "1990-01-01", householdAddress: "", relationshipToHead: null, gnDivision: null,
      mobile: "07", maritalStatus: null, occupation: null, education: null } });
  insertRegistration(db, { arogyaId: "AC-005-000002", status: "approved" });
  const app = createApp(db);
  const agent = await loginAgent(request, app);

  const pending = await agent.get("/staff/registrations?status=pending");
  assert.equal(pending.body.length, 1);
  assert.equal(pending.body[0].status, "pending");

  const search = await agent.get("/staff/registrations?q=Alice");
  assert.equal(search.body.length, 1);
  assert.equal(search.body[0].fullName, "Alice Silva");
});

test("detail returns full record for own clinic, 403 for another clinic, 404 for missing", async () => {
  const db = freshDb();
  seedPhno(db); // AC-005
  const ownId = insertRegistration(db, { arogyaId: "AC-005-000001" });
  const otherId = insertRegistration(db, { arogyaId: "AC-006-000001", clinicId: "AC-006" });
  const app = createApp(db);
  const agent = await loginAgent(request, app);

  const own = await agent.get(`/staff/registrations/${ownId}`);
  assert.equal(own.status, 200);
  assert.equal(own.body.patient.fullName, "Nimal Perera");
  assert.deepEqual(own.body.screeningFlags.length, 11);
  assert.ok(Array.isArray(own.body.audit));

  const other = await agent.get(`/staff/registrations/${otherId}`);
  assert.equal(other.status, 403);

  const missing = await agent.get(`/staff/registrations/999999`);
  assert.equal(missing.status, 404);
});

test("queue requires auth", async () => {
  const db = freshDb();
  const app = createApp(db);
  const res = await request(app).get("/staff/registrations");
  assert.equal(res.status, 401);
});
