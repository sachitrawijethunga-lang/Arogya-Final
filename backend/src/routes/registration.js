import express from "express";
import { validateRegistration } from "../lib/validation.js";
import { computeTriage } from "../lib/triage.js";
import { nextArogyaId } from "../lib/arogyaId.js";
import { triageMessage } from "../lib/messages.js";

export function registrationRouter(db) {
  const router = express.Router();
  const clinicExistsStmt = db.prepare("SELECT 1 AS one FROM clinics WHERE clinic_id = ?");
  const findByRequestId = db.prepare(
    "SELECT arogya_id, triage FROM registrations WHERE request_id = ?"
  );
  const insert = db.prepare(
    `INSERT INTO registrations
       (arogya_id, clinic_id, language, patient_json, screening_flags, triage, consent, created_at, request_id)
     VALUES
       (@arogyaId, @clinicId, @language, @patientJson, @flags, @triage, @consent, @createdAt, @requestId)`
  );

  router.post("/", (req, res) => {
    const body = req.body || {};
    const clinicId = typeof body.clinicId === "string" ? body.clinicId.trim() : "";
    const clinicExists = !!clinicExistsStmt.get(clinicId);

    const errors = validateRegistration(body, clinicExists);
    if (errors.length > 0) {
      res.status(400).type("text/plain").send(errors.join(" "));
      return;
    }

    const triage = computeTriage(body.screening.flags);
    const createdAt = new Date().toISOString();
    const requestId = body.requestId;

    // Idempotent: a replay of the same requestId returns the original result
    // and does NOT advance the per-clinic counter or insert a duplicate.
    const outcome = db.transaction(() => {
      const existing = findByRequestId.get(requestId);
      if (existing) {
        return { arogyaId: existing.arogya_id, triage: existing.triage };
      }
      const id = nextArogyaId(db, clinicId);
      insert.run({
        arogyaId: id,
        clinicId,
        language: body.language,
        patientJson: JSON.stringify(body.patient),
        flags: JSON.stringify(body.screening.flags),
        triage,
        consent: body.consent ? 1 : 0,
        createdAt,
        requestId,
      });
      return { arogyaId: id, triage };
    })();

    res.json({
      arogyaId: outcome.arogyaId,
      triage: outcome.triage,
      message: triageMessage(outcome.triage, body.language),
    });
  });

  return router;
}
