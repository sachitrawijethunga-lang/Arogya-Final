import { randomBytes } from "node:crypto";

export const COOKIE_NAME = "arogya_session";
const DEFAULT_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

// Create a server-side session, returning the opaque token.
export function createSession(db, userId, ttlMs = DEFAULT_TTL_MS) {
  const token = randomBytes(32).toString("hex");
  const now = Date.now();
  db.prepare(
    `INSERT INTO phno_sessions (token, user_id, created_at, expires_at)
     VALUES (@token, @userId, @createdAt, @expiresAt)`
  ).run({
    token,
    userId,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlMs).toISOString(),
  });
  return token;
}

// Resolve a token to its (active, non-disabled) user, or null.
// Lazily deletes an expired session.
export function getSessionUser(db, token) {
  if (typeof token !== "string" || token.length === 0) return null;
  const sess = db.prepare("SELECT * FROM phno_sessions WHERE token = ?").get(token);
  if (!sess) return null;
  if (new Date(sess.expires_at).getTime() <= Date.now()) {
    deleteSession(db, token);
    return null;
  }
  const user = db
    .prepare("SELECT * FROM phno_users WHERE id = ? AND disabled = 0")
    .get(sess.user_id);
  return user || null;
}

export function deleteSession(db, token) {
  db.prepare("DELETE FROM phno_sessions WHERE token = ?").run(token);
}

// Parse a single named cookie value out of a Cookie header.
export function parseCookie(header, name) {
  if (typeof header !== "string" || header.length === 0) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      return part.slice(eq + 1).trim();
    }
  }
  return null;
}
