import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../src/app.js";
import { freshDb } from "./helpers.js";

test("POST /clinics/validate returns clinic name for a known id", async () => {
  const app = createApp(freshDb());
  const res = await request(app).post("/clinics/validate").send({ clinicId: "AC-005" });
  assert.equal(res.status, 200);
  assert.equal(res.body.valid, true);
  assert.equal(res.body.clinicName, "Kirinda");
});

test("POST /clinics/validate returns valid:false for an unknown id", async () => {
  const app = createApp(freshDb());
  const res = await request(app).post("/clinics/validate").send({ clinicId: "ZZ-999" });
  assert.equal(res.status, 200);
  assert.equal(res.body.valid, false);
});

test("POST /clinics/validate returns 400 for a blank id", async () => {
  const app = createApp(freshDb());
  const res = await request(app).post("/clinics/validate").send({ clinicId: "" });
  assert.equal(res.status, 400);
});
