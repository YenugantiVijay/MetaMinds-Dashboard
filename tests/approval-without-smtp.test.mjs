import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer as createTcpServer } from "node:net";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { hashPassword } from "../src/domain.mjs";

async function freePort() {
  const listener = createTcpServer();
  await new Promise((resolve, reject) => listener.listen(0, "127.0.0.1", (error) => error ? reject(error) : resolve()));
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

test("CEO approval assigns an ID and activates a verified application without SMTP", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "meta-minds-no-smtp-test-"));
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    DATA_DIR: dataDir,
    PORT: String(port),
    APP_URL: "http://localhost:5173",
    NODE_ENV: "development",
  };
  for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_SECURE", "SMTP_USER", "SMTP_PASSWORD", "SMTP_FROM"]) {
    delete env[key];
  }
  const server = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "src/server.mjs"], {
    cwd: process.cwd(),
    env,
    stdio: "ignore",
  });
  let database;
  const cookies = {};

  async function request(path, { method = "GET", body, csrf } = {}) {
    const headers = { Origin: "http://localhost:5173" };
    if (Object.keys(cookies).length) {
      headers.Cookie = Object.entries(cookies).map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
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
    for (const entry of response.headers.getSetCookie()) {
      const [pair] = entry.split(";");
      const separator = pair.indexOf("=");
      const name = pair.slice(0, separator);
      const value = decodeURIComponent(pair.slice(separator + 1));
      if (!value || entry.includes("Max-Age=0")) delete cookies[name];
      else cookies[name] = value;
    }
    return { status: response.status, payload: await response.json() };
  }

  try {
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (server.exitCode !== null) throw new Error(`API exited before startup (${server.exitCode}).`);
      try {
        const response = await fetch(`${baseUrl}/api/health`);
        if (response.ok) {
          ready = true;
          break;
        }
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    assert.ok(ready, "API starts without SMTP configuration.");
    const health = await request("/api/health");
    assert.equal(health.payload.emailConfigured, false);
    const anonymous = await request("/api/auth/me");
    const started = await request("/api/applications/verification/start", {
      method: "POST",
      csrf: anonymous.payload.csrfToken,
      body: { fullName: "Synthetic Email Applicant" },
    });
    assert.equal(started.status, 200);
    const emailSend = await request("/api/applications/verification/email/send", {
      method: "POST",
      csrf: anonymous.payload.csrfToken,
      body: { email: "email-only@example.test" },
    });
    assert.equal(emailSend.status, 503);
    assert.match(emailSend.payload.error, /SMTP setup incomplete/);
    const removedPhoneSend = await request("/api/applications/verification/phone/send", {
      method: "POST",
      csrf: anonymous.payload.csrfToken,
      body: { mobile: "9000000000" },
    });
    assert.equal(removedPhoneSend.status, 404);

    database = new DatabaseSync(join(dataDir, "portal.sqlite"));
    database.prepare("INSERT INTO users(email, password_hash, role, active) VALUES (?, ?, 'ceo', 1)")
      .run("ceo@example.test", hashPassword("Synthetic CEO test password 5432!"));
    const insertApplication = database.prepare(`
      INSERT INTO employee_applications(reference, full_name, email, mobile, employment_type, position, department,
        proposed_joining_date, education, privacy_acknowledged_at, password_hash, email_verified_at, phone_verified_at)
      VALUES (?, ?, ?, ?, 'employee', ?, 'Engineering', '2026-11-01', '', ?, ?, ?, ?)
    `);
    const now = new Date().toISOString();
    const approvedApplicationId = Number(insertApplication.run(
      "MM-APP-SMTP-FREE", "Synthetic SMTP-Free Applicant", "smtp-free@example.test", "+919000000011",
      "Software Engineer", now, hashPassword("Synthetic applicant test password 8642!"), now, now,
    ).lastInsertRowid);
    const rejectedApplicationId = Number(insertApplication.run(
      "MM-APP-REJECT-FREE", "Synthetic Rejected Applicant", "reject-free@example.test", "+919000000012",
      "Test Engineer", now, hashPassword("Synthetic applicant test password 8643!"), now, now,
    ).lastInsertRowid);

    const publicSession = await request("/api/auth/me");
    const login = await request("/api/auth/login", {
      method: "POST",
      csrf: publicSession.payload.csrfToken,
      body: { identifier: "ceo@example.test", password: "Synthetic CEO test password 5432!" },
    });
    assert.equal(login.status, 200);
    const csrf = login.payload.csrfToken;

    const approved = await request(`/api/applications/${approvedApplicationId}/approve`, {
      method: "POST",
      csrf,
      body: {},
    });
    assert.equal(approved.status, 200, JSON.stringify(approved.payload));
    assert.match(approved.payload.employeeId, /^MM-\d{4}-\d{4}$/);
    assert.equal(approved.payload.emailQueued, false);
    assert.equal(database.prepare("SELECT status FROM employee_applications WHERE id = ?").get(approvedApplicationId).status, "approved");
    assert.equal(database.prepare("SELECT active FROM users WHERE email = ?").get("smtp-free@example.test").active, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM email_outbox").get().count, 0);

    const approvedApplications = await request("/api/applications?status=approved");
    assert.equal(approvedApplications.status, 200);
    assert.equal(approvedApplications.payload.find((row) => row.id === approvedApplicationId).employeeId, approved.payload.employeeId);

    const rejected = await request(`/api/applications/${rejectedApplicationId}/reject`, {
      method: "POST",
      csrf,
      body: { reason: "Synthetic rejection test" },
    });
    assert.equal(rejected.status, 200, JSON.stringify(rejected.payload));
    assert.equal(rejected.payload.emailQueued, false);
    assert.equal(database.prepare("SELECT status FROM employee_applications WHERE id = ?").get(rejectedApplicationId).status, "rejected");
  } finally {
    database?.close();
    if (server.exitCode === null) {
      server.kill("SIGTERM");
      await once(server, "exit");
    }
    rmSync(dataDir, { recursive: true, force: true });
  }
});
