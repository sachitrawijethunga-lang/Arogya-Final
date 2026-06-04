import type { RegistrationSummary } from "./types";

// Client-side search over the already-clinic-scoped list (server also filters,
// this keeps typing responsive). Matches name, NIC, or Arogya ID.
export function filterSummaries(rows: RegistrationSummary[], query: string): RegistrationSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) =>
      r.fullName.toLowerCase().includes(q) ||
      r.nic.toLowerCase().includes(q) ||
      r.arogyaId.toLowerCase().includes(q)
  );
}
