import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

function executeNode(args, env) {
  const result = spawnSync(process.execPath, ["--disable-warning=ExperimentalWarning", ...args], {
    cwd: process.cwd(), env, encoding: "utf8", timeout: 25_000,
  });
  if (result.error) throw result.error;
  return result;
}

test("full fresh-start removes employee applications, attendance and feed but preserves CEO, holidays and backup", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "mm-full-fresh-test-"));
  const env = { ...process.env,
    NODE_ENV: "development", DATA_DIR: dataDir, APP_URL: "http://localhost:5173",
  };
  const fixture = `
    import { db } from "./src/database.mjs";
    db.prepare("INSERT INTO users (id,email,role,password_hash,active) VALUES (1,?,'ceo','original-ceo-hash',1)")
      .run("demo.ceo@metaminds.local");
    db.prepare("INSERT INTO users(id,email,role,password_hash,active) VALUES (2,'employee@example.test','employee','synthetic-hash',1)").run();
    const empId = db.prepare("INSERT INTO employees(user_id,employee_id,full_name,employment_type,position,proposed_joining_date) VALUES(2,'MM-2026-9001','Synthetic Employee','employee','Engineer','2026-11-10')").run().lastInsertRowid;
    db.prepare("INSERT INTO attendance_records(employee_id,attendance_date,check_in) VALUES(?,'2026-11-10','2026-11-10T04:30:00Z')").run(empId);
    db.prepare("INSERT INTO leave_types(name,paid) VALUES('Test Leave',0)").run();
    const leaveType = db.prepare("SELECT id FROM leave_types WHERE name='Test Leave'").get().id;
    db.prepare("INSERT INTO leave_requests(employee_id,leave_type_id,start_date,end_date,reason) VALUES(? ,?,'2026-11-11','2026-11-11','Synthetic personal leave')").run(empId,leaveType);
    const app = db.prepare("INSERT INTO employee_applications (reference,full_name,email,mobile,employment_type,position,proposed_joining_date,privacy_acknowledged_at) VALUES('MM-APP-SYNTHETIC','Synthetic applicant','applicant@example.test','9999999999','employee', 'Tester','2026-11-20','2026-11-10T00:00:00Z')").run().lastInsertRowid;
    db.prepare("INSERT INTO application_documents(application_id,private_storage_key,original_name,mime_type,size_bytes) VALUES(?,'synthetic-private-key','demo.pdf','application/pdf',123)").run(app);
    db.prepare("INSERT INTO application_verifications(session_hash,full_name) VALUES('synthetic-session','Synthetic Pending Applicant')").run();
    db.prepare("INSERT INTO email_outbox(recipient,subject,encrypted_payload) VALUES('employee@example.test','Synthetic email','synthetic-ciphertext')").run();
    db.prepare("INSERT INTO notifications(user_id,category,title,message) VALUES(1,'attendance','Synthetic notice','Old feed record')").run();
    db.prepare("INSERT INTO audit_logs(actor_user_id,action,entity_type,entity_id) VALUES(2,'synthetic.event','employee',?)").run(String(empId));
    db.prepare("INSERT OR REPLACE INTO company_holidays(holiday_date,name,kind,created_by) VALUES('2027-02-01','Synthetic retained company holiday','ceo',2)").run();
    db.close();
  `;
  try {
    const setup = executeNode(["--input-type=module", "-e", fixture], env);
    assert.equal(setup.status, 0, setup.stderr);
    const preview = executeNode(["scripts/cleanup-employee-accounts.mjs", "--full-fresh"], env);
    assert.equal(preview.status, 0, preview.stderr);
    assert.match(preview.stdout, /COMPLETE FRESH-START RESET PREVIEW/);
    const before = new DatabaseSync(join(dataDir, "portal.sqlite"));
    assert.equal(before.prepare("SELECT COUNT(*) AS n FROM employees").get().n, 1);
    before.close();
    const refused = executeNode(["scripts/cleanup-employee-accounts.mjs", "--execute", "--full-fresh"], env);
    assert.notEqual(refused.status, 0, "Execution without explicit authorization must fail");
    const actual = executeNode([
      "scripts/cleanup-employee-accounts.mjs",
      "--execute", "--confirm-disposable-data", "--full-fresh",
    ], env);
    assert.equal(actual.status, 0, actual.stderr + "\n" + actual.stdout);

    const cleaned = new DatabaseSync(join(dataDir, "portal.sqlite"));
    for (const table of [
      "employees", "employee_applications", "application_verifications",
      "application_documents", "attendance_records", "leave_requests",
      "audit_logs", "notifications", "email_outbox", "sessions",
    ]) {
      assert.equal(cleaned.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n, 0, table);
    }
    assert.deepEqual(cleaned.prepare("SELECT id,email,role,password_hash,active FROM users").all(),
      [{id:1,email:"demo.ceo@metaminds.local",role:"ceo",password_hash:"original-ceo-hash",active:1}]);
    assert.equal(cleaned.prepare("PRAGMA foreign_key_check").all().length, 0);
    assert.equal(cleaned.prepare("SELECT name FROM company_holidays WHERE holiday_date='2027-02-01'").get().name,
      "Synthetic retained company holiday");
    assert.equal(cleaned.prepare("SELECT created_by FROM company_holidays WHERE holiday_date='2027-02-01'").get().created_by, null);
    assert.ok(cleaned.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get().n >= 15);
    cleaned.close();

    const backups = readdirSync(join(dataDir,"backups")).filter(n=>n.startsWith("pre-employee-reset-"));
    assert.equal(backups.length, 1);
    const previous = new DatabaseSync(join(dataDir,"backups",backups[0],"portal.sqlite"));
    assert.equal(previous.prepare("SELECT COUNT(*) AS n FROM employees").get().n, 1);
    assert.equal(previous.prepare("PRAGMA integrity_check").get().integrity_check, "ok");
    previous.close();
    assert.equal(readFileSync(join(dataDir, "backups",backups[0],".application-key")).length,32);
  } finally {
    rmSync(dataDir,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
});
