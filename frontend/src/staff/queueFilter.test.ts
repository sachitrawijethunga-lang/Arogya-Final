import { test, expect } from "vitest";
import { filterSummaries } from "./queueFilter";
import type { RegistrationSummary } from "./types";

const base: RegistrationSummary = {
  id: 1, arogyaId: "AC-005-000001", fullName: "Alice Silva", nic: "111",
  triage: "normal", status: "pending", createdAt: "2026-01-01T00:00:00Z", reviewedAt: null,
};

const rows: RegistrationSummary[] = [
  base,
  { ...base, id: 2, arogyaId: "AC-005-000002", fullName: "Bimal Costa", nic: "222", status: "approved" },
];

test("search matches name, NIC, or arogya id (case-insensitive)", () => {
  expect(filterSummaries(rows, "alice").map((r) => r.id)).toEqual([1]);
  expect(filterSummaries(rows, "222").map((r) => r.id)).toEqual([2]);
  expect(filterSummaries(rows, "ac-005-000002").map((r) => r.id)).toEqual([2]);
  expect(filterSummaries(rows, "").map((r) => r.id)).toEqual([1, 2]);
});
