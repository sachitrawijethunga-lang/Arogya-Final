import express from "express";

export function clinicsRouter(db) {
  const router = express.Router();
  const findClinic = db.prepare("SELECT clinic_id, name FROM clinics WHERE clinic_id = ?");

  router.post("/validate", (req, res) => {
    const clinicId =
      req.body && typeof req.body.clinicId === "string" ? req.body.clinicId.trim() : "";
    if (!clinicId) {
      res.status(400).type("text/plain").send("clinicId is required.");
      return;
    }
    const row = findClinic.get(clinicId);
    if (row) res.json({ valid: true, clinicName: row.name });
    else res.json({ valid: false });
  });

  return router;
}
