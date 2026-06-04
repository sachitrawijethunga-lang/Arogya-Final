import { describe, it, expect } from "vitest";
import { text } from "./translations";
import { SCREENING_ITEM_COUNT } from "./lib/screening";
import {
  RELATIONSHIP_KEYS,
  MARITAL_KEYS,
  OCCUPATION_KEYS,
  EDUCATION_KEYS,
} from "./data/options";

const langs = ["en", "si", "ta"] as const;

describe("translations", () => {
  it("has 11 screening items in every language", () => {
    for (const l of langs) {
      expect(text[l].screening.items).toHaveLength(SCREENING_ITEM_COUNT);
    }
  });

  it("has a label for every option key in every language", () => {
    for (const l of langs) {
      const o = text[l].options;
      for (const k of RELATIONSHIP_KEYS) expect(o.relationship[k]).toBeTruthy();
      for (const k of MARITAL_KEYS) expect(o.marital[k]).toBeTruthy();
      for (const k of OCCUPATION_KEYS) expect(o.occupation[k]).toBeTruthy();
      for (const k of EDUCATION_KEYS) expect(o.education[k]).toBeTruthy();
    }
  });

  it("has core registration labels in every language", () => {
    for (const l of langs) {
      expect(text[l].reg.title).toBeTruthy();
      expect(text[l].reg.fullName).toBeTruthy();
      expect(text[l].screening.consent).toBeTruthy();
    }
  });

  it("has non-empty English staff strings throughout", () => {
    const assertAllNonEmpty = (node: unknown, path: string) => {
      if (typeof node === "string") {
        expect(node, `empty staff string at ${path}`).not.toBe("");
        return;
      }
      expect(node, `missing staff node at ${path}`).toBeTruthy();
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        assertAllNonEmpty(v, `${path}.${k}`);
      }
    };
    assertAllNonEmpty(text.en.staff, "en.staff");
  });
});
