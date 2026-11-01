import assert from "node:assert/strict";
import { createServer as createTcpServer } from "node:net";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

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

async function runVerification() {
  console.log("=== STARTING SERVER VERIFICATION ON CLEANED DEV DATABASE ===");
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  console.log(`Using port: ${port}, URL: ${baseUrl}`);

  const child = spawn("node", ["src/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      APP_URL: "http://localhost:5173",
      NODE_ENV: "development",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  child.stderr.on("data", (data) => console.error(`[Server stderr] ${data}`));

  // Wait for health check
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(200);
  }

  if (!ready) {
    child.kill("SIGKILL");
    throw new Error("Server failed to start on cleaned dev database.");
  }
  console.log("Server is healthy and ready.");

  const jar = {};
  let csrfToken = "";
  async function api(path, { method = "GET", body, csrf } = {}) {
    const headers = { Origin: "http://localhost:5173" };
    if (Object.keys(jar).length) {
      headers.Cookie = Object.entries(jar).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("; ");
    }
    if (method !== "GET") {
      headers["Content-Type"] = "application/json";
      const token = csrf || csrfToken;
      if (token) headers["X-CSRF-Token"] = token;
    }
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    applyCookies(jar, res);
    const rawText = await res.text();
    let payload = null;
    try { payload = JSON.parse(rawText); } catch { payload = rawText; }
    if (payload?.csrfToken) csrfToken = payload.csrfToken;
    return { status: res.status, payload };
  }

  try {
    // Bootstrap CSRF token
    console.log("0. Bootstrapping CSRF token from /api/auth/me...");
    const initMe = await api("/api/auth/me");
    console.log(`- /api/auth/me status: ${initMe.status}, user: ${initMe.payload.user}, csrfToken: ${initMe.payload.csrfToken ? "obtained" : "none"}`);
    csrfToken = initMe.payload.csrfToken;

    // 1. Verify previous employee CANNOT log in
    console.log("1. Verifying deleted employee account cannot log in...");
    const empLogin = await api("/api/auth/login", {
      method: "POST",
      body: { identifier: "vijaykumaryenuganti1@gmail.com", password: "Password@123" },
    });
    console.log(`- Employee login response:`, empLogin);
    assert.ok(empLogin.status === 401 || empLogin.status === 403, "Deleted employee must be rejected with 401 or 403");

    // 2. Verify CEO login via identifier + password
    console.log("2. Verifying CEO account login with credentials...");
    const ceoLogin = await api("/api/auth/login", {
      method: "POST",
      body: { identifier: "demo.ceo@metaminds.local", password: "Demo@Password123" },
    });
    console.log(`- CEO login response status: ${ceoLogin.status}`);
    assert.equal(ceoLogin.status, 200, "CEO demo account must log in successfully");
    assert.equal(ceoLogin.payload.user.role, "ceo", "User role must be ceo");
    csrfToken = ceoLogin.payload.csrfToken;
    assert.ok(csrfToken, "CSRF token must be provided");

    // 2b. Verify CEO demo-login endpoint as well
    console.log("2b. Verifying CEO /api/auth/demo-login endpoint...");
    const demoLogin = await api("/api/auth/demo-login", {
      method: "POST",
      body: { role: "ceo" },
    });
    console.log(`- CEO demo-login status: ${demoLogin.status} (expected 200)`);
    assert.equal(demoLogin.status, 200, "CEO demo-login must succeed");

    // 3. Verify CEO dashboard loads
    console.log("3. Verifying CEO dashboard endpoint...");
    const dashboard = await api("/api/dashboard");
    console.log(`- Dashboard status: ${dashboard.status}`);
    assert.equal(dashboard.status, 200, "CEO dashboard must return 200");
    assert.equal(dashboard.payload.role, "ceo", "Dashboard role must be ceo");
    assert.ok(dashboard.payload.settings, "Dashboard must return company settings");
    console.log(`- CEO role: ${dashboard.payload.role}`);

    // 4. Verify employee directory is empty
    console.log("4. Verifying employees list is empty...");
    const employees = await api("/api/employees");
    const empList = Array.isArray(employees.payload) ? employees.payload : employees.payload?.employees || [];
    console.log(`- Employees list count: ${empList.length} (expected 0)`);
    assert.equal(empList.length, 0, "No employees should exist");

    // 5. Verify daily work reports list is empty
    console.log("5. Verifying daily work reports list is empty...");
    const workReports = await api("/api/daily-work-reports");
    const reportsList = Array.isArray(workReports.payload) ? workReports.payload : workReports.payload?.reports || [];
    console.log(`- Daily work reports count: ${reportsList.length} (expected 0)`);
    assert.equal(reportsList.length, 0, "No daily work reports should exist");

    // 6. Verify applications list is empty
    console.log("6. Verifying applications list is empty...");
    const applications = await api("/api/applications");
    const appsList = Array.isArray(applications.payload) ? applications.payload : applications.payload?.applications || [];
    console.log(`- Applications count: ${appsList.length} (expected 0)`);
    assert.equal(appsList.length, 0, "No applications should exist");

    // 7. Verify clean logout
    console.log("7. Verifying CEO logout...");
    const logout = await api("/api/auth/logout", {
      method: "POST",
      csrf: csrfToken,
    });
    console.log(`- Logout status: ${logout.status} (expected 200)`);
    assert.equal(logout.status, 200, "Logout must succeed");

    console.log("\nALL VERIFICATION CHECKS PASSED ON CLEAN LIVE DEV DATABASE!");
  } finally {
    child.kill("SIGTERM");
  }
}

runVerification().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
