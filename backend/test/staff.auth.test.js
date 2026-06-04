import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { freshDb, seedPhno } from "./helpers.js";
import { createApp } from "../src/app.js";

test("login with correct credentials sets a session cookie and returns the user", async () => {
  const db = freshDb();
  seedPhno(db);
  const app = createApp(db);
  const res = await request(app).post("/staff/login").send({ username: "phno", password: "pass1234" });
  assert.equal(res.status, 200);
  assert.equal(res.body.clinicId, "AC-005");
  assert.equal(res.body.fullName, "Test PHNO");
  assert.match(String(res.headers["set-cookie"]), /arogya_session=/);
  assert.match(String(res.headers["set-cookie"]), /HttpOnly/i);
});

test("login with wrong password is 401 and sets no cookie", async () => {
  const db = freshDb();
  seedPhno(db);
  const app = createApp(db);
  const res = await request(app).post("/staff/login").send({ username: "phno", password: "WRONG" });
  assert.equal(res.status, 401);
  assert.equal(res.headers["set-cookie"], undefined);
});

test("unknown username is 401 (no user enumeration)", async () => {
  const db = freshDb();
  const app = createApp(db);
  const res = await request(app).post("/staff/login").send({ username: "ghost", password: "x" });
  assert.equal(res.status, 401);
});

test("repeated failures get throttled (429)", async () => {
  const db = freshDb();
  seedPhno(db);
  const app = createApp(db);
  for (let i = 0; i < 5; i++) {
    await request(app).post("/staff/login").send({ username: "phno", password: "WRONG" });
  }
  const res = await request(app).post("/staff/login").send({ username: "phno", password: "WRONG" });
  assert.equal(res.status, 429);
});

test("GET /staff/me requires auth (401 without cookie, 200 with)", async () => {
  const db = freshDb();
  seedPhno(db);
  const app = createApp(db);
  const noauth = await request(app).get("/staff/me");
  assert.equal(noauth.status, 401);

  const agent = request.agent(app);
  await agent.post("/staff/login").send({ username: "phno", password: "pass1234" });
  const me = await agent.get("/staff/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.clinicId, "AC-005");
});

test("logout invalidates the session", async () => {
  const db = freshDb();
  seedPhno(db);
  const app = createApp(db);
  const agent = request.agent(app);
  await agent.post("/staff/login").send({ username: "phno", password: "pass1234" });
  await agent.post("/staff/logout");
  const me = await agent.get("/staff/me");
  assert.equal(me.status, 401);
});
