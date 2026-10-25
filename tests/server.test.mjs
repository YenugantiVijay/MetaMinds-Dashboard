import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import { createServer as createTcpServer } from "node:net";
import { spawn } from "node:child_process";
import { createDecipheriv } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "../src/domain.mjs";

let child;
let baseUrl;
let dataDir;
let adminDb;
let adminJar = {};
let employeeJar = {};
let adminCsrf = "";
let employeeCsrf = "";
let smtpServer;
let smtpMessages = [];

async function freePort() {
  const listener = createTcpServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
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

async function request(path, { jar, csrf, method = "GET", body } = {}) {
  const headers = { Origin: "http://localhost:5173" };
  if (jar && Object.keys(jar).length) headers.Cookie = Object.entries(jar).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join("; ");
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    headers["X-CSRF-Token"] = csrf;
  }
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (jar) applyCookies(jar, response);
  const payload = await response.json();
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
  throw new Error("Portal API did not start for integration tests.");
}

async function waitUntil(predicate, description) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`Timed out waiting for ${description}.`);
}

async function listen(server) {
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve()));
  return server.address().port;
}

async function startMockSmtp() {
  smtpServer = createTcpServer((socket) => {
    socket.setEncoding("utf8");
    socket.write("220 mock.local ESMTP\r\n");
    let buffered = "";
    let collectingMessage = false;
    let messageLines = [];
    socket.on("data", (chunk) => {
      buffered += chunk;
      let boundary = buffered.indexOf("\r\n");
      while (boundary !== -1) {
        const line = buffered.slice(0, boundary);
        buffered = buffered.slice(boundary + 2);
        if (collectingMessage) {
          if (line === ".") {
            smtpMessages.push(messageLines.join("\r\n"));
            messageLines = [];
            collectingMessage = false;
            socket.write("250 2.0.0 Message accepted\r\n");
          } else {
            messageLines.push(line.startsWith("..") ? line.slice(1) : line);
          }
        } else if (/^EHLO\b/i.test(line)) {
          socket.write("250-mock.local\r\n250 PIPELINING\r\n");
        } else if (/^HELO\b/i.test(line)) {
          socket.write("250 mock.local\r\n");
        } else if (line === "DATA") {
          collectingMessage = true;
          socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
        } else if (/^QUIT\b/i.test(line)) {
          socket.write("221 2.0.0 Bye\r\n");
          socket.end();
        } else {
          socket.write("250 2.0.0 OK\r\n");
        }
        boundary = buffered.indexOf("\r\n");
      }
    });
  });
  return listen(smtpServer);
}

function latestEmailOtp() {
  const message = smtpMessages.at(-1) ?? "";
  const match = message.match(/font-size:34px[^>]*>([A-HJ-NP-Z2-9]{6})<\/div>/);
  assert.ok(match, "Expected the latest email to contain a six-character verification code.");
  return match[1];
}

function latestPasswordResetToken(recipient) {
  const resetEmail = adminDb.prepare("SELECT encrypted_payload FROM email_outbox WHERE recipient = ? ORDER BY id DESC LIMIT 1").get(recipient);
  assert.ok(resetEmail, "Expected a password reset email to be queued.");
  const [resetIv, resetTag, resetCiphertext] = resetEmail.encrypted_payload.split(".").map((value) => Buffer.from(value, "base64url"));
  const resetDecipher = createDecipheriv("aes-256-gcm", readFileSync(join(dataDir, ".application-key")), resetIv);
  resetDecipher.setAuthTag(resetTag);
  const resetMessage = JSON.parse(Buffer.concat([resetDecipher.update(resetCiphertext), resetDecipher.final()]).toString("utf8"));
  const resetToken = resetMessage.text.match(/[?&]reset=([A-Za-z0-9_-]+)/)?.[1];
  assert.ok(resetToken, "Expected the reset email to contain a reset token.");
  return resetToken;
}

async function submitVerifiedApplication({ jar, csrf, name, email, employmentType, position }) {
  const started = await request("/api/applications/verification/start", {
    jar,
    csrf,
    method: "POST",
    body: { fullName: name },
  });
  assert.equal(started.status, 200, JSON.stringify(started.payload));
  const removedPhoneVerification = await request("/api/applications/verification/phone/send", {
    jar,
    csrf,
    method: "POST",
    body: { mobile: "9000000000" },
  });
  assert.equal(removedPhoneVerification.status, 404);
  const emailSent = await request("/api/applications/verification/email/send", {
    jar,
    csrf,
    method: "POST",
    body: { email },
  });
  assert.equal(emailSent.status, 200, JSON.stringify(emailSent.payload));
  const emailCode = latestEmailOtp();
  assert.match(emailCode, /[A-HJ-NP-Z]/);
  assert.match(emailCode, /[2-9]/);
  const emailVerified = await request("/api/applications/verification/email/verify", {
    jar,
    csrf,
    method: "POST",
    body: { code: emailCode },
  });
  assert.equal(emailVerified.status, 200, JSON.stringify(emailVerified.payload));
  return request("/api/applications", {
    jar,
    csrf,
    method: "POST",
    body: {
      employmentType,
      position,
      department: "Quality",
      proposedJoiningDate: "2026-11-01",
      education: "Synthetic test qualification",
      privacyAcknowledged: true,
      password: "Synthetic strong password 4321!",
    },
  });
}

before(async () => {
  smtpMessages = [];
  const smtpPort = await startMockSmtp();
  dataDir = mkdtempSync(join(tmpdir(), "meta-minds-portal-test-"));
  const oldDatabase = new DatabaseSync(join(dataDir, "portal.sqlite"));
  oldDatabase.exec(`
    CREATE TABLE email_outbox (
      id INTEGER PRIMARY KEY,
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      encrypted_payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      sent_at TEXT
    );
  `);
  oldDatabase.prepare("INSERT INTO email_outbox(recipient, subject, encrypted_payload) VALUES (?, ?, ?)")
    .run("preserved@example.test", "Legacy message", "encrypted-payload");
  oldDatabase.close();
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
      SMTP_ALLOW_INSECURE_LOCALHOST: "true",
      COMPANY_TIMEZONE: "Asia/Kolkata",
      SMTP_HOST: "127.0.0.1",
      SMTP_PORT: String(smtpPort),
      SMTP_FROM: "portal@example.test",
    },
    stdio: ["ignore", "ignore", "inherit"],
  });
  await waitForServer();
  adminDb = new DatabaseSync(join(dataDir, "portal.sqlite"));
  adminDb.prepare("INSERT INTO email_outbox(recipient, subject, encrypted_payload, status) VALUES (?, ?, ?, 'sending')")
    .run("test@example.test", "Synthetic migration test", "encrypted-payload");
  adminDb.prepare("INSERT INTO users(email, password_hash, role, active) VALUES (?, ?, 'ceo', 1)")
    .run("ceo@example.test", hashPassword("Test-only CEO password 9876!"));
  assert.deepEqual(adminDb.prepare("SELECT version FROM schema_migrations ORDER BY version").all().map((row) => row.version), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(adminDb.prepare("SELECT status FROM email_outbox WHERE recipient = ?").get("preserved@example.test").status, "pending");
  assert.equal(adminDb.prepare("SELECT status FROM email_outbox WHERE recipient = ?").get("test@example.test").status, "sending");
});

after(async () => {
  adminDb?.close();
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
  if (smtpServer?.listening) await new Promise((resolve) => smtpServer.close(resolve));
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
});

test("verified applications, CEO approval, employee/Team Lead accounts, attendance, and leave work end to end", async () => {
  const health = await request("/api/auth/me", { jar: adminJar });
  assert.equal(health.status, 200);
  adminCsrf = health.payload.csrfToken;

  const login = await request("/api/auth/login", {
    jar: adminJar,
    csrf: adminCsrf,
    method: "POST",
    body: { identifier: "ceo@example.test", password: "Test-only CEO password 9876!" },
  });
  assert.equal(login.status, 200);
  assert.equal(login.payload.user.role, "ceo");
  adminCsrf = login.payload.csrfToken;
  const ceoDashboard = await request("/api/dashboard", { jar: adminJar });
  assert.equal(ceoDashboard.payload.role, "ceo");
  assert.equal(ceoDashboard.payload.settings.scheduled_start, "10:00");
  assert.equal(ceoDashboard.payload.settings.scheduled_end, "18:00");
  assert.equal(ceoDashboard.payload.settings.expected_working_minutes, "480");
  assert.ok(Array.isArray(ceoDashboard.payload.attendanceReport));
  assert.ok(ceoDashboard.payload.attendanceReport.length > 300);
  assert.equal(login.payload.user.photoUrl, null);

  const leaveType = await request("/api/leave-types", {
    jar: adminJar,
    csrf: adminCsrf,
    method: "POST",
    body: { name: "Test leave", paid: false },
  });
  assert.equal(leaveType.status, 201);

  const settings = await request("/api/settings", {
    jar: adminJar,
    csrf: adminCsrf,
    method: "POST",
    body: {
      timezone: "Asia/Kolkata",
      scheduled_start: "10:00",
      scheduled_end: "17:00",
      expected_working_minutes: "",
      absence_warning_hours: "3",
    },
  });
  assert.equal(settings.status, 200);
  const settingsSnapshot = await request("/api/settings", { jar: adminJar });
  assert.equal(settingsSnapshot.payload.settings.employee_id_prefix, undefined);

  const publicSession = await request("/api/auth/me", { jar: employeeJar });
  employeeCsrf = publicSession.payload.csrfToken;
  const unverifiedApplication = await request("/api/applications", {
    jar: employeeJar, csrf: employeeCsrf, method: "POST",
    body: { employmentType: "employee", position: "QA analyst", proposedJoiningDate: "2026-11-01", privacyAcknowledged: true, password: "Synthetic strong password 4321!" },
  });
  assert.equal(unverifiedApplication.status, 401);

  const application = await submitVerifiedApplication({
    jar: employeeJar,
    csrf: employeeCsrf,
    name: "Synthetic Employee",
    email: "applicant@example.test",
    employmentType: "employee",
    position: "QA analyst",
  });
  assert.equal(application.status, 201);
  assert.match(application.payload.reference, /^MM-APP-[A-F0-9]+$/);
  const applicationRow = adminDb.prepare("SELECT status, mobile, password_hash, email_verified_at, phone_verified_at FROM employee_applications WHERE id = ?").get(application.payload.id);
  assert.equal(applicationRow.status, "pending");
  assert.equal(applicationRow.mobile, "");
  assert.ok(applicationRow.password_hash);
  assert.notEqual(applicationRow.password_hash, "Synthetic strong password 4321!");
  assert.ok(applicationRow.email_verified_at);
  assert.equal(applicationRow.phone_verified_at, null);
  assert.equal(application.payload.confirmationEmailQueued, true);
  await waitUntil(() => smtpMessages.some((message) => message.includes(application.payload.reference)), "the application confirmation email to be delivered");
  const confirmationOutbox = adminDb.prepare("SELECT encrypted_payload FROM email_outbox WHERE recipient = ? AND subject LIKE '%Application received%' ORDER BY id DESC LIMIT 1").get("applicant@example.test");
  assert.ok(confirmationOutbox);
  const [confirmationIv, confirmationTag, confirmationCiphertext] = confirmationOutbox.encrypted_payload.split(".").map((value) => Buffer.from(value, "base64url"));
  const confirmationDecipher = createDecipheriv("aes-256-gcm", readFileSync(join(dataDir, ".application-key")), confirmationIv);
  confirmationDecipher.setAuthTag(confirmationTag);
  const confirmationMessage = JSON.parse(Buffer.concat([confirmationDecipher.update(confirmationCiphertext), confirmationDecipher.final()]).toString("utf8"));
  assert.ok(confirmationMessage.html.includes(application.payload.reference));
  assert.ok(confirmationMessage.html.includes("not an offer of employment"), confirmationMessage.html.slice(-600));
  assert.equal(adminDb.prepare("SELECT id FROM users WHERE email = ?").get("applicant@example.test"), undefined);

  const duplicateSession = await request("/api/applications/verification/start", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { fullName: "Synthetic Duplicate" },
  });
  assert.equal(duplicateSession.status, 200);
  const duplicateEmail = await request("/api/applications/verification/email/send", {
    jar: employeeJar, csrf: employeeCsrf, method: "POST", body: { email: "applicant@example.test" },
  });
  assert.equal(duplicateEmail.status, 409);

  const forbidden = await request("/api/applications", { jar: employeeJar });
  assert.equal(forbidden.status, 401);

  const approved = await request(`/api/applications/${application.payload.id}/approve`, {
    jar: adminJar,
    csrf: adminCsrf,
    method: "POST",
    body: {},
  });
  assert.equal(approved.status, 200, JSON.stringify(approved.payload));
  const idYear = new Intl.DateTimeFormat("en", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date());
  assert.equal(approved.payload.employeeId, `MM-${idYear}-0001`);
  assert.equal(approved.payload.emailQueued, true);
  const provisioned = adminDb.prepare("SELECT id, active FROM users WHERE email = ?").get("applicant@example.test");
  assert.equal(provisioned.active, 1);
  const duplicateApproval = await request(`/api/applications/${application.payload.id}/approve`, {
    jar: adminJar,
    csrf: adminCsrf,
    method: "POST",
    body: {},
  });
  assert.equal(duplicateApproval.status, 409);

  const secondApplication = await submitVerifiedApplication({
    jar: employeeJar,
    csrf: employeeCsrf,
    name: "Synthetic Rejected Applicant",
    email: "rejected@example.test",
    employmentType: "intern",
    position: "Test intern",
  });
  assert.equal(secondApplication.status, 201);
  const rejected = await request(`/api/applications/${secondApplication.payload.id}/reject`, {
    jar: adminJar,
    csrf: adminCsrf,
    method: "POST",
    body: { reason: "Synthetic test decision" },
  });
  assert.equal(rejected.status, 200);
  assert.equal(rejected.payload.emailQueued, true);
  assert.equal(adminDb.prepare("SELECT status FROM employee_applications WHERE id = ?").get(secondApplication.payload.id).status, "rejected");

  const outbox = adminDb.prepare("SELECT encrypted_payload FROM email_outbox WHERE recipient = ? ORDER BY id DESC LIMIT 1").get("applicant@example.test");
  assert.ok(outbox);
  const [iv, tag, ciphertext] = outbox.encrypted_payload.split(".").map((value) => Buffer.from(value, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", readFileSync(join(dataDir, ".application-key")), iv);
  decipher.setAuthTag(tag);
  const message = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
  assert.ok(message.html.includes("your employee ID"));
  assert.ok(message.html.includes(approved.payload.employeeId));
  assert.equal(adminDb.prepare("SELECT password_hash FROM employee_applications WHERE id = ?").get(application.payload.id).password_hash, null);

  const applicationReferenceLogin = await request("/api/auth/login", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { identifier: application.payload.reference, password: "Synthetic strong password 4321!" },
  });
  assert.equal(applicationReferenceLogin.status, 401);

  const employeeLogin = await request("/api/auth/login", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { identifier: approved.payload.employeeId, password: "Synthetic strong password 4321!" },
  });
  assert.equal(employeeLogin.status, 200);
  assert.equal(employeeLogin.payload.user.role, "employee");
  employeeCsrf = employeeLogin.payload.csrfToken;
  const employeeDashboard = await request("/api/dashboard", { jar: employeeJar });
  assert.equal(employeeDashboard.payload.role, "employee");

  const privilegedData = await request("/api/applications", { jar: employeeJar });
  assert.equal(privilegedData.status, 403);

  const checkedIn = await request("/api/attendance/check-in", { jar: employeeJar, csrf: employeeCsrf, method: "POST", body: {} });
  assert.equal(checkedIn.status, 201);
  const duplicateCheckIn = await request("/api/attendance/check-in", { jar: employeeJar, csrf: employeeCsrf, method: "POST", body: {} });
  assert.equal(duplicateCheckIn.status, 409);
  const checkedOut = await request("/api/attendance/check-out", { jar: employeeJar, csrf: employeeCsrf, method: "POST", body: {} });
  assert.equal(checkedOut.status, 200);

  const leave = await request("/api/leave", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { leaveTypeId: 1, startDate: "2026-11-10", endDate: "2026-11-10", reason: "Synthetic test request" },
  });
  assert.equal(leave.status, 201);
  const ownApproval = await request(`/api/leave/${leave.payload.id}/approve`, { jar: employeeJar, csrf: employeeCsrf, method: "POST", body: {} });
  assert.equal(ownApproval.status, 403);

  const ceoLeaveApproval = await request(`/api/leave/${leave.payload.id}/approve`, { jar: adminJar, csrf: adminCsrf, method: "POST", body: {} });
  assert.equal(ceoLeaveApproval.status, 200);
  const approvedLeave = adminDb.prepare("SELECT status FROM leave_requests WHERE id = ?").get(leave.payload.id);
  assert.equal(approvedLeave.status, "approved");

  const missingResetEmail = await request("/api/auth/password-reset/request", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { email: "" },
  });
  assert.equal(missingResetEmail.status, 400);
  assert.equal(missingResetEmail.payload.error, "Work email is required.");
  const invalidResetEmail = await request("/api/auth/password-reset/request", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { email: "not-an-email" },
  });
  assert.equal(invalidResetEmail.status, 400);
  assert.equal(invalidResetEmail.payload.error, "Enter a valid work email address.");
  const unknownEmailReset = await request("/api/auth/password-reset/request", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { email: "not-registered@example.test" },
  });
  assert.equal(unknownEmailReset.status, 200);
  assert.equal(unknownEmailReset.payload.message, "If an active account matches that email and email delivery is configured, a reset link may be sent.");
  assert.equal(adminDb.prepare("SELECT id FROM password_reset_tokens WHERE user_id = (SELECT id FROM users WHERE email = 'not-registered@example.test')").get(), undefined);

  const staleResetRequest = await request("/api/auth/password-reset/request", {
    jar: employeeJar,
    csrf: "stale-csrf-token",
    method: "POST",
    body: { email: "applicant@example.test" },
  });
  assert.equal(staleResetRequest.status, 403);
  const csrfRefresh = await request("/api/auth/me", { jar: employeeJar });
  employeeCsrf = csrfRefresh.payload.csrfToken;
  assert.ok(employeeCsrf);
  const resetRequested = await request("/api/auth/password-reset/request", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { email: "applicant@example.test" },
  });
  assert.equal(resetRequested.status, 200);
  const resetToken = latestPasswordResetToken("applicant@example.test");

  const passwordReset = await request("/api/auth/password-reset", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { token: resetToken, password: "Test-only replacement password 2468!" },
  });
  assert.equal(passwordReset.status, 200);

  const expiredSession = await request("/api/auth/me", { jar: employeeJar });
  employeeCsrf = expiredSession.payload.csrfToken;
  assert.equal(expiredSession.payload.user, null);
  const reusedReset = await request("/api/auth/password-reset", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { token: resetToken, password: "Test-only another password 1234!" },
  });
  assert.equal(reusedReset.status, 400);

  const oldPassword = await request("/api/auth/login", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { identifier: "applicant@example.test", password: "Test-only employee password 5678!" },
  });
  assert.equal(oldPassword.status, 401);
  const newPassword = await request("/api/auth/login", {
    jar: employeeJar,
    csrf: employeeCsrf,
    method: "POST",
    body: { identifier: "applicant@example.test", password: "Test-only replacement password 2468!" },
  });
  assert.equal(newPassword.status, 200);
  const logout = await request("/api/auth/logout", {
    jar: employeeJar,
    csrf: newPassword.payload.csrfToken,
    method: "POST",
    body: {},
  });
  assert.equal(logout.status, 200);
  const refreshedSession = await request("/api/auth/me", { jar: employeeJar });
  const relogin = await request("/api/auth/login", {
    jar: employeeJar,
    csrf: refreshedSession.payload.csrfToken,
    method: "POST",
    body: { identifier: "applicant@example.test", password: "Test-only replacement password 2468!" },
  });
  assert.equal(relogin.status, 200);
  employeeCsrf = relogin.payload.csrfToken;

  const teamLeadJar = {};
  const teamLeadSession = await request("/api/auth/me", { jar: teamLeadJar });
  const teamLeadCsrf = teamLeadSession.payload.csrfToken;
  const teamLeadApplication = await submitVerifiedApplication({
    jar: teamLeadJar,
    csrf: teamLeadCsrf,
    name: "Synthetic Team Lead",
    email: "team-lead@example.test",
    employmentType: "employee",
    position: "Engineering lead",
  });
  assert.equal(teamLeadApplication.status, 201);
  const approvedLead = await request(`/api/applications/${teamLeadApplication.payload.id}/approve`, {
    jar: adminJar,
    csrf: adminCsrf,
    method: "POST",
    body: {},
  });
  assert.equal(approvedLead.status, 200);
  assert.equal(approvedLead.payload.emailQueued, true);
  const leadEmail = adminDb.prepare("SELECT encrypted_payload FROM email_outbox WHERE recipient = ? ORDER BY id DESC LIMIT 1")
    .get("team-lead@example.test");
  assert.ok(leadEmail);
  const [leadIv, leadTag, leadCiphertext] = leadEmail.encrypted_payload.split(".").map((value) => Buffer.from(value, "base64url"));
  const leadDecipher = createDecipheriv("aes-256-gcm", readFileSync(join(dataDir, ".application-key")), leadIv);
  leadDecipher.setAuthTag(leadTag);
  const leadMessage = JSON.parse(Buffer.concat([leadDecipher.update(leadCiphertext), leadDecipher.final()]).toString("utf8"));
  assert.ok(leadMessage.html.includes(approvedLead.payload.employeeId));

  const createdTeam = await request("/api/teams", {
    jar: adminJar,
    csrf: adminCsrf,
    method: "POST",
    body: { name: "Synthetic Product team" },
  });
  assert.equal(createdTeam.status, 201);
  const employeeRow = adminDb.prepare("SELECT id FROM employees WHERE user_id = (SELECT id FROM users WHERE email = ?)").get("applicant@example.test");
  const leadRow = adminDb.prepare("SELECT id FROM employees WHERE user_id = (SELECT id FROM users WHERE email = ?)").get("team-lead@example.test");
  const employeeAssignment = await request("/api/teams/assign", {
    jar: adminJar,
    csrf: adminCsrf,
    method: "POST",
    body: { teamId: createdTeam.payload.id, employeeId: employeeRow.id, role: "employee" },
  });
  assert.equal(employeeAssignment.status, 200);
  const leadAssignment = await request("/api/teams/assign", {
    jar: adminJar,
    csrf: adminCsrf,
    method: "POST",
    body: { teamId: createdTeam.payload.id, employeeId: leadRow.id, role: "team_lead" },
  });
  assert.equal(leadAssignment.status, 200);

  const teamLeadLogin = await request("/api/auth/login", {
    jar: teamLeadJar,
    csrf: teamLeadCsrf,
    method: "POST",
    body: { identifier: approvedLead.payload.employeeId, password: "Synthetic strong password 4321!" },
  });
  assert.equal(teamLeadLogin.status, 200);
  assert.equal(teamLeadLogin.payload.user.role, "team_lead");
  const teamLeadDashboard = await request("/api/dashboard", { jar: teamLeadJar });
  assert.equal(teamLeadDashboard.payload.role, "team_lead");
  assert.equal((await request("/api/applications", { jar: teamLeadJar })).status, 403);
  assert.equal((await request("/api/settings", { jar: teamLeadJar })).status, 403);
  assert.equal(teamLeadDashboard.payload.teamMembers, 2);
  const teamLeadDirectory = await request("/api/employees", { jar: teamLeadJar });
  assert.equal(teamLeadDirectory.status, 200);
  assert.equal(teamLeadDirectory.payload.length, 2);
  const demoAccountsResponse = await request("/api/auth/demo-accounts");
  assert.equal(demoAccountsResponse.status, 200);
  assert.equal(demoAccountsResponse.payload.enabled, true);
  assert.equal(demoAccountsResponse.payload.accounts.length, 2);

  const demoCeoJar = {};
  const meCeo = await request("/api/auth/me", { jar: demoCeoJar });
  const demoCeoLogin = await request("/api/auth/demo-login", {
    jar: demoCeoJar,
    csrf: meCeo.payload.csrfToken,
    method: "POST",
    body: { role: "ceo" },
  });
  assert.equal(demoCeoLogin.status, 200);
  assert.equal(demoCeoLogin.payload.user.role, "ceo");

  const demoEmpJar = {};
  const meEmp = await request("/api/auth/me", { jar: demoEmpJar });
  const demoEmpLogin = await request("/api/auth/demo-login", {
    jar: demoEmpJar,
    csrf: meEmp.payload.csrfToken,
    method: "POST",
    body: { role: "employee" },
  });
  assert.equal(demoEmpLogin.status, 200);
  assert.equal(demoEmpLogin.payload.user.role, "employee");
  assert.ok(demoEmpLogin.payload.user.employeeId);

  await waitUntil(
    () => adminDb.prepare("SELECT COUNT(*) AS count FROM email_outbox WHERE status = 'sending' AND recipient != ?").get("test@example.test").count === 0,
    "the current email delivery batch to finish",
  );
});

