import { test } from "node:test";
import assert from "node:assert/strict";
import { triageMessage } from "../src/lib/messages.js";

test("returns a non-empty string for each triage/language", () => {
  for (const triage of ["high-risk", "normal"]) {
    for (const lang of ["en", "si", "ta"]) {
      assert.ok(triageMessage(triage, lang).length > 0);
    }
  }
});

test("falls back to English for an unknown language", () => {
  assert.equal(triageMessage("normal", "xx"), triageMessage("normal", "en"));
});
