import { chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { DatabaseSync } from "node:sqlite";

const projectDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataDir = resolve(process.env.DATA_DIR || join(homedir(), ".meta-minds-portal"));
const migrationsDir = join(projectDir, "migrations");
mkdirSync(dataDir, { recursive: true });

const keyPath = join(dataDir, ".application-key");
let encryptionKey;
try {
  encryptionKey = readFileSync(keyPath);
  if (encryptionKey.length !== 32) throw new Error("Application key file is invalid.");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  encryptionKey = randomBytes(32);
  writeFileSync(keyPath, encryptionKey, { flag: "wx", mode: 0o600 });
  try {
    chmodSync(keyPath, 0o600);
  } catch (chmodError) {
    if (process.platform !== "win32") throw chmodError;
  }
}

export { dataDir, encryptionKey };

export const db = new DatabaseSync(join(dataDir, "portal.sqlite"));
db.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;");
db.exec(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
`);

const applied = new Set(db.prepare("SELECT version FROM schema_migrations").all().map((row) => row.version));
const migrationFiles = readdirSync(migrationsDir)
  .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/i.test(name))
  .sort((left, right) => Number(left.split("_", 1)[0]) - Number(right.split("_", 1)[0]));
for (const name of migrationFiles) {
  const version = Number(name.split("_", 1)[0]);
  if (applied.has(version)) continue;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec(readFileSync(join(migrationsDir, name), "utf8"));
    db.prepare("INSERT INTO schema_migrations(version, name) VALUES (?, ?)").run(version, name);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

for (const [key, value] of [
  ["timezone", process.env.COMPANY_TIMEZONE || "Asia/Kolkata"],
  ["scheduled_start", process.env.SCHEDULED_START || "10:00"],
  ["scheduled_end", process.env.SCHEDULED_END || "18:00"],
  ["expected_working_minutes", process.env.EXPECTED_WORKING_HOURS ? String(Number(process.env.EXPECTED_WORKING_HOURS) * 60) : "480"],
  ["absence_warning_hours", process.env.ABSENCE_WARNING_HOURS || "3"],
]) {
  db.prepare("INSERT OR IGNORE INTO company_settings(key, value) VALUES (?, ?)").run(key, value);
}
