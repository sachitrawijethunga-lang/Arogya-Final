import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { freshDb, seedPhno, insertRegistration, loginAgent } from "./helpers.js";
import { createApp } from "../src/app.js";

function patient(over = {}) {
  return { fullName: "Nimal Perera", nic: "199012345678", phn: "", gender: "male",
    dateOfBirth: "1990-01-01", householdAddress: "", relationshipToHead: null, gnDivision: null,
    mobile: "0771234567", maritalStatus: null, occupation: null, education: null, ...over };
}

test("edit updates patient fields and writes an audit entry", async () => {
  const db = freshDb();
  seedPhno(db);
  const id = insertRegistration(db);
  const app = createApp(db);
  const agent = await loginAgent(request, app);

  const res = await agent.patch(`/staff/registrations/${id}`).send({ patient: patient({ fullName: "Nimal Corrected" }) });
  assert.equal(res.status, 200);
  assert.equal(res.body.patient.fullName, "Nimal Corrected");

  const detail = await agent.get(`/staff/registrations/${id}`);
  const edit = detail.body.audit.find((a) => a.action === "edit");
  assert.ok(edit, "edit audit row present");
  assert.equal(edit.changes.fullName.from, "Nimal Perera");
  assert.equal(edit.changes.fullName.to, "Nimal Corrected");
});

test("edit rejects invalid patient data (400) and is blocked on non-pending (409)", async () => {
  const db = freshDb();
  seedPhno(db);
  const id = insertRegistration(db);
  const app = createApp(db);
  const agent = await loginAgent(request, app);

  const bad = await agent.patch(`/staff/registrations/${id}`).send({ patient: patient({ fullName: "" }) });
  assert.equal(bad.status, 400);

  await agent.post(`/staff/registrations/${id}/approve`).send({});
  const afterApprove = await agent.patch(`/staff/registrations/${id}`).send({ patient: patient({ fullName: "Late" }) });
  assert.equal(afterApprove.status, 409);
});

test("approve transitions pending→approved, sets reviewer, is idempotent", async () => {
  const db = freshDb();
  const user = seedPhno(db);
  const id = insertRegistration(db);
  const app = createApp(db);
  const agent = await loginAgent(request, app);

  const res = await agent.post(`/staff/registrations/${id}/approve`).send({});
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "approved");

  const row = db.prepare("SELECT reviewed_by, status FROM registrations WHERE id = ?").get(id);
  assert.equal(row.status, "approved");
  assert.equal(row.reviewed_by, user.id);

  const again = await agent.post(`/staff/registrations/${id}/approve`).send({});
  assert.equal(again.status, 200); // idempotent no-op
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM registration_audit WHERE action='approve'").get().c, 1);
});

test("reject requires a reason and transitions pending→rejected", async () => {
  const db = freshDb();
  seedPhno(db);
  const id = insertRegistration(db);
  const app = createApp(db);
  const agent = await loginAgent(request, app);

  const noReason = await agent.post(`/staff/registrations/${id}/reject`).send({});
  assert.equal(noReason.status, 400);

  const res = await agent.post(`/staff/registrations/${id}/reject`).send({ reason: "duplicate entry" });
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "rejected");
  assert.equal(res.body.rejectReason, "duplicate entry");
});

test("approving an already-rejected record is a conflict (409)", async () => {
  const db = freshDb();
  seedPhno(db);
  const id = insertRegistration(db);
  const app = createApp(db);
  const agent = await loginAgent(request, app);
  await agent.post(`/staff/registrations/${id}/reject`).send({ reason: "junk" });
  const res = await agent.post(`/staff/registrations/${id}/approve`).send({});
  assert.equal(res.status, 409);
});

test("cannot edit/approve another clinic's record (403)", async () => {
  const db = freshDb();
  seedPhno(db); // AC-005
  const otherId = insertRegistration(db, { arogyaId: "AC-006-000001", clinicId: "AC-006" });
  const app = createApp(db);
  const agent = await loginAgent(request, app);
  assert.equal((await agent.post(`/staff/registrations/${otherId}/approve`).send({})).status, 403);
  assert.equal((await agent.patch(`/staff/registrations/${otherId}`).send({ patient: patient() })).status, 403);
});
