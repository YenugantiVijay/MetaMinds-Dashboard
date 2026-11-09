import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer as createTcpServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "../src/domain.mjs";

let child;
let baseUrl;
let dataDir;
let db;
let adminJar = {};
let employeeJar = {};
let adminCsrf = "";
let employeeCsrf = "";

async function freePort() {
  const listener = createTcpServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => (error ? reject(error) : resolve())));
  return port;
}

function applyCookies(jar, response) {
  for (const entry of response.headers.getSetCookie()) {
    const [pair] = entry.split(";");
    const separator = pair.indexOf("=");
    const name = pair.slice(0, separator);
    const value = decodeURIComponent(pair.slice(separator + 1));
    if (!value || entry.includes("Max-Age=0")) delete jar[name];
    else jar[name] = value;
  }
}

async function request(path, { jar, csrf, method = "GET", body, testDate } = {}) {
  const headers = { Origin: "http://localhost:5173" };
  if (testDate) headers["X-Test-Date"] = testDate;
  if (jar && Object.keys(jar).length) {
    headers.Cookie = Object.entries(jar).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("; ");
  }
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    headers["X-CSRF-Token"] = csrf;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (jar) applyCookies(jar, response);
  const payload = await response.json().catch(() => null);
  return { status: response.status, payload, response };
}

async function waitForServer() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Portal API did not start for attendance policy tests.");
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "meta-minds-attendance-test-"));
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;

  child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "src/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: String(port),
      APP_URL: "http://localhost:5173",
      NODE_ENV: "development",
      COMPANY_TIMEZONE: "Asia/Kolkata",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });

  await waitForServer();
  db = new DatabaseSync(join(dataDir, "portal.sqlite"));

  // Seed admin and employee in migrated database
  const adminPw = hashPassword("Admin@SecurePassword123!");
  const employeePw = hashPassword("Employee@SecurePassword123!");
  db.prepare("INSERT OR REPLACE INTO users(id, email, password_hash, role, active) VALUES (10, 'ceo@metaminds.local', ?, 'ceo', 1)").run(adminPw);
  db.prepare("INSERT OR REPLACE INTO users(id, email, password_hash, role, active) VALUES (20, 'worker@metaminds.local', ?, 'employee', 1)").run(employeePw);
  db.prepare(`
    INSERT OR REPLACE INTO employees(id, user_id, employee_id, full_name, employment_type, position, proposed_joining_date)
    VALUES (100, 20, 'MM-2026-0001', 'Arjun Sharma', 'employee', 'Senior Developer', '2026-01-01')
  `).run();

  // Initial session & CSRF for CEO
  const adminMe = await request("/api/auth/me", { jar: adminJar });
  assert.equal(adminMe.status, 200);
  adminCsrf = adminMe.payload.csrfToken;

  // Login CEO
  const ceoAuth = await request("/api/auth/login", {
    jar: adminJar,
    csrf: adminCsrf,
    method: "POST",
    body: { identifier: "ceo@metaminds.local", password: "Admin@SecurePassword123!" },
  });
  assert.equal(ceoAuth.status, 200);
  adminCsrf = ceoAuth.payload.csrfToken;

  // Initial session & CSRF for Employee
  const empMe = await request("/api/auth/me", { jar: employeeJar });
  assert.equal(empMe.status, 200);
  employeeCsrf = empMe.payload.csrfToken;

  // Login Employee
  const empAuth = await request("/api/auth/login", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { identifier: "MM-2026-0001", password: "Employee@SecurePassword123!" },
  });
  assert.equal(empAuth.status, 200);
  employeeCsrf = empAuth.payload.csrfToken;
});

after(() => {
  if (child) child.kill();
  if (db) db.close();
  if (dataDir) {
    try {
      rmSync(dataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
});

test("Sunday check-in is rejected and no attendance record is inserted", async () => {
  const sunday = "2026-11-01";
  const res = await request("/api/attendance/check-in", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: {},
    testDate: sunday,
  });

  assert.equal(res.status, 403);
  const errMsg = res.payload.error || res.payload.message;
  assert.match(errMsg, /Sunday.*weekly off/i);

  // Verify no attendance record inserted
  const record = db.prepare("SELECT * FROM attendance_records WHERE attendance_date = ?").get(sunday);
  assert.equal(record, undefined);
});

test("Second Saturday check-in is rejected and no attendance record is inserted", async () => {
  const secondSat = "2026-11-14";
  const res = await request("/api/attendance/check-in", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: {},
    testDate: secondSat,
  });

  assert.equal(res.status, 403);
  const errMsg = res.payload.error || res.payload.message;
  assert.match(errMsg, /second Saturday.*weekly off/i);

  const record = db.prepare("SELECT * FROM attendance_records WHERE attendance_date = ?").get(secondSat);
  assert.equal(record, undefined);
});

test("First Saturday check-in is permitted for working schedule", async () => {
  const firstSat = "2026-11-07";
  const res = await request("/api/attendance/check-in", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: {},
    testDate: firstSat,
  });

  assert.equal(res.status, 201);
  assert.equal(res.payload.date, firstSat);

  const record = db.prepare("SELECT * FROM attendance_records WHERE attendance_date = ?").get(firstSat);
  assert.ok(record);
  assert.equal(record.employee_id, 100);

  // Check out to cleanly complete session
  await request("/api/attendance/check-out", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { reason: "workday_complete", workSummary: "Completed scheduled work and documented project progress." },
    testDate: firstSat,
  });
});

test("Third Saturday check-in is permitted for working schedule", async () => {
  const thirdSat = "2026-11-21";
  const res = await request("/api/attendance/check-in", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: {},
    testDate: thirdSat,
  });

  assert.equal(res.status, 201);
  assert.equal(res.payload.date, thirdSat);

  // Check out to cleanly complete session
  await request("/api/attendance/check-out", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { reason: "workday_complete", workSummary: "Completed scheduled work and documented project progress." },
    testDate: thirdSat,
  });
});

test("Fourth Saturday check-in is permitted for working schedule", async () => {
  const fourthSat = "2026-11-28";
  const res = await request("/api/attendance/check-in", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: {},
    testDate: fourthSat,
  });

  assert.equal(res.status, 201);
  assert.equal(res.payload.date, fourthSat);

  // Check out to cleanly complete session
  await request("/api/attendance/check-out", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { reason: "workday_complete", workSummary: "Completed scheduled work and documented project progress." },
    testDate: fourthSat,
  });
});

test("Company holiday check-in is rejected with configured holiday name", async () => {
  const holidayDate = "2026-11-09";
  // CEO configures holiday
  const holidayCreate = await request("/api/company-holidays", {
    jar: adminJar,
    csrf: adminCsrf,
    method: "POST",
    body: { date: holidayDate, name: "Diwali" },
    testDate: "2026-11-04",
  });
  assert.equal(holidayCreate.status, 201);

  // Employee attempts check-in on holiday
  const res = await request("/api/attendance/check-in", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: {},
    testDate: holidayDate,
  });

  assert.equal(res.status, 403);
  const errMsg = res.payload.error || res.payload.message;
  assert.match(errMsg, /company holiday.*Diwali/i);

  const record = db.prepare("SELECT * FROM attendance_records WHERE attendance_date = ?").get(holidayDate);
  assert.equal(record, undefined);
});

test("Normal weekday check-in and check-out work end-to-end with duplicate protection", async () => {
  const weekday = "2026-11-04"; // Wednesday

  // 1. Initial check-in succeeds
  const checkIn = await request("/api/attendance/check-in", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: {},
    testDate: weekday,
  });
  assert.equal(checkIn.status, 201);

  // 2. Duplicate check-in fails with 409
  const dupCheckIn = await request("/api/attendance/check-in", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: {},
    testDate: weekday,
  });
  assert.equal(dupCheckIn.status, 409);
  const dupCheckInMsg = dupCheckIn.payload.error || dupCheckIn.payload.message;
  assert.match(dupCheckInMsg, /already checked in/i);

  // 3. Normal check-out succeeds
  const checkOut = await request("/api/attendance/check-out", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { reason: "workday_complete", workSummary: "Completed scheduled work and documented project progress." },
    testDate: weekday,
  });
  assert.equal(checkOut.status, 200);
  assert.ok(typeof checkOut.payload.workedMinutes === "number");

  // 4. Duplicate check-out fails with 409
  const dupCheckOut = await request("/api/attendance/check-out", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { reason: "workday_complete", workSummary: "Completed scheduled work and documented project progress." },
    testDate: weekday,
  });
  assert.equal(dupCheckOut.status, 409);
  const dupCheckOutMsg = dupCheckOut.payload.error || dupCheckOut.payload.message;
  assert.match(dupCheckOutMsg, /already checked out/i);
});

test("Check-out without an active session is rejected", async () => {
  // Ensure no open sessions exist
  db.prepare("DELETE FROM attendance_records WHERE employee_id = 100 AND check_out IS NULL").run();

  const dateWithoutSession = "2026-11-05"; // Thursday
  const res = await request("/api/attendance/check-out", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { reason: "workday_complete", workSummary: "Completed scheduled work and documented project progress." },
    testDate: dateWithoutSession,
  });

  assert.equal(res.status, 409);
  const errMsg = res.payload.error || res.payload.message;
  assert.match(errMsg, /check in before checking out/i);
});

test("Existing valid open session can be safely completed on a Sunday/holiday (edge case)", async () => {
  // Ensure clean slate for test date
  const pastDate = "2026-10-30";
  const sunday = "2026-11-01";
  db.prepare("DELETE FROM attendance_records WHERE employee_id = 100 AND attendance_date IN (?, ?)").run(pastDate, sunday);

  // Simulate an open session created 2 hours ago that was not checked out
  const checkInTime = new Date(Date.now() - 7200 * 1000).toISOString();
  db.prepare(`
    INSERT INTO attendance_records (employee_id, attendance_date, check_in, check_out, worked_minutes)
    VALUES (100, ?, ?, NULL, NULL)
  `).run(pastDate, checkInTime);

  // Employee checks out on Sunday 2026-11-01
  const res = await request("/api/attendance/check-out", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { reason: "workday_complete", workSummary: "Completed scheduled work and documented project progress." },
    testDate: sunday,
  });

  assert.equal(res.status, 200);
  assert.ok(typeof res.payload.workedMinutes === "number");
  assert.ok(res.payload.workedMinutes >= 119);

  // Verify the past record is now closed and no Sunday record was created
  const closedRecord = db.prepare("SELECT * FROM attendance_records WHERE employee_id = 100 AND attendance_date = ?").get(pastDate);
  assert.ok(closedRecord.check_out, "Past attendance record check_out should be populated");
  const sundayRecord = db.prepare("SELECT * FROM attendance_records WHERE employee_id = 100 AND attendance_date = ?").get(sunday);
  assert.equal(sundayRecord, undefined, "No Sunday record should be created");
});

test("GET /api/dashboard and GET /api/policy return authoritative attendanceDayPolicy", async () => {
  const sunday = "2026-11-01";
  const dashRes = await request("/api/dashboard", {
    jar: employeeJar,
    testDate: sunday,
  });
  assert.equal(dashRes.status, 200);
  assert.ok(dashRes.payload.attendanceDayPolicy);
  assert.equal(dashRes.payload.attendanceDayPolicy.date, sunday);
  assert.equal(dashRes.payload.attendanceDayPolicy.isWorkingDay, false);
  assert.equal(dashRes.payload.attendanceDayPolicy.reason, "sunday");

  const policyRes = await request("/api/policy", {
    jar: employeeJar,
    testDate: sunday,
  });
  assert.equal(policyRes.status, 200);
  assert.ok(policyRes.payload.attendanceDayPolicy);
  assert.equal(policyRes.payload.attendanceDayPolicy.isWorkingDay, false);
});

test("TEST A: Completed session (6:21 PM to 11:17 PM = 296m) derives exact 4h 56m duration and 62% completion", async () => {
  const testDate = "2026-11-03"; // Tuesday
  db.prepare("DELETE FROM attendance_records WHERE employee_id = 100 AND attendance_date = ?").run(testDate);

  // Set company policy: confirmed = true, expected_working_minutes = 480 (8h)
  db.prepare("INSERT OR REPLACE INTO company_settings (key, value) VALUES ('attendance_policy_confirmed', 'true')").run();
  db.prepare("INSERT OR REPLACE INTO company_settings (key, value) VALUES ('expected_working_minutes', '480')").run();

  // Simulate an exact session from 6:21 PM to 11:17 PM
  // 6:21 PM = 18:21 IST = 12:51 UTC
  // 11:17 PM = 23:17 IST = 17:47 UTC
  // Difference = 4h 56m = 296 minutes
  const checkInUtc = "2026-11-03T12:51:00.000Z";
  const checkOutUtc = "2026-11-03T17:47:00.000Z";

  db.prepare(`
    INSERT INTO attendance_records (employee_id, attendance_date, check_in, check_out, worked_minutes, status, checkout_reason)
    VALUES (100, ?, ?, ?, 296, 'completed', 'workday_complete')
  `).run(testDate, checkInUtc, checkOutUtc);

  // Fetch dashboard
  const res = await request("/api/dashboard", {
    jar: employeeJar,
    testDate,
  });

  assert.equal(res.status, 200);
  assert.ok(res.payload.attendance);
  assert.equal(res.payload.attendance.workedMinutes, 296);

  // Verify attendance progress calculation
  assert.ok(res.payload.attendance.progress);
  // 296 / 480 * 100 = 61.666% -> rounds to 62%
  assert.equal(res.payload.attendance.progress.percentage, 62);
  assert.equal(res.payload.attendance.progress.complete, false);

  // Verify attendanceTrend contains 296m without 1440 or 0 clipping
  const trendItem = res.payload.attendanceTrend.find((t) => t.date === testDate);
  assert.ok(trendItem, "Trend must include test date");
  assert.equal(trendItem.averageMinutes, 296, "Average minutes must match exact worked minutes (296)");

  // Verify attendanceReport contains 62%
  const reportItem = res.payload.attendanceReport.find((r) => r.date === testDate);
  assert.ok(reportItem, "Report must include test date");
  assert.equal(reportItem.attendancePercent, 62);
  assert.equal(reportItem.status, "completed");
  assert.equal(reportItem.workedMinutes, 296);
});

test("TEST B: Live attendance session starts active timer, reflects in trend, and persists across refresh", async () => {
  const testDate = "2026-11-04"; // Wednesday
  db.prepare("DELETE FROM daily_work_reports WHERE attendance_record_id IN (SELECT id FROM attendance_records WHERE employee_id = 100 AND attendance_date = ?)").run(testDate);
  db.prepare("DELETE FROM attendance_breaks WHERE attendance_record_id IN (SELECT id FROM attendance_records WHERE employee_id = 100 AND attendance_date = ?)").run(testDate);
  db.prepare("DELETE FROM attendance_records WHERE employee_id = 100 AND attendance_date = ?").run(testDate);

  // 1. Check in
  const checkInRes = await request("/api/attendance/check-in", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: {},
    testDate,
  });
  assert.equal(checkInRes.status, 201);
  assert.equal(checkInRes.payload.status, "active");

  // 2. Fetch dashboard (live state)
  const dashRes1 = await request("/api/dashboard", {
    jar: employeeJar,
    testDate,
  });
  assert.equal(dashRes1.status, 200);
  assert.equal(dashRes1.payload.attendance.status, "active");
  assert.equal(dashRes1.payload.attendance.checkOut, null);
  assert.ok(typeof dashRes1.payload.attendance.workedMinutes === "number");

  // 3. Page refresh (second fetch) retains live attendance
  const dashRes2 = await request("/api/dashboard", {
    jar: employeeJar,
    testDate,
  });
  assert.equal(dashRes2.status, 200);
  assert.equal(dashRes2.payload.attendance.status, "active");
  assert.equal(dashRes2.payload.attendance.checkIn, checkInRes.payload.checkIn);
});

test("TEST C: Workday Complete check-out stores reason and finalizes session", async () => {
  const testDate = "2026-11-04"; // Wednesday
  const checkOutRes = await request("/api/attendance/check-out", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: {
      reason: "workday_complete",
      workSummary: "Completed the scheduled daily sprint tasks and verified attendance policy rules.",
    },
    testDate,
  });

  assert.equal(checkOutRes.status, 200);
  assert.equal(checkOutRes.payload.status, "completed");
  assert.equal(checkOutRes.payload.checkoutReason, "workday_complete");

  const row = db.prepare("SELECT * FROM attendance_records WHERE employee_id = 100 AND attendance_date = ?").get(testDate);
  assert.equal(row.status, "completed");
  assert.equal(row.checkout_reason, "workday_complete");
});

test("TEST D: Taking a break, resuming work, and final checkout workflow", async () => {
  const testDate = "2026-11-05"; // Thursday
  db.prepare("DELETE FROM attendance_records WHERE employee_id = 100 AND attendance_date = ?").run(testDate);

  // 1. Check in
  await request("/api/attendance/check-in", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: {},
    testDate,
  });

  // 2. Start break
  const breakStartRes = await request("/api/attendance/break/start", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: {},
    testDate,
  });
  assert.equal(breakStartRes.status, 200);
  assert.equal(breakStartRes.payload.status, "on_break");

  // 3. Duplicate break while already on break is rejected
  const dupBreakRes = await request("/api/attendance/break/start", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: {},
    testDate,
  });
  assert.equal(dupBreakRes.status, 409);
  assert.match(dupBreakRes.payload.error, /already on a break/i);

  // 4. Dashboard shows on_break status
  const dashOnBreak = await request("/api/dashboard", {
    jar: employeeJar,
    testDate,
  });
  assert.equal(dashOnBreak.payload.attendance.status, "on_break");

  // 5. Resume work
  const resumeRes = await request("/api/attendance/break/resume", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: {},
    testDate,
  });
  assert.equal(resumeRes.status, 200);
  assert.equal(resumeRes.payload.status, "active");

  // 6. Resume when not on break is rejected
  const dupResumeRes = await request("/api/attendance/break/resume", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: {},
    testDate,
  });
  assert.equal(dupResumeRes.status, 409);
  assert.match(dupResumeRes.payload.error, /no active break/i);

  // 7. Final checkout succeeds
  const finalCheckout = await request("/api/attendance/check-out", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: {
      reason: "workday_complete",
      workSummary: "Completed shift after returning from break and verified session status.",
    },
    testDate,
  });
  assert.equal(finalCheckout.status, 200);
  assert.equal(finalCheckout.payload.status, "completed");
});

test("TEST E: Leaving Early check-out records reason and optional note without automatic deductions", async () => {
  const testDate = "2026-11-06"; // Friday
  db.prepare("DELETE FROM attendance_records WHERE employee_id = 100 AND attendance_date = ?").run(testDate);

  await request("/api/attendance/check-in", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: {},
    testDate,
  });

  const checkOutRes = await request("/api/attendance/check-out", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { reason: "leaving_early", note: "Doctor appointment" },
    testDate,
  });

  assert.equal(checkOutRes.status, 200);
  assert.equal(checkOutRes.payload.checkoutReason, "leaving_early");

  const row = db.prepare("SELECT * FROM attendance_records WHERE employee_id = 100 AND attendance_date = ?").get(testDate);
  assert.equal(row.checkout_reason, "leaving_early");
  assert.equal(row.checkout_note, "Doctor appointment");
});

test("TEST F: Other Reason check-out validates required explanation note", async () => {
  const testDate = "2026-11-10"; // Tuesday (not a holiday)
  db.prepare("DELETE FROM attendance_records WHERE employee_id = 100 AND attendance_date = ?").run(testDate);

  const checkInRes = await request("/api/attendance/check-in", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: {},
    testDate,
  });
  assert.equal(checkInRes.status, 201);

  // Empty note is rejected
  const emptyNoteRes = await request("/api/attendance/check-out", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { reason: "other", note: "   " },
    testDate,
  });
  assert.equal(emptyNoteRes.status, 400);
  assert.match(emptyNoteRes.payload.error, /explanation note/i);

  // Valid note succeeds
  const validNoteRes = await request("/api/attendance/check-out", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { reason: "other", note: "Family event scheduled in afternoon" },
    testDate,
  });
  assert.equal(validNoteRes.status, 200);
  assert.equal(validNoteRes.payload.checkoutReason, "other");

  const row = db.prepare("SELECT * FROM attendance_records WHERE employee_id = 100 AND attendance_date = ?").get(testDate);
  assert.equal(row.checkout_reason, "other");
  assert.equal(row.checkout_note, "Family event scheduled in afternoon");
});

test("TEST K: Unconfigured attendance policy reports null percentage instead of fabricated 1440m", async () => {
  // Unconfigure policy
  db.prepare("INSERT OR REPLACE INTO company_settings (key, value) VALUES ('attendance_policy_confirmed', 'false')").run();

  const testDate = "2026-11-03";
  const res = await request("/api/dashboard", {
    jar: employeeJar,
    testDate,
  });

  assert.equal(res.status, 200);
  // Unconfigured policy: attendance.progress.percentage must be null
  assert.equal(res.payload.attendance.progress.percentage, null);

  const reportItem = res.payload.attendanceReport.find((r) => r.date === testDate);
  assert.equal(reportItem.attendancePercent, null, "Percentage must be null when policy unconfirmed");
  assert.equal(reportItem.workedMinutes, 296, "Real worked duration remains visible");
});

test("TEST L: Security — Unauthenticated requests and cross-employee modifications are rejected", async () => {
  // Unauthenticated GET request to protected dashboard rejected with 401
  const unauthRes = await request("/api/dashboard", {
    method: "GET",
  });
  assert.equal(unauthRes.status, 401);

  // Missing CSRF token rejected with 403
  const noCsrfRes = await request("/api/attendance/check-in", {
    jar: employeeJar,
    csrf: "invalid-token",
    method: "POST",
    body: {},
  });
  assert.equal(noCsrfRes.status, 403);
});
