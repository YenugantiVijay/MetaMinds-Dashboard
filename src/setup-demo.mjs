import { randomBytes } from "node:crypto";

if (process.env.NODE_ENV === "production" || process.env.DEMO_SETUP_ENABLED !== "true") {
  throw new Error("Demo setup is disabled. Set DEMO_SETUP_ENABLED=true in a non-production environment to continue.");
}

const [{ db }, { hashPassword, makeCompanyEmployeeId }] = await Promise.all([
  import("./database.mjs"),
  import("./domain.mjs"),
]);

const ceoEmail = "demo.ceo@metaminds.local";
const leadEmail = "demo.lead@metaminds.local";
const existingCeo = db.prepare("SELECT role FROM users WHERE email = ? COLLATE NOCASE").get(ceoEmail);
if (existingCeo && existingCeo.role !== "ceo") {
  throw new Error(`${ceoEmail} already belongs to a non-CEO account. No account was changed.`);
}

const existingLead = db.prepare("SELECT id, role FROM users WHERE email = ? COLLATE NOCASE").get(leadEmail);
if (existingLead && existingLead.role !== "team_lead") {
  throw new Error(`${leadEmail} already belongs to a non-Team Lead account. No account was changed.`);
}
const existingLeadEmployee = existingLead && db.prepare("SELECT id FROM employees WHERE user_id = ?").get(existingLead.id);
if (existingLead && !existingLeadEmployee) {
  throw new Error(`${leadEmail} exists without an employee profile. No account was changed.`);
}

const ceoPassword = existingCeo ? null : randomBytes(18).toString("base64url");
const leadPassword = existingLead ? null : randomBytes(18).toString("base64url");
const proposedJoiningDate = new Date();
proposedJoiningDate.setDate(proposedJoiningDate.getDate() + 30);
const demoJoiningDate = proposedJoiningDate.toISOString().slice(0, 10);
let employeeId;
if (!existingLead) {
  const year = Number(new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date()));
  let sequence = 9000;
  employeeId = makeCompanyEmployeeId(year, sequence);
  while (db.prepare("SELECT 1 FROM employees WHERE employee_id = ?").get(employeeId)) {
    employeeId = makeCompanyEmployeeId(year, ++sequence);
  }
}

db.exec("BEGIN IMMEDIATE");
try {
  if (ceoPassword) {
    db.prepare("INSERT INTO users(email, password_hash, role, active) VALUES (?, ?, 'ceo', 1)")
      .run(ceoEmail, hashPassword(ceoPassword));
  }
  if (leadPassword) {
    db.prepare("INSERT OR IGNORE INTO departments(name) VALUES ('Demo Engineering')");
    const departmentId = db.prepare("SELECT id FROM departments WHERE name = 'Demo Engineering'").get().id;
    db.prepare("INSERT OR IGNORE INTO teams(name, department_id) VALUES ('Demo Engineering Team', ?)")
      .run(departmentId);
    const teamId = db.prepare("SELECT id FROM teams WHERE name = 'Demo Engineering Team'").get().id;
    const userResult = db.prepare("INSERT INTO users(email, password_hash, role, active) VALUES (?, ?, 'team_lead', 1)")
      .run(leadEmail, hashPassword(leadPassword));
    const employeeResult = db.prepare(`
      INSERT INTO employees(user_id, employee_id, full_name, employment_type, position, department_id, team_id, proposed_joining_date)
      VALUES (?, ?, 'Demo Team Lead', 'employee', 'Engineering Team Lead', ?, ?, ?)
    `).run(Number(userResult.lastInsertRowid), employeeId, departmentId, teamId, demoJoiningDate);
    db.prepare("INSERT INTO team_members(team_id, employee_id) VALUES (?, ?)")
      .run(teamId, Number(employeeResult.lastInsertRowid));
  }
  if (existingLeadEmployee && !db.prepare("SELECT 1 FROM attendance_records WHERE employee_id = ?").get(existingLeadEmployee.id)) {
    db.prepare("UPDATE employees SET proposed_joining_date = ? WHERE id = ?").run(demoJoiningDate, existingLeadEmployee.id);
    db.prepare("DELETE FROM attendance_exceptions WHERE employee_id = ?").run(existingLeadEmployee.id);
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

console.log("Local demo account setup complete.");
if (ceoPassword) {
  console.log(`CEO email: ${ceoEmail}`);
  console.log(`CEO password: ${ceoPassword}`);
} else {
  console.log(`CEO account already exists and was left unchanged: ${ceoEmail}`);
}
if (leadPassword) {
  console.log(`Team Lead email: ${leadEmail}`);
  console.log(`Team Lead password: ${leadPassword}`);
  console.log(`Team Lead employee ID: ${employeeId}`);
} else {
  console.log(`Team Lead account already exists and was left unchanged: ${leadEmail}`);
}
console.log("Both demo accounts have privileged access. Never expose them to production.");
