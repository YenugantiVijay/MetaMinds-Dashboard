import { db } from "./database.mjs";
import { hashPassword } from "./domain.mjs";

export const DEMO_CREDENTIALS = {
  ceo: {
    email: "demo.ceo@metaminds.local",
    role: "ceo",
    name: "Executive CEO",
    title: "Chief Executive Officer",
  },
};

export function ensureDemoAccounts() {
  db.exec("BEGIN IMMEDIATE");
  try {
    // Never silently reset an existing CEO password, role, or active state.
    const existingCeo = db.prepare("SELECT id, role FROM users WHERE email = ? COLLATE NOCASE").get(DEMO_CREDENTIALS.ceo.email);
    if (existingCeo && existingCeo.role !== "ceo") throw new Error("Reserved demo identity has an unexpected role.");
    // New demo creation requires explicit local setup; no source-controlled credentials.
    if (!existingCeo && process.env.NODE_ENV !== "production" && process.env.DEMO_SETUP_ENABLED === "true") {
      const password = process.env.DEMO_CEO_PASSWORD;
      if (typeof password !== "string" || password.length < 16) {
        throw new Error("Explicit demo setup requires a private DEMO_CEO_PASSWORD of at least 16 characters.");
      }
      db.prepare("INSERT INTO users(email, password_hash, role, active) VALUES (?, ?, 'ceo', 1)")
        .run(DEMO_CREDENTIALS.ceo.email, hashPassword(password));
    }

    // 2. Ensure Departments & Teams
    db.prepare("INSERT OR IGNORE INTO departments(name) VALUES ('Engineering')").run();
    db.prepare("INSERT OR IGNORE INTO departments(name) VALUES ('Product & Design')").run();
    db.prepare("INSERT OR IGNORE INTO departments(name) VALUES ('Operations')").run();
    const engineeringDept = db.prepare("SELECT id FROM departments WHERE name = 'Engineering'").get();

    db.prepare("INSERT OR IGNORE INTO teams(name, department_id) VALUES ('Core Engineering', ?)").run(engineeringDept.id);

    // 3. Ensure Leave Types
    db.prepare("INSERT OR IGNORE INTO leave_types(name, paid, active) VALUES ('Annual Leave', 1, 1)").run();
    db.prepare("INSERT OR IGNORE INTO leave_types(name, paid, active) VALUES ('Sick Leave', 1, 1)").run();
    db.prepare("INSERT OR IGNORE INTO leave_types(name, paid, active) VALUES ('Casual Leave', 1, 1)").run();
    db.prepare("INSERT OR IGNORE INTO leave_types(name, paid, active) VALUES ('Unpaid Leave', 0, 1)").run();

    // 4. Ensure Indian Public Holidays in company_holidays table
    db.prepare(`
      INSERT OR IGNORE INTO company_holidays(holiday_date, name) VALUES
        ('2026-01-26', 'Republic Day'),
        ('2026-03-04', 'Holi'),
        ('2026-03-21', 'Id-ul-Fitr'),
        ('2026-04-03', 'Good Friday'),
        ('2026-04-14', 'Dr. B.R. Ambedkar Jayanti'),
        ('2026-05-01', 'Maharashtra / May Day'),
        ('2026-05-31', 'Id-ul-Zuha (Bakrid)'),
        ('2026-08-15', 'Independence Day'),
        ('2026-09-04', 'Milad-un-Nabi'),
        ('2026-10-02', 'Mahatma Gandhi Jayanti'),
        ('2026-10-20', 'Dussehra (Vijayadashami)'),
        ('2026-11-08', 'Diwali (Deepavali)'),
        ('2026-11-24', 'Guru Nanak Jayanti'),
        ('2026-12-25', 'Christmas Day')
    `).run();

    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
