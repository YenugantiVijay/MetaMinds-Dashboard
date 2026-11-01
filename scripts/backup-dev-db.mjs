import { db, dataDir } from "../src/database.mjs";
import { DatabaseSync } from "node:sqlite";
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { join } from "node:path";

const now = new Date();
const timestamp = now.toISOString().replace(/[:.]/g, "-");
const backupDir = join(dataDir, "backups", `backup-${timestamp}`);

mkdirSync(backupDir, { recursive: true });
console.log("Creating backup in:", backupDir);

// 1. Checkpoint WAL
console.log("Checkpointing WAL...");
db.exec("PRAGMA wal_checkpoint(TRUNCATE);");

// 2. Perform VACUUM INTO to create a consistent single-file backup
const backupDbPath = join(backupDir, "portal.sqlite");
console.log("Executing VACUUM INTO...");
db.exec(`VACUUM INTO '${backupDbPath.replace(/'/g, "''")}';`);

// 3. Backup .application-key
const keySource = join(dataDir, ".application-key");
const keyDest = join(backupDir, ".application-key");
if (existsSync(keySource)) {
  copyFileSync(keySource, keyDest);
  console.log("Copied .application-key successfully.");
}

// 4. Verify backup database integrity
console.log("Verifying backup integrity...");
const backupDb = new DatabaseSync(backupDbPath);
const integrityResult = backupDb.prepare("PRAGMA integrity_check;").get();
console.log("Integrity check result:", integrityResult);

if (integrityResult.integrity_check !== "ok") {
  throw new Error(`Backup database integrity check failed: ${JSON.stringify(integrityResult)}`);
}

// 5. Verify file sizes
const dbStats = statSync(backupDbPath);
const keyStats = statSync(keyDest);
console.log(`Backup portal.sqlite size: ${dbStats.size} bytes`);
console.log(`Backup .application-key size: ${keyStats.size} bytes`);

// Verify users in backup
const users = backupDb.prepare("SELECT id, email, role FROM users").all();
console.log("Backup contains users:", users);

backupDb.close();
console.log("Backup completed and verified successfully!");
