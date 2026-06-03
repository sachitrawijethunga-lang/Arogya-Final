import { test } from "node:test";
import assert from "node:assert/strict";
import { computeTriage } from "../src/lib/triage.js";

function flags(...indices) {
  const a = Array(11).fill(false);
  for (const i of indices) a[i] = true;
  return a;
}

test("high-risk when any of flags 1-5 (index 0-4) is set", () => {
  assert.equal(computeTriage(flags(0)), "high-risk");
  assert.equal(computeTriage(flags(4)), "high-risk");
  assert.equal(computeTriage(flags(2, 7)), "high-risk");
});

test("normal when only flags 6-11 (index 5-10) are set", () => {
  assert.equal(computeTriage(flags(5)), "normal");
  assert.equal(computeTriage(flags(5, 6, 7, 8, 9, 10)), "normal");
});

test("normal when none are set", () => {
  assert.equal(computeTriage(flags()), "normal");
});
