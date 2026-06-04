const LANGS = ["en", "si", "ta"];

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

export function validateRegistration(body, clinicExists) {
  if (!body || typeof body !== "object") return ["Invalid request body."];
  const errors = [];

  if (!clinicExists) errors.push("Unknown clinic.");
  if (!LANGS.includes(body.language)) errors.push("Invalid language.");
  if (body.consent !== true) errors.push("Consent is required.");
  if (!isNonEmptyString(body.requestId)) errors.push("Request ID is required.");

  const flags = body.screening && body.screening.flags;
  if (!Array.isArray(flags) || flags.length !== 11 || !flags.every((f) => typeof f === "boolean")) {
    errors.push("Screening flags must be an array of 11 booleans.");
  }

  const p = body.patient || {};
  if (!isNonEmptyString(p.fullName)) errors.push("Full name is required.");
  if (p.gender !== "male" && p.gender !== "female") errors.push("Gender is required.");
  if (!isNonEmptyString(p.dateOfBirth)) errors.push("Date of birth is required.");
  if (!isNonEmptyString(p.mobile)) errors.push("Mobile number is required.");
  if (!isNonEmptyString(p.nic) && !isNonEmptyString(p.phn)) errors.push("NIC or PHN is required.");

  return errors;
}
