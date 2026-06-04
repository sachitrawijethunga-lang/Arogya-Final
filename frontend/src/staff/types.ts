import type { RegistrationData } from "../types";

export interface StaffUser {
  fullName: string;
  clinicId: string;
  clinicName: string | null;
}

export type RecordStatus = "pending" | "approved" | "rejected";

export interface RegistrationSummary {
  id: number;
  arogyaId: string;
  fullName: string;
  nic: string;
  triage: string;
  status: RecordStatus;
  createdAt: string;
  reviewedAt: string | null;
}

export interface AuditEntry {
  action: "edit" | "approve" | "reject";
  changes: Record<string, { from: unknown; to: unknown }> | null;
  reason: string | null;
  at: string;
  byName: string;
}

export interface RegistrationDetail {
  id: number;
  arogyaId: string;
  clinicId: string;
  language: string;
  patient: RegistrationData;
  screeningFlags: boolean[];
  triage: string;
  status: RecordStatus;
  reviewedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  audit: AuditEntry[];
}

// Flat (non-discriminated) shape: this project's tsconfig has no strictNullChecks,
// so discriminated-union narrowing on `ok` does not work. Optional fields keep
// every consumer's `res.ok` / `res.data` / `res.status` / `res.error` access valid.
export interface StaffResult<T> {
  ok: boolean;
  data?: T;
  status?: number;
  error?: string;
}
