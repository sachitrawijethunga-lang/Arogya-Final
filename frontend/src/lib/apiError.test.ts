import { test, expect } from "vitest";
import { mapApiError } from "./apiError";
import type { ApiError } from "../types";

const langs = ["en", "si", "ta"] as const;

test("returns a non-empty localized string for every error kind and language", () => {
  const cases: ApiError[] = [
    { ok: false, error: "x", kind: "timeout" },
    { ok: false, error: "x", kind: "network" },
    { ok: false, error: "x", status: 400, kind: "http" },
    { ok: false, error: "x", status: 500, kind: "http" },
  ];
  for (const lang of langs) {
    for (const c of cases) {
      expect(mapApiError(c, lang).length).toBeGreaterThan(0);
    }
  }
});

test("never returns the raw backend error text", () => {
  const raw = "Error: SQLITE_CONSTRAINT at /var/lib/arogya/arogya.db";
  const msg = mapApiError({ ok: false, error: raw, status: 500, kind: "http" }, "en");
  expect(msg).not.toContain(raw);
});
