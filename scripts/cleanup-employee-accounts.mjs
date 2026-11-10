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
const fullFreshStart = process.argv.includes("--full-fresh");
const ceo = db.prepare("SELECT id,email,role,password_hash,active FROM users WHERE email=? COLLATE NOCASE")
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
  candidateApplications: count("SELECT COUNT(*) AS n FROM employee_applications"),
  applicationVerifications: count("SELECT COUNT(*) AS n FROM application_verifications"),
  applicationDocuments: count("SELECT COUNT(*) AS n FROM application_documents"),
  pendingEmailRecords: count("SELECT COUNT(*) AS n FROM email_outbox"),
  notifications: count("SELECT COUNT(*) AS n FROM notifications"),
  auditEvents: count("SELECT COUNT(*) AS n FROM audit_logs"),
};
console.log(`LOCAL DEVELOPMENT ${fullFreshStart ? "COMPLETE FRESH-START" : "EMPLOYEE"} RESET PREVIEW (no data changed):`, preview);
if (fullFreshStart) console.log("FULL FRESH START: all applications, work records, notifications, outbox records and local test audit events will also be cleared. The CEO account, company settings and verified holidays remain.");
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
  // The holiday record belongs to the company, not to an employee who created it.
  // Keep the holiday even if a previously authorized creator is deleted.
  db.prepare(`UPDATE company_holidays SET created_by=NULL WHERE created_by IN (${doomedUsers})`).run();

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

  if (fullFreshStart) {
    // This mode is strictly for an explicitly disposable LOCAL development database.
    // Application and verification queues are not employee profiles, so the standard
    // scoped cleanup deliberately retains them. A full fresh start clears them too.
    del("application_documents","1=1");
    del("employee_applications","1=1");
    del("application_verifications","1=1");
    del("email_outbox","1=1");
    del("notifications","1=1"); // Remove the prior CEO/employee recent activity feed.
    del("audit_logs","1=1"); // Only disposable dev history; backup retains a copy.
    del("sessions","1=1"); // Force re-login with the preserved CEO credentials.
    del("activation_tokens","1=1");
    del("password_reset_tokens","1=1");
    del("payroll_runs","1=1");
    del("employee_id_sequences","1=1");
    del("employee_id_year_sequences","1=1");
    // Remove old generated demo organizational data, not actual configured teams.
    db.prepare("DELETE FROM teams WHERE name='Demo Engineering Team' AND NOT EXISTS (SELECT 1 FROM team_members WHERE team_members.team_id=teams.id)").run();
    db.prepare("DELETE FROM departments WHERE name='Demo Engineering' AND NOT EXISTS (SELECT 1 FROM teams WHERE teams.department_id=departments.id)").run();
  }

  const remaining = db.prepare("SELECT COUNT(*) AS n FROM employees").get().n;
  const remainingUsers = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  const actualCeo = db.prepare("SELECT password_hash,role FROM users WHERE id=?").get(ceo.id);
  if (remaining !== 0 || remainingUsers !== 1 || actualCeo?.role !== "ceo" ||
    actualCeo.password_hash !== ceo.password_hash) throw new Error("CEO preservation or cleanup verification failed.");
  if (fullFreshStart) {
    const emptyTables = [
      "employee_applications", "application_documents", "application_verifications",
      "employees", "attendance_records", "attendance_exceptions",
      "attendance_breaks", "attendance_automation", "daily_work_reports",
      "leave_requests", "leave_approvals", "leave_balances",
      "email_outbox", "notifications", "audit_logs",
      "payroll_runs", "payroll_items", "payslips",
      "sessions", "activation_tokens", "password_reset_tokens",
    ];
    for (const table of emptyTables) {
      if (db.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n !== 0)
        throw new Error(`Fresh-start verification failed: ${table} still has records.`);
    }
    const savedCeo = db.prepare("SELECT * FROM users WHERE id=?").get(ceo.id);
    if (savedCeo.active !== ceo.active || savedCeo.email !== ceo.email)
      throw new Error("CEO account properties changed unexpectedly.");
  }
  const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
  if (foreignKeys.length) throw new Error(`Foreign key violations: ${foreignKeys.length}`);
  db.exec("COMMIT");
  console.log(fullFreshStart
    ? "Local FULL FRESH START completed. Employee, application, attendance and recent feed data cleared. CEO credentials, company settings and holidays preserved."
    : "Local disposable employee reset completed. Company configuration and CEO credentials preserved.");
  console.log("The verified backup still contains old records and must be secured under your local data directory.");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}
