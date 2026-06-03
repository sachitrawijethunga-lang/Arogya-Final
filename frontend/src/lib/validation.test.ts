import { describe, it, expect } from "vitest";
import {
  isValidNic,
  isValidMobile,
  validateRegistration,
  isRegistrationValid,
} from "./validation";
import type { RegistrationData } from "../types";

function baseData(overrides: Partial<RegistrationData> = {}): RegistrationData {
  return {
    fullName: "Nimal Perera",
    nic: "199012345678",
    phn: "",
    gender: "male",
    dateOfBirth: "1990-01-01",
    householdAddress: "",
    relationshipToHead: null,
    gnDivision: null,
    mobile: "0771234567",
    maritalStatus: null,
    occupation: null,
    education: null,
    ...overrides,
  };
}

describe("isValidNic", () => {
  it("accepts old format (9 digits + V/X)", () => {
    expect(isValidNic("123456789V")).toBe(true);
    expect(isValidNic("123456789x")).toBe(true);
  });
  it("accepts new format (12 digits)", () => {
    expect(isValidNic("199012345678")).toBe(true);
  });
  it("rejects malformed values", () => {
    expect(isValidNic("12345")).toBe(false);
    expect(isValidNic("123456789")).toBe(false);
  });
});

describe("isValidMobile", () => {
  it("accepts local SL mobile formats", () => {
    expect(isValidMobile("0771234567")).toBe(true);
    expect(isValidMobile("94771234567")).toBe(true);
    expect(isValidMobile("+94771234567")).toBe(true);
  });
  it("rejects non-mobile numbers", () => {
    expect(isValidMobile("12345")).toBe(false);
    expect(isValidMobile("0112345678")).toBe(false);
  });
});

describe("validateRegistration", () => {
  it("passes for valid core data", () => {
    expect(validateRegistration(baseData())).toEqual({});
    expect(isRegistrationValid(baseData())).toBe(true);
  });
  it("flags missing required fields", () => {
    const errors = validateRegistration(
      baseData({ fullName: " ", gender: null, dateOfBirth: "", mobile: "" })
    );
    expect(errors.fullName).toBe("errRequired");
    expect(errors.gender).toBe("errRequired");
    expect(errors.dateOfBirth).toBe("errRequired");
    expect(errors.mobile).toBe("errRequired");
  });
  it("requires at least one of NIC or PHN", () => {
    const errors = validateRegistration(baseData({ nic: "", phn: "" }));
    expect(errors.idProof).toBe("errIdRequired");
  });
  it("accepts PHN alone", () => {
    const errors = validateRegistration(baseData({ nic: "", phn: "PHN-001" }));
    expect(errors.idProof).toBeUndefined();
  });
  it("flags an invalid NIC only when non-empty", () => {
    expect(validateRegistration(baseData({ nic: "bad" })).nic).toBe("errInvalidNic");
    expect(validateRegistration(baseData({ nic: "", phn: "P1" })).nic).toBeUndefined();
  });
  it("flags an invalid mobile", () => {
    expect(validateRegistration(baseData({ mobile: "123" })).mobile).toBe("errInvalidMobile");
  });
});
