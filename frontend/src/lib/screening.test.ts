import { describe, it, expect } from "vitest";
import {
  SCREENING_ITEM_COUNT,
  emptyScreeningState,
  toggleSymptom,
  toggleNone,
  isScreeningComplete,
} from "./screening";

describe("screening state", () => {
  it("starts empty with 11 unchecked items and none=false", () => {
    const s = emptyScreeningState();
    expect(s.flags).toHaveLength(SCREENING_ITEM_COUNT);
    expect(s.flags.every((f) => f === false)).toBe(true);
    expect(s.none).toBe(false);
  });

  it("toggles a symptom on and clears none", () => {
    const s = toggleSymptom({ flags: emptyScreeningState().flags, none: true }, 2);
    expect(s.flags[2]).toBe(true);
    expect(s.none).toBe(false);
  });

  it("toggles a symptom off again", () => {
    const on = toggleSymptom(emptyScreeningState(), 0);
    const off = toggleSymptom(on, 0);
    expect(off.flags[0]).toBe(false);
    expect(off.none).toBe(false);
  });

  it("selecting none clears all symptoms", () => {
    const withSymptom = toggleSymptom(emptyScreeningState(), 5);
    const noned = toggleNone(withSymptom);
    expect(noned.none).toBe(true);
    expect(noned.flags.every((f) => f === false)).toBe(true);
  });

  it("toggling none off leaves flags empty", () => {
    const noned = toggleNone(emptyScreeningState());
    const unnoned = toggleNone(noned);
    expect(unnoned.none).toBe(false);
  });

  it("is complete only with consent and a choice", () => {
    const empty = emptyScreeningState();
    expect(isScreeningComplete(empty, true)).toBe(false); // no choice
    expect(isScreeningComplete(toggleSymptom(empty, 1), false)).toBe(false); // no consent
    expect(isScreeningComplete(toggleSymptom(empty, 1), true)).toBe(true);
    expect(isScreeningComplete(toggleNone(empty), true)).toBe(true);
  });
});
