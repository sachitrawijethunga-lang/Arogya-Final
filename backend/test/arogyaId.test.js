import { test } from "node:test";
import assert from "node:assert/strict";
import { freshDb } from "./helpers.js";
import { nextArogyaId } from "../src/lib/arogyaId.js";

test("formats AC-005-000001 and increments per clinic", () => {
  const db = freshDb();
  assert.equal(nextArogyaId(db, "AC-005"), "AC-005-000001");
  assert.equal(nextArogyaId(db, "AC-005"), "AC-005-000002");
});

test("counters are independent per clinic", () => {
  const db = freshDb();
  assert.equal(nextArogyaId(db, "AC-005"), "AC-005-000001");
  assert.equal(nextArogyaId(db, "AC-001"), "AC-001-000001");
  assert.equal(nextArogyaId(db, "AC-005"), "AC-005-000002");
});
