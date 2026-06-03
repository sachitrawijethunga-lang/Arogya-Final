import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { freshDb } from "./helpers.js";

function validBody(overrides = {}) {
  return {
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

test("happy path returns arogyaId, normal triage, message, and persists a row", async () => {
  const db = freshDb();
  const app = createApp(db);
  const res = await request(app).post("/registration").send(validBody());
  assert.equal(res.status, 200);
  assert.equal(res.body.arogyaId, "AC-005-000001");
  assert.equal(res.body.triage, "normal");
  assert.ok(res.body.message.length > 0);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM registrations").get().c, 1);
});

test("arogya id increments on a second submission to the same clinic", async () => {
  const app = createApp(freshDb());
  await request(app).post("/registration").send(validBody());
  const res = await request(app).post("/registration").send(validBody());
  assert.equal(res.body.arogyaId, "AC-005-000002");
});

test("a high-risk flag (item 1) yields high-risk triage", async () => {
  const app = createApp(freshDb());
  const flags = Array(11).fill(false);
  flags[0] = true;
  const res = await request(app).post("/registration").send(validBody({ screening: { flags } }));
  assert.equal(res.body.triage, "high-risk");
});

test("only chronic/lifestyle flags (items 6-11) yield normal triage", async () => {
  const app = createApp(freshDb());
  const flags = Array(11).fill(false);
  flags[5] = true;
  flags[8] = true;
  const res = await request(app).post("/registration").send(validBody({ screening: { flags } }));
  assert.equal(res.body.triage, "normal");
});

test("consent false is rejected with 400", async () => {
  const app = createApp(freshDb());
  const res = await request(app).post("/registration").send(validBody({ consent: false }));
  assert.equal(res.status, 400);
});

test("unknown clinic is rejected with 400", async () => {
  const app = createApp(freshDb());
  const res = await request(app).post("/registration").send(validBody({ clinicId: "ZZ-999" }));
  assert.equal(res.status, 400);
});
