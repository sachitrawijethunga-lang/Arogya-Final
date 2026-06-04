import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DB_PATH = "/var/lib/arogya/arogya.db";
const SEED_PATH = join(__dirname, "data", "clinics.seed.json");

export function openDb(dbPath = process.env.AROGYA_DB_PATH || DEFAULT_DB_PATH) {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  migrate(db);
  seedClinics(db);
  return db;
}

// Versioned, append-only migrations keyed on PRAGMA user_version.
// Each block is applied once and bumps the version. Never edit a shipped block.
function migrate(db) {
  let version = db.pragma("user_version", { simple: true });

  if (version < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS clinics (
        clinic_id TEXT PRIMARY KEY,
        name      TEXT NOT NULL,
        rdhs      TEXT,
        province  TEXT
      );
      CREATE TABLE IF NOT EXISTS clinic_counters (
        clinic_id TEXT PRIMARY KEY REFERENCES clinics(clinic_id),
        last_seq  INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS registrations (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        arogya_id       TEXT UNIQUE NOT NULL,
        clinic_id       TEXT NOT NULL REFERENCES clinics(clinic_id),
        language        TEXT NOT NULL,
        patient_json    TEXT NOT NULL,
        screening_flags TEXT NOT NULL,
        triage          TEXT NOT NULL,
        consent         INTEGER NOT NULL,
        created_at      TEXT NOT NULL
      );
    `);
    db.pragma("user_version = 1");
    version = 1;
  }

  if (version < 2) {
    db.exec(`
      ALTER TABLE registrations ADD COLUMN request_id TEXT;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_reg_request_id
        ON registrations(request_id) WHERE request_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_reg_clinic_created
        ON registrations(clinic_id, created_at);
    `);
    db.pragma("user_version = 2");
    version = 2;
  }
}

function seedClinics(db) {
  const clinics = JSON.parse(readFileSync(SEED_PATH, "utf8"));
  const upsert = db.prepare(`
    INSERT INTO clinics (clinic_id, name, rdhs, province)
    VALUES (@clinicId, @name, @rdhs, @province)
    ON CONFLICT(clinic_id) DO UPDATE SET
      name = excluded.name, rdhs = excluded.rdhs, province = excluded.province
  `);
  const tx = db.transaction((rows) => {
    for (const r of rows) upsert.run(r);
  });
  tx(clinics);
}
