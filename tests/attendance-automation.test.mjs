import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import {
  runAttendanceAutomation, sessionDurations, nextWorkingDayDeadline,
  ATTENDANCE_TARGET_MINUTES, ATTENDANCE_WARNING_ELAPSED_MINUTES,
  ATTENDANCE_MAX_ELAPSED_MINUTES,
} from "../src/attendance-automation.mjs";

const start = "2026-11-16T04:30:00.000Z"; // Monday 10:00 AM Asia/Kolkata
const at = (minutes) => new Date(Date.parse(start) + minutes * 60_000).toISOString();

function fixture({ activatedAt = "2026-11-01T00:00:00.000Z" } = {}) {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE users(id INTEGER PRIMARY KEY, email TEXT NOT NULL, role TEXT NOT NULL, active INTEGER DEFAULT 1);
    CREATE TABLE employees(id INTEGER PRIMARY KEY, user_id INTEGER REFERENCES users(id));
    CREATE TABLE attendance_records (
      id INTEGER PRIMARY KEY, employee_id INTEGER REFERENCES employees(id),
      attendance_date TEXT, check_in TEXT, check_out TEXT, worked_minutes INTEGER,
      break_minutes INTEGER DEFAULT 0, status TEXT DEFAULT 'active',
      checkout_reason TEXT, checkout_note TEXT
    );
    CREATE TABLE attendance_breaks (
      id INTEGER PRIMARY KEY, attendance_record_id INTEGER REFERENCES attendance_records(id),
      break_start TEXT NOT NULL, break_end TEXT
    );
    CREATE TABLE attendance_automation_policy(id INTEGER PRIMARY KEY, activated_at TEXT);
    CREATE TABLE attendance_automation(
      attendance_record_id INTEGER PRIMARY KEY REFERENCES attendance_records(id),
      standard_notified_at TEXT, warning_notified_at TEXT, auto_closed_at TEXT,
      report_due_at TEXT, report_submitted_at TEXT, overdue_notified_at TEXT
    );
    INSERT INTO users VALUES (1, 'employee@example.test', 'employee', 1);
    INSERT INTO users VALUES (2, 'ceo@example.test', 'ceo', 1);
    INSERT INTO employees VALUES (1, 1);
    INSERT INTO attendance_records(id, employee_id, attendance_date, check_in)
    VALUES (17, 1, '2026-11-16', '${start}');
  `);
  db.prepare("INSERT INTO attendance_automation_policy VALUES (1, ?)").run(activatedAt);
  const notifications = [], emails = [], audits = [];
  function withTransaction(fn) {
    db.exec("BEGIN IMMEDIATE");
    try { const result = fn(); db.exec("COMMIT"); return result; }
    catch (error) { db.exec("ROLLBACK"); throw error; }
  }
  const options = {
    db, withTransaction,
    notifyUser: (...args) => notifications.push(args),
    queueEmail: (...args) => emails.push(args),
    audit: (...args) => audits.push(args),
    timezone: "Asia/Kolkata",
    holidays: new Map(),
  };
  const run = (minutes) => runAttendanceAutomation({ ...options, now: new Date(at(minutes)) });
  return { db, notifications, emails, audits, run };
}

test("policy uses 8 active, 9 elapsed, and 10 elapsed hours", () => {
  assert.equal(ATTENDANCE_TARGET_MINUTES, 480);
  assert.equal(ATTENDANCE_WARNING_ELAPSED_MINUTES, 540);
  assert.equal(ATTENDANCE_MAX_ELAPSED_MINUTES, 600);
});

test("tracked breaks delay the active-work milestone, not the 9-hour warning", () => {
  const f = fixture();
  f.db.prepare("INSERT INTO attendance_breaks(attendance_record_id, break_start, break_end) VALUES (17, ?, ?)")
    .run(at(30), at(60)); // 30-minute break
  assert.equal(sessionDurations(f.db, { id: 17, check_in: start }, at(480)).activeWorkMinutes, 450);
  assert.equal(f.run(480).standard, 0);
  assert.equal(f.run(510).standard, 1);
  assert.equal(f.run(510).standard, 0);
  assert.equal(f.run(540).warned, 1);
  assert.equal(f.run(541).warned, 0);
  assert.equal(f.emails.length, 1);
  assert.equal(f.db.prepare("SELECT warning_notified_at FROM attendance_automation WHERE attendance_record_id=17").get().warning_notified_at, at(540));
  f.db.close();
});

test("auto-closes at the exact ten-hour cutoff even when worker runs late", () => {
  const f = fixture();
  f.db.prepare("INSERT INTO attendance_breaks(attendance_record_id, break_start, break_end) VALUES (17, ?, NULL)")
    .run(at(525)); // break remains open at cutoff
  assert.equal(f.run(670).closed, 1);
  assert.equal(f.run(700).closed, 0);
  const record = f.db.prepare("SELECT * FROM attendance_records WHERE id=17").get();
  assert.equal(record.check_out, at(600));
  assert.equal(record.checkout_reason, "automatic_timeout");
  assert.equal(record.worked_minutes, 525);
  assert.equal(record.break_minutes, 75);
  assert.equal(f.db.prepare("SELECT break_end FROM attendance_breaks WHERE attendance_record_id=17").get().break_end, at(600));
  const status = f.db.prepare("SELECT report_due_at, report_submitted_at FROM attendance_automation WHERE attendance_record_id=17").get();
  assert.equal(status.report_due_at, "2026-11-17T18:29:00.000Z");
  assert.equal(status.report_submitted_at, null);
  assert.equal(f.emails.length, 1); // No stale nine-hour warning after the ten-hour cutoff.
  assert.equal(f.notifications.filter(x => x[0] === 1).length, 1);
  f.db.close();
});

test("pre-activation sessions are preserved and not retroactively auto-closed", () => {
  const f = fixture({ activatedAt: "2026-11-17T00:00:00.000Z" });
  assert.equal(f.run(700).closed, 0);
  assert.equal(f.db.prepare("SELECT check_out FROM attendance_records WHERE id=17").get().check_out, null);
  f.db.close();
});

test("overdue-report notices are sent once and do not alter attendance", () => {
  const f = fixture();
  f.run(600);
  const due = f.db.prepare("SELECT report_due_at FROM attendance_automation WHERE attendance_record_id=17").get().report_due_at;
  const deadlinePassed = new Date(Date.parse(due) + 60_000);
  const first = runAttendanceAutomation({ db: f.db,
    withTransaction: f.run ? ((fn) => { f.db.exec("BEGIN IMMEDIATE"); try { const v=fn(); f.db.exec("COMMIT"); return v; } catch(e) { f.db.exec("ROLLBACK"); throw e; } }) : null,
    notifyUser: (...a) => f.notifications.push(a), queueEmail: (...a) => f.emails.push(a),
    audit: (...a) => f.audits.push(a), timezone: "Asia/Kolkata", now: deadlinePassed,
  });
  assert.equal(first.overdue, 1);
  const afterFirst = f.db.prepare("SELECT overdue_notified_at FROM attendance_automation WHERE attendance_record_id=17").get();
  assert.ok(afterFirst.overdue_notified_at);
  const noticesBefore = f.notifications.length;
  // Restarting the worker against the same persisted database cannot notify twice.
  const second = f.run(2500);
  assert.equal(second.overdue, 0);
  assert.equal(f.notifications.length, noticesBefore);
  assert.equal(f.db.prepare("SELECT checkout_reason FROM attendance_records WHERE id=17").get().checkout_reason, "automatic_timeout");
  f.db.close();
});

test("pending report deadline skips second Saturday, Sunday, and company holidays", () => {
  const cutoff = "2026-11-13T15:00:00.000Z"; // Friday evening IST
  assert.equal(nextWorkingDayDeadline(cutoff, "Asia/Kolkata"), "2026-11-16T18:29:00.000Z");
  const holidays = new Map([["2026-11-16", "Scheduled company holiday"]]);
  assert.equal(nextWorkingDayDeadline(cutoff, "Asia/Kolkata", holidays), "2026-11-17T18:29:00.000Z");
});
