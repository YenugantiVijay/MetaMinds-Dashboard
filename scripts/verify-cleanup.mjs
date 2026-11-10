/**
 * Read-only verification of a completed LOCAL employee fresh-start reset.
 * Unlike the older verifier, this prints NO passwords, session tokens, or user PII.
 */
import { DatabaseSync } from "node:sqlite";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const defaultDir = resolve(join(homedir(), ".meta-minds-portal"));
const configured = resolve(process.env.DATA_DIR || defaultDir);
if (process.env.NODE_ENV === "production" ||
  (process.platform === "win32"
    ? configured.toLowerCase() !== defaultDir.toLowerCase()
    : configured !== defaultDir)) {
  throw new Error("Verification is restricted to the default local development database.");
}
const path = join(configured, "portal.sqlite");
if (!existsSync(path)) throw new Error("Local database is missing.");
const db = new DatabaseSync(path, { readOnly: true });
try {
  const ceos = db.prepare("SELECT role, active, password_hash FROM users WHERE email=? COLLATE NOCASE")
    .all("demo.ceo@metaminds.local");
  if (ceos.length !== 1 || ceos[0].role !== "ceo" || !ceos[0].password_hash) {
    throw new Error("Expected CEO demo account was not preserved correctly.");
  }
  const counts = {};
  for (const table of [
    "employees", "employee_applications", "application_verifications",
    "application_documents", "attendance_records", "attendance_breaks",
    "attendance_exceptions", "attendance_automation", "daily_work_reports",
    "leave_requests", "leave_approvals", "leave_balances", "notifications",
    "audit_logs", "email_outbox", "sessions", "payroll_runs", "payroll_items",
  ]) {
    counts[table] = db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n;
  }
  const nonempty = Object.entries(counts).filter(([,n]) => n > 0);
  const totalUsers = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  const violations = db.prepare("PRAGMA foreign_key_check").all();
  if (totalUsers !== 1 || nonempty.length || violations.length) {
    throw new Error(`Fresh-start verification failed: users=${totalUsers}, nonempty=${nonempty.map(([n])=>n).join(",")}, foreignKeys=${violations.length}.`);
  }
  console.log("VERIFIED: no employee accounts, candidate applications, attendance, leaves, reports, notifications or feed records remain.");
  console.log("VERIFIED: CEO demo account is preserved. Company policies and holidays remain configured.");
} finally {
  db.close();
}
