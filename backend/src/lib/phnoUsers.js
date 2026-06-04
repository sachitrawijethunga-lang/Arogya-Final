import { hashPassword } from "./password.js";

// Create a PHNO account (used by the login admin CLI and tests).
// Throws on unknown clinic or duplicate username.
export function createPhnoUser(db, { username, password, clinicId, fullName }) {
  const clinic = db.prepare("SELECT 1 AS one FROM clinics WHERE clinic_id = ?").get(clinicId);
  if (!clinic) throw new Error(`Unknown clinic: ${clinicId}`);
  if (findPhnoByUsername(db, username)) throw new Error(`Username already exists: ${username}`);

  const { hash, salt } = hashPassword(password);
  const info = db
    .prepare(
      `INSERT INTO phno_users (username, password_hash, password_salt, clinic_id, full_name, created_at)
       VALUES (@username, @hash, @salt, @clinicId, @fullName, @createdAt)`
    )
    .run({
      username,
      hash,
      salt,
      clinicId,
      fullName,
      createdAt: new Date().toISOString(),
    });
  return { id: Number(info.lastInsertRowid), username, clinicId, fullName };
}

export function findPhnoByUsername(db, username) {
  return db.prepare("SELECT * FROM phno_users WHERE username = ?").get(username);
}
