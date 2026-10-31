import { db } from "./database.mjs";
import { ensureDemoAccounts } from "./demo-accounts.mjs";

console.log("Cleaning all real and dummy data from the portal database...");

db.exec("PRAGMA foreign_keys = OFF;");
db.exec("BEGIN IMMEDIATE;");
try {
  db.exec(`
    DELETE FROM attendance_records;
    DELETE FROM leave_approvals;
    DELETE FROM leave_requests;
    DELETE FROM leave_balances;
    DELETE FROM employee_applications;
    DELETE FROM application_documents;
    DELETE FROM application_verifications;
    DELETE FROM attendance_exceptions;
    DELETE FROM salary_components;
    DELETE FROM salary_structures;
    DELETE FROM payroll_items;
    DELETE FROM payroll_runs;
    DELETE FROM payslips;
    DELETE FROM team_members;
    DELETE FROM employee_emergency_contacts;
    DELETE FROM employee_referrals;
    DELETE FROM employees;
    DELETE FROM notifications;
    DELETE FROM audit_logs;
    DELETE FROM email_outbox;
    DELETE FROM password_reset_tokens;
    DELETE FROM activation_tokens;
    DELETE FROM sessions;
    DELETE FROM users WHERE role != 'ceo';
    DELETE FROM employee_id_sequences;
    DELETE FROM employee_id_year_sequences;
  `);
  db.exec("COMMIT;");
} catch (err) {
  db.exec("ROLLBACK;");
  throw err;
} finally {
  db.exec("PRAGMA foreign_keys = ON;");
}

// Re-ensure the CEO account exists
ensureDemoAccounts();

console.log("Database reset complete. All test data cleared. Ready for fresh user testing.");
