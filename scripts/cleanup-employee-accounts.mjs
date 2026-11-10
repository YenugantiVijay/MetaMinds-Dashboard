/**
 * Explicit, backup-first LOCAL DEVELOPMENT employee reset.
 * Default mode only prints counts; it never modifies the database.
 *
 * Run with a clearly isolated local database:
 * DATA_DIR=<dedicated-test-data-dir> NODE_ENV=development node scripts/cleanup-employee-accounts.mjs
 * DATA_DIR=<dedicated-test-data-dir> NODE_ENV=development node scripts/cleanup-employee-accounts.mjs --execute --confirm-disposable-data
 *
 * Never run against a production or employee-data database.
 */
import { db, dataDir } from "../src/database.mjs";
import { DEMO_CREDENTIALS } from "../src/demo-accounts.mjs";
import { DatabaseSync } from "node:sqlite";
import { mkdirSync, copyFileSync, chmodSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const dedicatedDataDir = process.env.DATA_DIR && resolve(process.env.DATA_DIR) === dataDir;
const forbidden = /(production|live|prod-db)/i.test(dataDir);
if (process.env.NODE_ENV !== "development" || !dedicatedDataDir || forbidden) {
  throw new Error("Employee cleanup requires NODE_ENV=development and an explicit dedicated local DATA_DIR.");
}
const ceo = db.prepare("SELECT id,email,role,password_hash FROM users WHERE email=? COLLATE NOCASE")
  .get(DEMO_CREDENTIALS.ceo.email);
if (!ceo || ceo.role !== "ceo" || !Number.isSafeInteger(ceo.id)) {
  throw new Error("Unique CEO demo account could not be verified; cleanup refused.");
}
const otherCeo = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role='ceo' AND id<>?").get(ceo.id).n;
if (otherCeo) throw new Error("Another CEO account exists. Refusing automated cleanup.");
const doomedEmployee = `SELECT id FROM employees WHERE user_id<> ${ceo.id}`;
const doomedUsers = `SELECT id FROM users WHERE id<> ${ceo.id}`;
const count = (sql) => db.prepare(sql).get().n;
const preview = {
  otherUsers: count(`SELECT COUNT(*) n FROM users WHERE id IN (${doomedUsers})`),
  employees: count(`SELECT COUNT(*) n FROM employees WHERE id IN (${doomedEmployee})`),
  attendanceRecords: count(`SELECT COUNT(*) n FROM attendance_records WHERE employee_id IN (${doomedEmployee})`),
  leaveRequests: count(`SELECT COUNT(*) n FROM leave_requests WHERE employee_id IN (${doomedEmployee})`),
  dailyReports: count(`SELECT COUNT(*) n FROM daily_work_reports WHERE employee_id IN (${doomedEmployee})`),
};
console.log("LOCAL DEVELOPMENT RESET PREVIEW (no data changed):", preview);
console.log("Preserved CEO demo account ID:", ceo.id);
if (!process.argv.includes("--execute")) {
  console.log("Preview only. To run, supply both --execute and --confirm-disposable-data after reviewing the above counts.");
  process.exit(0);
}
if (!process.argv.includes("--confirm-disposable-data")) {
  throw new Error("Explicit confirmation --confirm-disposable-data required.");
}

// Verify a single-file, consistent SQLite backup with its encryption key before any deletion.
const safeName = new Date().toISOString().replace(/[:.]/g,"-");
const backupDir = join(dataDir,"backups",`pre-employee-reset-${safeName}`);
mkdirSync(backupDir,{recursive:true,mode:0o700});
const snapshot = join(backupDir,"portal.sqlite");
db.exec(`VACUUM INTO '${snapshot.replace(/'/g,"''")}'`);
copyFileSync(join(dataDir,".application-key"),join(backupDir,".application-key"));
const check = new DatabaseSync(snapshot);
const integrity = check.prepare("PRAGMA integrity_check").get().integrity_check;
const backupCeo = check.prepare("SELECT password_hash FROM users WHERE id=?").get(ceo.id);
check.close();
if (integrity !== "ok" || backupCeo?.password_hash !== ceo.password_hash ||
    statSync(snapshot).size < 4096) throw new Error("Backup integrity/CEO verification failed.");
console.log("Verified backup saved outside Git repository:", backupDir);

db.exec("PRAGMA foreign_keys=ON");
db.exec("BEGIN IMMEDIATE");
try {
  const del = (table, predicate) => db.prepare(`DELETE FROM ${table} WHERE ${predicate}`).run().changes;
  // Preserve audit events but detach deleted actors to satisfy foreign keys.
  db.prepare(`UPDATE audit_logs SET actor_user_id=NULL WHERE actor_user_id IN (${doomedUsers})`).run();
  db.prepare(`UPDATE employee_applications SET reviewed_by=NULL WHERE reviewed_by IN (${doomedUsers})`).run();
  db.prepare(`UPDATE payroll_runs SET finalized_by=NULL WHERE finalized_by IN (${doomedUsers})`).run();

  const attendance = `SELECT id FROM attendance_records WHERE employee_id IN (${doomedEmployee})`;
  const leaves = `SELECT id FROM leave_requests WHERE employee_id IN (${doomedEmployee})`;
  const structures = `SELECT id FROM salary_structures WHERE employee_id IN (${doomedEmployee})`;
  const payrollItems = `SELECT id FROM payroll_items WHERE employee_id IN (${doomedEmployee})`;

  del("attendance_corrections",`attendance_record_id IN (${attendance})`);
  del("attendance_breaks",`attendance_record_id IN (${attendance})`);
  del("attendance_automation",`attendance_record_id IN (${attendance})`);
  del("daily_work_reports",`attendance_record_id IN (${attendance}) OR employee_id IN (${doomedEmployee})`);
  del("attendance_records",`employee_id IN (${doomedEmployee})`);
  del("attendance_reminders",`employee_id IN (${doomedEmployee})`);
  del("attendance_exceptions",`employee_id IN (${doomedEmployee})`);

  del("leave_approvals",`leave_request_id IN (${leaves})`);
  del("leave_requests",`employee_id IN (${doomedEmployee})`);
  del("leave_balances",`employee_id IN (${doomedEmployee})`);
  del("team_members",`employee_id IN (${doomedEmployee})`);
  del("employee_referrals",`employee_id IN (${doomedEmployee})`);
  del("employee_emergency_contacts",`employee_id IN (${doomedEmployee})`);
  del("employee_self_profiles",`employee_id IN (${doomedEmployee})`);

  del("payslips",`payroll_item_id IN (${payrollItems})`);
  del("payroll_items",`employee_id IN (${doomedEmployee})`);
  del("salary_components",`salary_structure_id IN (${structures})`);
  del("salary_structures",`employee_id IN (${doomedEmployee})`);

  del("notifications",`user_id IN (${doomedUsers})`);
  del("sessions",`user_id IN (${doomedUsers})`);
  del("activation_tokens",`user_id IN (${doomedUsers})`);
  del("password_reset_tokens",`user_id IN (${doomedUsers})`);

  // Preserve applications not proven to belong to the deleted employees.
  // Do not clear company settings, holidays, departments, teams, email logs or audit history.
  del("employees",`id IN (${doomedEmployee})`);
  del("users",`id IN (${doomedUsers})`);

  const remaining = db.prepare("SELECT COUNT(*) AS n FROM employees").get().n;
  const remainingUsers = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  const actualCeo = db.prepare("SELECT password_hash,role FROM users WHERE id=?").get(ceo.id);
  if (remaining !== 0 || remainingUsers !== 1 || actualCeo?.role !== "ceo" ||
    actualCeo.password_hash !== ceo.password_hash) throw new Error("CEO preservation or cleanup verification failed.");
  const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeys.length) throw new Error(`Foreign key violations: ${foreignKeys.length}`);
  db.exec("COMMIT");
  console.log("Local disposable employee reset completed. Company configuration and CEO credentials preserved.");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
