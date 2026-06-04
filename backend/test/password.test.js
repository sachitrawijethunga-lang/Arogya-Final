import { test } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword } from "../src/lib/password.js";

test("hashPassword returns distinct salt+hash each call", () => {
  const a = hashPassword("correct horse");
  const b = hashPassword("correct horse");
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.hash, b.hash);
  assert.match(a.hash, /^[0-9a-f]+$/);
  assert.match(a.salt, /^[0-9a-f]+$/);
});

test("verifyPassword accepts the right password and rejects wrong ones", () => {
  const { hash, salt } = hashPassword("s3cret!");
  assert.equal(verifyPassword("s3cret!", hash, salt), true);
  assert.equal(verifyPassword("s3cret", hash, salt), false);
  assert.equal(verifyPassword("", hash, salt), false);
});

test("verifyPassword is safe against malformed stored values", () => {
  assert.equal(verifyPassword("x", "", ""), false);
  assert.equal(verifyPassword("x", "zz", "salt"), false);
});
