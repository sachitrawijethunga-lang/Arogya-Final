import { Language } from "./translations";

export type ScreenState =
  | "language"
  | "scanner"
  | "registration"
  | "questionnaire"
  | "triage";

export type Gender = "male" | "female";

export type RelationshipKey =
  | "spouse" | "child" | "parent" | "head" | "brother" | "sister"
  | "grandparent" | "grandchild" | "daughterInLaw" | "sonInLaw";

export type MaritalKey =
  | "single" | "married" | "divorced" | "separated" | "widowed" | "notStated";

export type OccupationKey =
  | "unemployed" | "selfEmployment" | "privateSector" | "foreignLabour"
  | "government" | "semiGovernment" | "contractBasis" | "farmer"
  | "factoryWorker" | "labour" | "pension" | "other";

export type EducationKey =
  | "none" | "primary" | "secondary" | "advanced" | "diploma"
  | "bachelor" | "postgraduate";

export interface RegistrationData {
  fullName: string;
  nic: string;
  phn: string;
  gender: Gender | null;
  dateOfBirth: string; // ISO yyyy-mm-dd
  householdAddress: string;
  relationshipToHead: RelationshipKey | null;
  gnDivision: string | null;
  mobile: string;
  maritalStatus: MaritalKey | null;
  occupation: OccupationKey | null;
  education: EducationKey | null;
}

export interface TriageResult {
  level: "high-risk" | "normal";
  message: string;
  arogyaId?: string;
}

export interface AppState {
  screen: ScreenState;
  language: Language;
  clinicId: string | null;
  clinicName: string | null;
  registration: RegistrationData | null;
  screeningFlags: boolean[]; // length 11, index-aligned to the question list
  consent: boolean;
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

export interface ClinicValidationResponse {
  valid: boolean;
  clinicName?: string;
}

export interface RegistrationRequest {
  language: string;
  clinicId: string;
  patient: RegistrationData;
  screening: { flags: boolean[] };
  consent: boolean;
}

export interface RegistrationResponse {
  arogyaId: string;
  triage: "high-risk" | "normal";
  message: string;
}
