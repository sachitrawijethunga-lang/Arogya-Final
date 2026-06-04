import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import { createPhnoUser, findPhnoByUsername } from "../src/lib/phnoUsers.js";

test("createPhnoUser inserts a hashed user and findPhnoByUsername returns it", () => {
  const db = freshDb();
  const user = createPhnoUser(db, {
    username: "nimasha",
    password: "s3cret!",
    clinicId: "AC-005",
    fullName: "Nimasha P.",
  });
  assert.ok(user.id > 0);
  const found = findPhnoByUsername(db, "nimasha");
  assert.equal(found.username, "nimasha");
  assert.equal(found.clinic_id, "AC-005");
  assert.notEqual(found.password_hash, "s3cret!"); // stored hashed
});

test("createPhnoUser rejects an unknown clinic", () => {
  const db = freshDb();
  assert.throws(
    () => createPhnoUser(db, { username: "x", password: "y", clinicId: "NOPE", fullName: "X" }),
    /clinic/i
  );
});

test("createPhnoUser rejects a duplicate username", () => {
  const db = freshDb();
  createPhnoUser(db, { username: "dup", password: "a", clinicId: "AC-005", fullName: "A" });
  assert.throws(
    () => createPhnoUser(db, { username: "dup", password: "b", clinicId: "AC-005", fullName: "B" }),
    /exists/i
  );
});

test("findPhnoByUsername returns undefined for unknown user", () => {
  const db = freshDb();
  assert.equal(findPhnoByUsername(db, "ghost"), undefined);
});
