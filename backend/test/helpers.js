import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db.js";

// Opens a fresh, seeded SQLite database in a unique temp directory.
export function freshDb() {
  const dir = mkdtempSync(join(tmpdir(), "arogya-test-"));
  return openDb(join(dir, "test.db"));
}
