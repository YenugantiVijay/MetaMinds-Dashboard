import { db, dataDir } from "../src/database.mjs";

console.log("Database dataDir:", dataDir);

console.log("\n--- USERS ---");
const users = db.prepare("SELECT id, email, role, active, created_at FROM users").all();
console.table(users);

console.log("\n--- EMPLOYEES (Summary) ---");
const employees = db.prepare("SELECT id, user_id, employee_id, full_name, employment_type, position, department_id, team_id, proposed_joining_date FROM employees").all();
console.table(employees);

console.log("\n--- SESSIONS ---");
const sessions = db.prepare("SELECT s.token_hash, s.user_id, u.email, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id").all();
console.table(sessions);

console.log("\n--- TABLE ROW COUNTS ---");
const allTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
for (const table of allTables) {
  const row = db.prepare(`SELECT count(*) as c FROM "${table.name}"`).get();
  console.log(`${table.name.padEnd(32)}: ${row.c}`);
}
