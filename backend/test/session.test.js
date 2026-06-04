import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import { createPhnoUser } from "../src/lib/phnoUsers.js";
import {
  COOKIE_NAME,
  createSession,
  getSessionUser,
  deleteSession,
  parseCookie,
} from "../src/lib/session.js";

function makeUser(db) {
  return createPhnoUser(db, {
    username: "u",
    password: "p",
    clinicId: "AC-005",
    fullName: "U",
  });
}

test("createSession then getSessionUser returns the joined user", () => {
  const db = freshDb();
  const user = makeUser(db);
  const token = createSession(db, user.id);
  assert.match(token, /^[0-9a-f]{64}$/);
  const sessUser = getSessionUser(db, token);
  assert.equal(sessUser.id, user.id);
  assert.equal(sessUser.clinic_id, "AC-005");
});

test("getSessionUser returns null for unknown/garbage token", () => {
  const db = freshDb();
  assert.equal(getSessionUser(db, "nope"), null);
  assert.equal(getSessionUser(db, ""), null);
});

test("expired session is rejected and deleted", () => {
  const db = freshDb();
  const user = makeUser(db);
  const token = createSession(db, user.id, -1000); // already expired
  assert.equal(getSessionUser(db, token), null);
  assert.equal(db.prepare("SELECT COUNT(*) AS c FROM phno_sessions").get().c, 0);
});

test("deleteSession removes the row", () => {
  const db = freshDb();
  const user = makeUser(db);
  const token = createSession(db, user.id);
  deleteSession(db, token);
  assert.equal(getSessionUser(db, token), null);
});

test("disabled user's session does not authorize", () => {
  const db = freshDb();
  const user = makeUser(db);
  const token = createSession(db, user.id);
  db.prepare("UPDATE phno_users SET disabled = 1 WHERE id = ?").run(user.id);
  assert.equal(getSessionUser(db, token), null);
});

test("parseCookie extracts a named cookie from a header", () => {
  assert.equal(parseCookie("a=1; arogya_session=abc; b=2", COOKIE_NAME), "abc");
  assert.equal(parseCookie("", COOKIE_NAME), null);
  assert.equal(parseCookie(undefined, COOKIE_NAME), null);
  assert.equal(parseCookie("other=1", COOKIE_NAME), null);
});
