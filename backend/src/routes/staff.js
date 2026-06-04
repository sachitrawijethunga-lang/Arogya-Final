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

  // ---- queue/detail/review routes are appended in later tasks, BEFORE `return router` ----

  // Expose for later tasks in the same file:
  router.requireAuth = requireAuth;
  return router;
}
