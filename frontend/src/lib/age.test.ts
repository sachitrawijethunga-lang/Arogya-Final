import { describe, it, expect } from "vitest";
import { ageFromDob } from "./age";

describe("ageFromDob", () => {
  const today = new Date("2026-06-03T00:00:00");

  it("returns null for empty input", () => {
    expect(ageFromDob("", today)).toBeNull();
  });

  it("returns null for a future date", () => {
    expect(ageFromDob("2027-01-01", today)).toBeNull();
  });

  it("returns 0 years 0 months for a birthday today", () => {
    expect(ageFromDob("2026-06-03", today)).toEqual({ years: 0, months: 0 });
  });

  it("computes whole years", () => {
    expect(ageFromDob("2000-06-03", today)).toEqual({ years: 26, months: 0 });
  });

  it("computes years and months", () => {
    expect(ageFromDob("2000-01-03", today)).toEqual({ years: 26, months: 5 });
  });

  it("does not over-count just after a birthday", () => {
    // Born 10 May; on 3 June the May birthday has passed → 26y 0m exactly.
    expect(ageFromDob("2000-05-10", today)).toEqual({ years: 26, months: 0 });
  });

  it("borrows a month and a year when the birthday has not arrived yet", () => {
    // Born 10 June; on 3 June the birthday is 7 days away → 25y 11m.
    expect(ageFromDob("2000-06-10", today)).toEqual({ years: 25, months: 11 });
  });
});
