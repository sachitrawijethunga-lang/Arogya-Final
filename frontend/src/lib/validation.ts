import type { RegistrationData } from "../types";

const NIC_OLD = /^[0-9]{9}[vVxX]$/;
const NIC_NEW = /^[0-9]{12}$/;
const SL_MOBILE = /^(?:0|94|\+94)?7\d{8}$/;

export function isValidNic(nic: string): boolean {
  const v = nic.trim();
  return NIC_OLD.test(v) || NIC_NEW.test(v);
}

export function isValidMobile(mobile: string): boolean {
  return SL_MOBILE.test(mobile.replace(/[\s-]/g, ""));
}

// Error values are translation keys; the screen maps them to localized strings.
export type RegistrationErrors = Partial<
  Record<keyof RegistrationData | "idProof", string>
>;

export function validateRegistration(data: RegistrationData): RegistrationErrors {
  const errors: RegistrationErrors = {};

  if (!data.fullName.trim()) errors.fullName = "errRequired";
  if (!data.gender) errors.gender = "errRequired";
  if (!data.dateOfBirth) errors.dateOfBirth = "errRequired";

  if (!data.mobile.trim()) errors.mobile = "errRequired";
  else if (!isValidMobile(data.mobile)) errors.mobile = "errInvalidMobile";

  if (!data.nic.trim() && !data.phn.trim()) errors.idProof = "errIdRequired";
  if (data.nic.trim() && !isValidNic(data.nic)) errors.nic = "errInvalidNic";

  return errors;
}

export function isRegistrationValid(data: RegistrationData): boolean {
  return Object.keys(validateRegistration(data)).length === 0;
}
