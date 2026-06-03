import express from "express";
import { validateRegistration } from "../lib/validation.js";
import { computeTriage } from "../lib/triage.js";
import { nextArogyaId } from "../lib/arogyaId.js";
import { triageMessage } from "../lib/messages.js";

export function registrationRouter(db) {
  const router = express.Router();
  const clinicExistsStmt = db.prepare("SELECT 1 AS one FROM clinics WHERE clinic_id = ?");
  const insert = db.prepare(
    `INSERT INTO registrations
       (arogya_id, clinic_id, language, patient_json, screening_flags, triage, consent, created_at)
     VALUES
       (@arogyaId, @clinicId, @language, @patientJson, @flags, @triage, 1, @createdAt)`
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

    const arogyaId = db.transaction(() => {
      const id = nextArogyaId(db, clinicId);
      insert.run({
        arogyaId: id,
        clinicId,
        language: body.language,
        patientJson: JSON.stringify(body.patient),
        flags: JSON.stringify(body.screening.flags),
        triage,
        createdAt,
      });
      return id;
    })();

    res.json({ arogyaId, triage, message: triageMessage(triage, body.language) });
  });

  return router;
}
