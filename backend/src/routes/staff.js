import express from "express";
import { findPhnoByUsername } from "../lib/phnoUsers.js";
import { verifyPassword } from "../lib/password.js";
import {
  COOKIE_NAME,
  createSession,
  getSessionUser,
  deleteSession,
  parseCookie,
} from "../lib/session.js";
import { createThrottle } from "../lib/loginThrottle.js";
import { validatePatientFields } from "../lib/validation.js";

// In production (NODE_ENV=production, set by the pm2 ecosystem) the cookie is
// Secure and scoped to /arogya so the browser never sends it to the co-hosted
// DHIS2 paths. In tests/local http it must be non-secure and Path=/ so the
// supertest agent / curl jar resend it (the backend itself serves /staff, not
// /arogya/... — Caddy strips the /arogya/api prefix in production).
const IS_PROD = process.env.NODE_ENV === "production";
const COOKIE_PATH = IS_PROD ? "/arogya" : "/";
const COOKIE_OPTS = {
  httpOnly: true,
  secure: IS_PROD,
  sameSite: "strict",
  path: COOKIE_PATH,
  maxAge: 12 * 60 * 60 * 1000,
};

export function staffRouter(db) {
  const router = express.Router();
  const throttle = createThrottle({ max: 5, windowMs: 15 * 60 * 1000 });

  function publicUser(u) {
    const clinic = db.prepare("SELECT name FROM clinics WHERE clinic_id = ?").get(u.clinic_id);
    return { fullName: u.full_name, clinicId: u.clinic_id, clinicName: clinic ? clinic.name : null };
  }

  // Auth gate for every route except /login.
  function requireAuth(req, res, next) {
    const token = parseCookie(req.headers.cookie, COOKIE_NAME);
    const user = getSessionUser(db, token);
    if (!user) {
      res.status(401).type("text/plain").send("Authentication required.");
      return;
    }
    req.phno = { id: user.id, clinicId: user.clinic_id, fullName: user.full_name };
    next();
  }

  router.post("/login", (req, res) => {
    const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
    const password = typeof req.body?.password === "string" ? req.body.password : "";
    const key = `${username}|${req.ip}`;

    if (throttle.isBlocked(key)) {
      res.status(429).type("text/plain").send("Too many attempts. Please try again later.");
      return;
    }

    const user = username ? findPhnoByUsername(db, username) : undefined;
    const ok =
      user && user.disabled === 0 && verifyPassword(password, user.password_hash, user.password_salt);
    if (!ok) {
      throttle.recordFailure(key);
      res.status(401).type("text/plain").send("Invalid username or password.");
      return;
    }

    throttle.reset(key);
    const token = createSession(db, user.id);
    res.cookie(COOKIE_NAME, token, COOKIE_OPTS);
    res.json(publicUser(user));
  });

  router.post("/logout", requireAuth, (req, res) => {
    const token = parseCookie(req.headers.cookie, COOKIE_NAME);
    if (token) deleteSession(db, token);
    res.clearCookie(COOKIE_NAME, { path: COOKIE_PATH });
    res.json({ ok: true });
  });

  router.get("/me", requireAuth, (req, res) => {
    const user = db.prepare("SELECT * FROM phno_users WHERE id = ?").get(req.phno.id);
    res.json(publicUser(user));
  });

  // Map a DB row to a queue summary (no full PII dump in the list).
  function toSummary(row) {
    const p = JSON.parse(row.patient_json || "{}");
    return {
      id: row.id,
      arogyaId: row.arogya_id,
      fullName: p.fullName || "",
      nic: p.nic || "",
      triage: row.triage,
      status: row.status,
      createdAt: row.created_at,
      reviewedAt: row.reviewed_at,
    };
  }

  router.get("/registrations", requireAuth, (req, res) => {
    const status = ["pending", "approved", "rejected"].includes(req.query.status)
      ? req.query.status
      : null;
    const q = typeof req.query.q === "string" && req.query.q.trim() ? `%${req.query.q.trim()}%` : null;

    let sql =
      "SELECT id, arogya_id, patient_json, triage, status, created_at, reviewed_at " +
      "FROM registrations WHERE clinic_id = @clinicId";
    const params = { clinicId: req.phno.clinicId };
    if (status) {
      sql += " AND status = @status";
      params.status = status;
    }
    if (q) {
      sql += " AND (arogya_id LIKE @q OR patient_json LIKE @q)";
      params.q = q;
    }
    sql += " ORDER BY created_at DESC, id DESC";
    const rows = db.prepare(sql).all(params);
    res.json(rows.map(toSummary));
  });

  // Load a registration and enforce per-clinic ownership. Returns the row or
  // sends the appropriate error response (and returns null).
  function loadOwned(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(404).type("text/plain").send("Not found.");
      return null;
    }
    const row = db.prepare("SELECT * FROM registrations WHERE id = ?").get(id);
    if (!row) {
      res.status(404).type("text/plain").send("Not found.");
      return null;
    }
    if (row.clinic_id !== req.phno.clinicId) {
      res.status(403).type("text/plain").send("Forbidden.");
      return null;
    }
    return row;
  }

  router.get("/registrations/:id", requireAuth, (req, res) => {
    const row = loadOwned(req, res);
    if (!row) return;
    const audit = db
      .prepare(
        `SELECT a.action, a.changes_json, a.reason, a.created_at, u.full_name AS by_name
         FROM registration_audit a JOIN phno_users u ON u.id = a.user_id
         WHERE a.registration_id = ? ORDER BY a.created_at ASC, a.id ASC`
      )
      .all(row.id)
      .map((a) => ({
        action: a.action,
        changes: a.changes_json ? JSON.parse(a.changes_json) : null,
        reason: a.reason,
        at: a.created_at,
        byName: a.by_name,
      }));
    res.json({
      id: row.id,
      arogyaId: row.arogya_id,
      clinicId: row.clinic_id,
      language: row.language,
      patient: JSON.parse(row.patient_json || "{}"),
      screeningFlags: JSON.parse(row.screening_flags || "[]"),
      triage: row.triage,
      status: row.status,
      reviewedAt: row.reviewed_at,
      rejectReason: row.reject_reason,
      createdAt: row.created_at,
      audit,
    });
  });

  const insertAudit = db.prepare(
    `INSERT INTO registration_audit (registration_id, user_id, action, changes_json, reason, created_at)
     VALUES (@registrationId, @userId, @action, @changesJson, @reason, @createdAt)`
  );

  router.patch("/registrations/:id", requireAuth, (req, res) => {
    const row = loadOwned(req, res);
    if (!row) return;
    if (row.status !== "pending") {
      res.status(409).type("text/plain").send("Only pending records can be edited.");
      return;
    }
    const incoming = req.body && req.body.patient;
    if (!incoming || typeof incoming !== "object") {
      res.status(400).type("text/plain").send("patient object is required.");
      return;
    }
    const errors = validatePatientFields(incoming);
    if (errors.length > 0) {
      res.status(400).type("text/plain").send(errors.join(" "));
      return;
    }
    const before = JSON.parse(row.patient_json || "{}");
    const after = { ...before, ...incoming };
    const changes = {};
    for (const k of Object.keys(after)) {
      if (before[k] !== after[k]) changes[k] = { from: before[k] ?? null, to: after[k] ?? null };
    }
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare("UPDATE registrations SET patient_json = ? WHERE id = ?").run(JSON.stringify(after), row.id);
      if (Object.keys(changes).length > 0) {
        insertAudit.run({
          registrationId: row.id, userId: req.phno.id, action: "edit",
          changesJson: JSON.stringify(changes), reason: null, createdAt: now,
        });
      }
    })();
    res.json({ id: row.id, patient: after });
  });

  router.post("/registrations/:id/approve", requireAuth, (req, res) => {
    const row = loadOwned(req, res);
    if (!row) return;
    if (row.status === "approved") {
      res.json({ id: row.id, status: "approved", reviewedAt: row.reviewed_at });
      return; // idempotent no-op
    }
    if (row.status !== "pending") {
      res.status(409).type("text/plain").send(`Cannot approve a ${row.status} record.`);
      return;
    }
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare(
        "UPDATE registrations SET status='approved', reviewed_by=?, reviewed_at=? WHERE id=?"
      ).run(req.phno.id, now, row.id);
      insertAudit.run({
        registrationId: row.id, userId: req.phno.id, action: "approve",
        changesJson: null, reason: null, createdAt: now,
      });
    })();
    // Layer B will trigger the DHIS2 push here.
    res.json({ id: row.id, status: "approved", reviewedAt: now });
  });

  router.post("/registrations/:id/reject", requireAuth, (req, res) => {
    const row = loadOwned(req, res);
    if (!row) return;
    const reason = typeof req.body?.reason === "string" ? req.body.reason.trim() : "";
    if (!reason) {
      res.status(400).type("text/plain").send("A rejection reason is required.");
      return;
    }
    if (row.status !== "pending") {
      res.status(409).type("text/plain").send(`Cannot reject a ${row.status} record.`);
      return;
    }
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare(
        "UPDATE registrations SET status='rejected', reviewed_by=?, reviewed_at=?, reject_reason=? WHERE id=?"
      ).run(req.phno.id, now, reason, row.id);
      insertAudit.run({
        registrationId: row.id, userId: req.phno.id, action: "reject",
        changesJson: null, reason, createdAt: now,
      });
    })();
    res.json({ id: row.id, status: "rejected", rejectReason: reason, reviewedAt: now });
  });

  // Expose for later tasks in the same file:
  router.requireAuth = requireAuth;
  router.loadOwned = loadOwned;
  router.toSummary = toSummary;
  return router;
}
