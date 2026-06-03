// Atomically bumps the per-clinic counter and returns the next Arogya ID,
// e.g. "AC-005-000042". Relies on SQLite UPSERT ... RETURNING (SQLite >= 3.35).
export function nextArogyaId(db, clinicId) {
  const row = db
    .prepare(
      `INSERT INTO clinic_counters (clinic_id, last_seq)
       VALUES (?, 1)
       ON CONFLICT(clinic_id) DO UPDATE SET last_seq = last_seq + 1
       RETURNING last_seq`
    )
    .get(clinicId);
  const seq = String(row.last_seq).padStart(6, "0");
  return `${clinicId}-${seq}`;
}
