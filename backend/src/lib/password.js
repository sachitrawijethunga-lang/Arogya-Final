import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

const KEYLEN = 64;

// Hash a plaintext password with a fresh random salt (scrypt).
export function hashPassword(plain) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(String(plain), salt, KEYLEN).toString("hex");
  return { hash, salt };
}

// Constant-time verify. Returns false on any malformed stored value.
export function verifyPassword(plain, hash, salt) {
  if (typeof hash !== "string" || typeof salt !== "string" || hash.length === 0) {
    return false;
  }
  let expected;
  try {
    expected = Buffer.from(hash, "hex");
  } catch {
    return false;
  }
  if (expected.length !== KEYLEN) return false;
  const actual = scryptSync(String(plain), salt, KEYLEN);
  return timingSafeEqual(actual, expected);
}
