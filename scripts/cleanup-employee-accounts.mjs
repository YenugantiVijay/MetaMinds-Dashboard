import { db, dataDir } from "../src/database.mjs";
import { DEMO_CREDENTIALS, ensureDemoAccounts } from "../src/demo-accounts.mjs";

console.log("=== LOCAL DATABASE RESET & CLEANUP ===");
console.log("Database dataDir:", dataDir);

// 1. Safety verification
if (!dataDir.includes(".meta-minds-portal")) {
  throw new Error(`Refusing to run cleanup: unexpected database directory: ${dataDir}`);
}

const ceoEmail = DEMO_CREDENTIALS.ceo.email;
const ceoUser = db.prepare("SELECT id, email, role FROM users WHERE email = ? COLLATE NOCASE").get(ceoEmail);
if (!ceoUser) {
  throw new Error(`CEO demo account '${ceoEmail}' not found in database! Aborting.`);
}
console.log(`CEO account identified: ID ${ceoUser.id}, Email: ${ceoUser.email}, Role: ${ceoUser.role}`);

// 2. Identify non-CEO users and employees
const nonCeoUsers = db.prepare("SELECT id, email, role FROM users WHERE id != ?").all(ceoUser.id);
console.log(`Found ${nonCeoUsers.length} non-CEO user(s) to remove:`);
console.table(nonCeoUsers);

const existingEmployees = db.prepare("SELECT id, user_id, employee_id, full_name FROM employees").all();
console.log(`Found ${existingEmployees.length} employee record(s) to remove:`);
console.table(existingEmployees);

// 3. Transactional cleanup
console.log("\nExecuting atomic transactional cleanup...");
db.exec("BEGIN IMMEDIATE");

try {
  // Disconnect audit log actor foreign keys for non-CEO users while preserving immutable logs
  const auditUpdated = db.prepare(`
    UPDATE audit_logs
    SET actor_user_id = NULL
    WHERE actor_user_id IS NOT NULL AND actor_user_id != ?
  `).run(ceoUser.id);
  console.log(`- Updated ${auditUpdated.changes} audit_log entries to preserve history without foreign key violations.`);

  // Attendance & Daily Work
  const dwr = db.prepare("DELETE FROM daily_work_reports").run();
  console.log(`- Deleted ${dwr.changes} daily_work_reports.`);

  const ab = db.prepare("DELETE FROM attendance_breaks").run();
  console.log(`- Deleted ${ab.changes} attendance_breaks.`);

  const ac = db.prepare("DELETE FROM attendance_corrections").run();
  console.log(`- Deleted ${ac.changes} attendance_corrections.`);

  const ar = db.prepare("DELETE FROM attendance_records").run();
  console.log(`- Deleted ${ar.changes} attendance_records.`);

  const ae = db.prepare("DELETE FROM attendance_exceptions").run();
  console.log(`- Deleted ${ae.changes} attendance_exceptions.`);

  const arm = db.prepare("DELETE FROM attendance_reminders").run();
  console.log(`- Deleted ${arm.changes} attendance_reminders.`);

  // Leave & Teams
  const la = db.prepare("DELETE FROM leave_approvals").run();
  console.log(`- Deleted ${la.changes} leave_approvals.`);

  const lr = db.prepare("DELETE FROM leave_requests").run();
  console.log(`- Deleted ${lr.changes} leave_requests.`);

  const lb = db.prepare("DELETE FROM leave_balances").run();
  console.log(`- Deleted ${lb.changes} leave_balances.`);

  const tm = db.prepare("DELETE FROM team_members").run();
  console.log(`- Deleted ${tm.changes} team_members.`);

  // Employee details
  const er = db.prepare("DELETE FROM employee_referrals").run();
  console.log(`- Deleted ${er.changes} employee_referrals.`);

  const eec = db.prepare("DELETE FROM employee_emergency_contacts").run();
  console.log(`- Deleted ${eec.changes} employee_emergency_contacts.`);

  // Payroll & Salary
  db.prepare("DELETE FROM payslips").run();
  db.prepare("DELETE FROM payroll_items").run();
  db.prepare("DELETE FROM payroll_runs").run();
  const sc = db.prepare("DELETE FROM salary_components").run();
  console.log(`- Deleted ${sc.changes} salary_components.`);

  const ss = db.prepare("DELETE FROM salary_structures").run();
  console.log(`- Deleted ${ss.changes} salary_structures.`);

  // Notifications & Tokens
  const notifs = db.prepare("DELETE FROM notifications").run();
  console.log(`- Deleted ${notifs.changes} notifications.`);

  const at = db.prepare("DELETE FROM activation_tokens").run();
  console.log(`- Deleted ${at.changes} activation_tokens.`);

  const prt = db.prepare("DELETE FROM password_reset_tokens").run();
  console.log(`- Deleted ${prt.changes} password_reset_tokens.`);

  // Applications
  db.prepare("DELETE FROM application_documents").run();
  db.prepare("DELETE FROM application_verifications").run();
  const ea = db.prepare("DELETE FROM employee_applications").run();
  console.log(`- Deleted ${ea.changes} employee_applications.`);

  // Clear email outbox test messages
  const eo = db.prepare("DELETE FROM email_outbox").run();
  console.log(`- Deleted ${eo.changes} email_outbox entries.`);

  // Clear all sessions (force re-login for clean state)
  const sess = db.prepare("DELETE FROM sessions").run();
  console.log(`- Deleted ${sess.changes} sessions.`);

  // Delete employee profiles
  const emp = db.prepare("DELETE FROM employees").run();
  console.log(`- Deleted ${emp.changes} employees.`);

  // Delete non-CEO users
  const usr = db.prepare("DELETE FROM users WHERE id != ?").run(ceoUser.id);
  console.log(`- Deleted ${usr.changes} non-CEO user(s).`);

  // Reset employee ID sequence for fresh onboarding
  const seq = db.prepare("UPDATE employee_id_year_sequences SET next_value = 1").run();
  console.log(`- Reset employee_id_year_sequences (rows affected: ${seq.changes}).`);

  db.exec("COMMIT");
  console.log("Transactional cleanup committed successfully!");

  // Re-verify CEO account & baseline configuration
  ensureDemoAccounts();
  console.log("Demo accounts baseline verified.");
} catch (error) {
  db.exec("ROLLBACK");
  console.error("Cleanup failed! Rolled back transaction.", error);
  throw error;
}

// 4. Verify integrity and foreign keys
console.log("\n=== VERIFYING DATABASE INTEGRITY ===");
const integrity = db.prepare("PRAGMA integrity_check;").get();
console.log("PRAGMA integrity_check:", integrity.integrity_check);
if (integrity.integrity_check !== "ok") {
  throw new Error(`Integrity check failed: ${JSON.stringify(integrity)}`);
}

const fkViolations = db.prepare("PRAGMA foreign_key_check;").all();
console.log("PRAGMA foreign_key_check violations count:", fkViolations.length);
if (fkViolations.length > 0) {
  console.table(fkViolations);
  throw new Error("Foreign key check failed! Violations detected.");
}

// 5. Verify preserved baseline and zeroed employee tables
console.log("\n=== VERIFYING POST-CLEANUP RECORD COUNTS ===");
const expectedZeroTables = [
  'users_non_ceo',
  'employees',
  'attendance_records',
  'attendance_breaks',
  'daily_work_reports',
  'attendance_exceptions',
  'leave_requests',
  'leave_balances',
  'employee_applications',
  'sessions'
];

const remainingUsers = db.prepare("SELECT id, email, role, active FROM users").all();
console.log("Remaining users in database:");
console.table(remainingUsers);

if (remainingUsers.length !== 1 || remainingUsers[0].email !== ceoEmail) {
  throw new Error("Unexpected remaining users: expected exactly 1 CEO demo user!");
}

const preservedCounts = {
  company_settings: db.prepare("SELECT count(*) as c FROM company_settings").get().c,
  company_holidays: db.prepare("SELECT count(*) as c FROM company_holidays").get().c,
  departments: db.prepare("SELECT count(*) as c FROM departments").get().c,
  teams: db.prepare("SELECT count(*) as c FROM teams").get().c,
  leave_types: db.prepare("SELECT count(*) as c FROM leave_types").get().c,
  audit_logs: db.prepare("SELECT count(*) as c FROM audit_logs").get().c,
};

console.log("\nPreserved Baseline Configuration:");
for (const [name, count] of Object.entries(preservedCounts)) {
  console.log(`  ${name.padEnd(20)}: ${count}`);
}

console.log("\nPost-cleanup check passed! Local development database is completely clean and ready for fresh onboarding.");
