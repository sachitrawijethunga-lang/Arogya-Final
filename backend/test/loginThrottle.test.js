import { test } from "node:test";
import assert from "node:assert/strict";
import { createThrottle } from "../src/lib/loginThrottle.js";

test("allows up to max failures, then blocks", () => {
  const t = createThrottle({ max: 3, windowMs: 10000 });
  assert.equal(t.isBlocked("k"), false);
  t.recordFailure("k");
  t.recordFailure("k");
  assert.equal(t.isBlocked("k"), false); // 2 < 3
  t.recordFailure("k");
  assert.equal(t.isBlocked("k"), true); // 3 >= 3
});

test("reset clears a key (used on successful login)", () => {
  const t = createThrottle({ max: 1, windowMs: 10000 });
  t.recordFailure("k");
  assert.equal(t.isBlocked("k"), true);
  t.reset("k");
  assert.equal(t.isBlocked("k"), false);
});

test("the window expires failures", () => {
  let now = 1000;
  const t = createThrottle({ max: 1, windowMs: 500, now: () => now });
  t.recordFailure("k");
  assert.equal(t.isBlocked("k"), true);
  now = 1600; // past the window
  assert.equal(t.isBlocked("k"), false);
});

test("keys are independent", () => {
  const t = createThrottle({ max: 1, windowMs: 10000 });
  t.recordFailure("a");
  assert.equal(t.isBlocked("a"), true);
  assert.equal(t.isBlocked("b"), false);
});
