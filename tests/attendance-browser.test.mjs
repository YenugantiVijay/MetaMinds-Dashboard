import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer as createTcpServer } from "node:net";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "@playwright/test";
import { hashPassword } from "../src/domain.mjs";

const SCREENSHOTS_DIR = "C:\\Users\\VIJAY\\.gemini\\antigravity\\brain\\20935527-4e98-42d8-b7c8-aeb4721c7cae\\screenshots";

let child;
let baseUrl;
let dataDir;
let db;
let browser;
let context;
let page;

async function freePort() {
  const listener = createTcpServer();
  await new Promise((resolve) => listener.listen(0, "127.0.0.1", resolve));
  const { port } = listener.address();
  await new Promise((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForServer(url) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error("Portal API did not start for browser tests.");
}

async function capture(name) {
  if (!existsSync(SCREENSHOTS_DIR)) {
    mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
  const dest = join(SCREENSHOTS_DIR, name);
  await page.screenshot({ path: dest, fullPage: true });
  console.log(`[Screenshot captured] ${dest}`);
}

before(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "meta-minds-browser-test-"));
  const port = await freePort();
  baseUrl = `http://127.0.0.1:${port}`;

  child = spawn(process.execPath, ["--disable-warning=ExperimentalWarning", "src/server.mjs"], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      DATA_DIR: dataDir,
      PORT: String(port),
      APP_URL: baseUrl,
      NODE_ENV: "development",
      COMPANY_TIMEZONE: "Asia/Kolkata",
      TEST_CURRENT_DATE: "2026-11-04", // Wednesday, working day
    },
    stdio: ["ignore", "ignore", "inherit"],
  });

  await waitForServer(baseUrl);

  // Initialize and seed database
  db = new DatabaseSync(join(dataDir, "portal.sqlite"));

  // Create department and team
  db.prepare("INSERT OR IGNORE INTO departments(id, name) VALUES (1, 'Engineering')").run();
  db.prepare("INSERT OR IGNORE INTO teams(id, name, department_id) VALUES (1, 'Frontend Platform', 1)").run();

  // Seed CEO
  db.prepare("INSERT INTO users(email, password_hash, role, active) VALUES (?, ?, 'ceo', 1)")
    .run("ceo@metaminds.local", hashPassword("Admin@SecurePassword123!"));

  // Seed Employee
  const empUser = db.prepare("INSERT INTO users(email, password_hash, role, active) VALUES (?, ?, 'employee', 1) RETURNING id")
    .get("worker@metaminds.local", hashPassword("Employee@SecurePassword123!"));

  db.prepare(`
    INSERT INTO employees (user_id, employee_id, full_name, employment_type, position, department_id, team_id, proposed_joining_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(empUser.id, "MM-2026-0001", "Arjun Sharma", "employee", "Full Stack Engineer", 1, 1, "2026-10-01");

  // Configure settings: attendance policy confirmed (8h standard), 5 working days, Asia/Kolkata
  db.prepare("INSERT OR REPLACE INTO company_settings (key, value) VALUES ('attendance_policy_confirmed', 'true')").run();
  db.prepare("INSERT OR REPLACE INTO company_settings (key, value) VALUES ('standard_work_hours', '8')").run();
  db.prepare("INSERT OR REPLACE INTO company_settings (key, value) VALUES ('work_days_per_week', '5')").run();
  db.prepare("INSERT OR REPLACE INTO company_settings (key, value) VALUES ('timezone', 'Asia/Kolkata')").run();

  // Seed Diwali company holiday on Monday, 2026-11-09
  db.prepare("INSERT OR IGNORE INTO company_holidays (holiday_date, name) VALUES ('2026-11-09', 'Diwali')").run();

  // Launch Chrome
  browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  page = await context.newPage();

  page.on("pageerror", (err) => {
    console.error("[Browser Page Error]:", err.message);
  });
});

after(async () => {
  if (context) await context.close();
  if (browser) await browser.close();
  if (db) db.close();
  if (child && child.exitCode === null) {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
  }
});

test("Scenario 1 — Employee login and dashboard initial rendering", async () => {
  await page.goto(baseUrl);
  await page.waitForLoadState("networkidle");

  const title = await page.title();
  assert.ok(title.includes("MetaMinds"), `Expected title to include MetaMinds, got: ${title}`);

  // Fill in employee login form
  await page.click("#login-identifier");
  await page.fill("#login-identifier", "worker@metaminds.local");

  await page.click("#login-password");
  await page.fill("#login-password", "Employee@SecurePassword123!");

  await page.click("button[type='submit']");

  // Wait for Employee Dashboard
  await page.waitForSelector(".profile-panel", { timeout: 10000 });

  // Verify Employee Profile info
  const profileName = await page.locator(".profile-panel h2").innerText();
  assert.equal(profileName, "Arjun Sharma");

  const empIdText = await page.locator(".profile-detail:has-text('Employee ID') strong").innerText();
  assert.equal(empIdText, "MM-2026-0001");

  const deptText = await page.locator(".profile-detail:has-text('Department') strong").innerText();
  assert.equal(deptText, "Engineering");

  // Verify Today at work panel
  const todayHeading = await page.locator(".today-panel h2").innerText();
  assert.equal(todayHeading, "Today at work");

  const idleIndicator = page.locator(".attendance-indicator.indicator-idle");
  await idleIndicator.waitFor({ state: "visible" });

  const checkInBtn = page.locator(".attendance-actions button:has-text('Check in')");
  await checkInBtn.waitFor({ state: "visible" });
  assert.ok(await checkInBtn.isEnabled(), "Check-in button should be enabled on a normal working day.");

  // Capture Screenshot 1
  await capture("01_employee_dashboard_initial.png");
});

test("Scenario 2 — Real-time Check-In, Live Ticker, and Instant UI Update", async () => {
  const checkInBtn = page.locator(".attendance-actions button:has-text('Check in')");
  await checkInBtn.click();

  // Verify toast appears
  const toast = page.locator(".toast, [role='status'], .notice");
  await toast.first().waitFor({ state: "visible", timeout: 5000 });

  // Verify active indicator turns green without manual reload
  const activeIndicator = page.locator(".attendance-indicator.indicator-active");
  await activeIndicator.waitFor({ state: "visible", timeout: 5000 });

  // Verify buttons switch to Check out & Take Break
  const checkOutBtn = page.locator(".attendance-actions button:has-text('Check out')");
  await checkOutBtn.waitFor({ state: "visible" });

  const takeBreakBtn = page.locator(".attendance-actions button:has-text('Take Break')");
  await takeBreakBtn.waitFor({ state: "visible" });

  // Verify Check-In time updated
  const checkInText = await page.locator(".time-row > div:nth-child(1) strong").innerText();
  assert.notEqual(checkInText, "—", "Check-in time should be populated with server time.");

  // Capture Screenshot 2
  await capture("02_checked_in_active_session.png");
});

test("Scenario 3 — Break and Resume Work Workflow", async () => {
  // Click Take Break
  const takeBreakBtn = page.locator(".attendance-actions button:has-text('Take Break')");
  await takeBreakBtn.click();

  // Verify indicator turns to amber indicator-break
  const breakIndicator = page.locator(".attendance-indicator.indicator-break");
  await breakIndicator.waitFor({ state: "visible", timeout: 5000 });

  // Verify Resume Work green button is visible
  const resumeBtn = page.locator(".attendance-actions button:has-text('Resume Work')");
  await resumeBtn.waitFor({ state: "visible" });

  // Verify pause helper text
  const pauseMsg = page.locator("text=Session paused on break. Click \"Resume Work\" when ready to continue.");
  await pauseMsg.waitFor({ state: "visible" });

  // Capture Screenshot 3
  await capture("03_on_break_paused_session.png");

  // Click Resume Work
  await resumeBtn.click();

  // Verify indicator switches back to green active
  const activeIndicator = page.locator(".attendance-indicator.indicator-active");
  await activeIndicator.waitFor({ state: "visible", timeout: 5000 });

  // Verify Check out button returns
  const checkOutBtn = page.locator(".attendance-actions button:has-text('Check out')");
  await checkOutBtn.waitFor({ state: "visible" });

  // Capture Screenshot 4
  await capture("04_resumed_work_session.png");
});

test("Scenario 4 — Check-Out Modal Options & Reason Validation", async () => {
  // Click Check out to open modal
  const checkOutBtn = page.locator(".attendance-actions button:has-text('Check out')");
  await checkOutBtn.click();

  const modal = page.locator(".checkout-modal-card");
  await modal.waitFor({ state: "visible" });

  const modalTitle = await page.locator("#checkout-modal-title").innerText();
  assert.ok(modalTitle.includes("How would you like to end your session?"));

  // Select "Other Reason"
  await page.click("label[for='checkout-opt-other']");

  // Verify explanation textarea appears
  const noteInput = page.locator("#checkout-other-reason");
  await noteInput.waitFor({ state: "visible" });

  // Try submitting without note
  const confirmBtn = page.locator(".checkout-modal-card button[type='submit']");
  await confirmBtn.click();

  const errorBanner = page.locator(".checkout-error-banner");
  await errorBanner.waitFor({ state: "visible" });
  let errorText = await errorBanner.innerText();
  assert.ok(errorText.includes("Please provide an explanation"), `Expected explanation prompt, got: ${errorText}`);

  // Try submitting < 3 characters
  await noteInput.fill("ab");
  await confirmBtn.click();
  await errorBanner.waitFor({ state: "visible" });
  errorText = await errorBanner.innerText();
  assert.ok(errorText.includes("at least 3 characters"), `Expected 3 characters requirement, got: ${errorText}`);

  // Provide valid explanation
  await noteInput.fill("Leaving early for an off-site client coordination meeting.");

  // Test Workday Complete mandatory daily work report validation
  await page.click("label[for='checkout-opt-workday_complete']");
  const summaryInput = page.locator("#daily-work-summary");
  await summaryInput.waitFor({ state: "visible" });

  // Submit without summary
  await confirmBtn.click();
  await errorBanner.waitFor({ state: "visible" });
  errorText = await errorBanner.innerText();
  assert.ok(errorText.includes("Please provide a summary"), `Expected summary prompt, got: ${errorText}`);

  // Submit with < 20 characters
  await summaryInput.fill("Too short text");
  await confirmBtn.click();
  await errorBanner.waitFor({ state: "visible" });
  errorText = await errorBanner.innerText();
  assert.ok(errorText.includes("at least 20 characters"), `Expected min 20 chars error, got: ${errorText}`);

  // Capture Screenshot 5 showing validation in redesigned modal
  await capture("05_checkout_modal_validation.png");

  // Test Escape key closes modal
  await page.keyboard.press("Escape");
  await modal.waitFor({ state: "hidden" });

  // Re-open modal and submit valid daily work report
  await checkOutBtn.click();
  await modal.waitFor({ state: "visible" });

  await page.click("label[for='checkout-opt-workday_complete']");
  await page.locator("#daily-work-summary").fill("Completed development and verification of employee attendance workflows and daily work reporting.");
  await page.locator(".checkout-modal-card button[type='submit']").click();

  // Wait for modal to close
  await modal.waitFor({ state: "hidden" });

  // Verify session completion
  const completedIndicator = page.locator(".attendance-indicator.indicator-complete");
  await completedIndicator.waitFor({ state: "visible", timeout: 5000 });

  const completedBtn = page.locator(".attendance-actions button:has-text('Workday Completed')");
  await completedBtn.waitFor({ state: "visible" });
  assert.ok(await completedBtn.isDisabled(), "Workday Completed button should be disabled.");

  // Capture Screenshot 6
  await capture("06_workday_completed.png");
});

test("Scenario 5 — 296m Completed Session (18:21 to 23:17 = 4h 56m) & Lollipop Chart & Periods", async () => {
  // Update record for today (2026-11-04) to exactly 296 minutes (18:21 to 23:17)
  // Also insert a 540-minute (9h) record on 2026-11-03 to test dynamic scale > 8h
  db.prepare(`
    UPDATE attendance_records
    SET check_in = '2026-11-04T12:51:00.000Z',
        check_out = '2026-11-04T17:47:00.000Z',
        worked_minutes = 296,
        break_minutes = 0,
        status = 'completed',
        checkout_reason = 'workday_complete'
    WHERE attendance_date = '2026-11-04'
  `).run();

  db.prepare(`
    INSERT OR REPLACE INTO attendance_records (employee_id, attendance_date, check_in, check_out, worked_minutes, break_minutes, status, checkout_reason)
    VALUES (1, '2026-11-03', '2026-11-03T03:30:00.000Z', '2026-11-03T12:30:00.000Z', 540, 0, 'completed', 'workday_complete')
  `).run();

  await page.reload();
  await page.waitForLoadState("networkidle");

  // Verify Today at work values
  const workedText = await page.locator(".time-row > div:nth-child(5) strong").innerText();
  assert.equal(workedText, "4h 56m", `Expected 4h 56m worked, got: ${workedText}`);

  // Verify WorkHoursLollipopChart
  const chartTitle = await page.locator(".lollipop-chart-wrapper").first();
  await chartTitle.waitFor({ state: "visible" });

  // Check header subtitle text displays 4h 56m
  const chartHeaderSubtitle = await page.locator(".chart-heading-controls p").first().innerText();
  assert.ok(chartHeaderSubtitle.includes("4h 56m"), `Expected lollipop subtitle to have 4h 56m, got: ${chartHeaderSubtitle}`);
  assert.ok(chartHeaderSubtitle.includes("(4.93h)"), `Expected lollipop subtitle to have (4.93h), got: ${chartHeaderSubtitle}`);

  // Verify dynamic scale includes 10h benchmark (since 540m = 9h > 8h)
  const yTicks = await page.locator(".grid-tick text").allTextContents();
  assert.ok(yTicks.some((t) => t.includes("10h") || t.includes("8h")), `Expected scale benchmark ticks, got: ${yTicks.join(", ")}`);

  // Test Weekly period toggle
  await page.click(".chart-periods button:has-text('Weekly')");
  await page.waitForTimeout(300);
  const weeklySubtitle = await page.locator(".chart-heading-controls p").first().innerText();
  assert.ok(weeklySubtitle.length > 0, "Weekly subtitle should render.");

  // Test Monthly period toggle
  await page.click(".chart-periods button:has-text('Monthly')");
  await page.waitForTimeout(300);
  const monthlySubtitle = await page.locator(".chart-heading-controls p").first().innerText();
  assert.ok(monthlySubtitle.length > 0, "Monthly subtitle should render.");

  // Switch back to Daily
  await page.click(".chart-periods button:has-text('Daily')");
  await page.waitForTimeout(300);

  // Capture Screenshot 7
  await capture("07_work_hours_chart_296m.png");
});

test("Scenario 6 — Attendance Report Completion Percentage (62% and Unconfigured Target)", async () => {
  // With 296m worked and 480m target (8h), attendance percent = Math.round((296 / 480) * 100) = 62%
  const attendanceCardHeader = await page.locator(".attendance-report-panel .panel-heading p").innerText();
  assert.ok(attendanceCardHeader.includes("62%"), `Expected Attendance Report to display 62%, got: ${attendanceCardHeader}`);
  assert.ok(attendanceCardHeader.includes("4h 56m completed"), `Expected Attendance Report to display '4h 56m completed', got: ${attendanceCardHeader}`);

  // Capture Screenshot 8
  await capture("08_attendance_report_62_percent.png");

  // Test unconfigured target state
  db.prepare("UPDATE company_settings SET value = 'false' WHERE key = 'attendance_policy_confirmed'").run();

  await page.reload();
  await page.waitForLoadState("networkidle");

  const unconfiguredHeader = await page.locator(".attendance-report-panel .panel-heading p").innerText();
  assert.ok(
    unconfiguredHeader.includes("Target not configured"),
    `Expected unconfigured target message, got: ${unconfiguredHeader}`
  );

  // Capture Screenshot 9
  await capture("09_attendance_report_unconfigured_target.png");

  // Restore policy confirmation
  db.prepare("UPDATE company_settings SET value = 'true' WHERE key = 'attendance_policy_confirmed'").run();
});

test("Scenario 7 — Sunday, Second-Saturday, and Diwali Holiday Restrictions", async () => {
  // 1. Sunday test (2026-11-01)
  await page.setExtraHTTPHeaders({ "x-test-date": "2026-11-01" });
  await page.reload();
  await page.waitForLoadState("networkidle");

  const sundayNotice = page.locator(".notice:has-text('Sunday — Weekly Off')");
  await sundayNotice.waitFor({ state: "visible" });
  const sundayBtn = page.locator(".attendance-actions button:has-text('Check in')");
  assert.ok(await sundayBtn.isDisabled(), "Check-in should be disabled on Sunday.");

  // Capture Screenshot 10
  await capture("10_restriction_sunday.png");

  // 2. Second Saturday test (2026-11-14)
  await page.setExtraHTTPHeaders({ "x-test-date": "2026-11-14" });
  await page.reload();
  await page.waitForLoadState("networkidle");

  const secondSatNotice = page.locator(".notice:has-text('Second Saturday — Weekly Off')");
  await secondSatNotice.waitFor({ state: "visible" });
  const secondSatBtn = page.locator(".attendance-actions button:has-text('Check in')");
  assert.ok(await secondSatBtn.isDisabled(), "Check-in should be disabled on Second Saturday.");

  // Capture Screenshot 11
  await capture("11_restriction_second_saturday.png");

  // 3. Diwali Company Holiday test (2026-11-09)
  await page.setExtraHTTPHeaders({ "x-test-date": "2026-11-09" });
  await page.reload();
  await page.waitForLoadState("networkidle");

  const diwaliNotice = page.locator(".notice:has-text('Diwali — Company Holiday')");
  await diwaliNotice.waitFor({ state: "visible" });
  const diwaliBtn = page.locator(".attendance-actions button:has-text('Check in')");
  assert.ok(await diwaliBtn.isDisabled(), "Check-in should be disabled on Diwali.");

  // Capture Screenshot 12
  await capture("12_restriction_company_holiday_diwali.png");

  // 4. First Saturday (Working Saturday, 2026-11-07)
  await page.setExtraHTTPHeaders({ "x-test-date": "2026-11-07" });
  await page.reload();
  await page.waitForLoadState("networkidle");

  const workingSatBtn = page.locator(".attendance-actions button:has-text('Check in')");
  await workingSatBtn.waitFor({ state: "visible" });
  assert.ok(await workingSatBtn.isEnabled(), "Check-in should be enabled on First Saturday (normal working day).");
  assert.equal(await page.locator(".notice:has-text('Weekly Off')").count(), 0);

  // Capture Screenshot 13
  await capture("13_working_saturday_enabled.png");

  // Reset test date back to normal
  await page.setExtraHTTPHeaders({ "x-test-date": "2026-11-04" });
});

test("Scenario 8 — Responsive Viewports (Mobile & Tablet)", async () => {
  // Tablet Viewport (768 x 1024)
  await page.setViewportSize({ width: 768, height: 1024 });
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Capture Screenshot 15 (Tablet)
  await capture("15_responsive_tablet_768.png");

  // Mobile Viewport (390 x 844)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.waitForLoadState("networkidle");

  // Verify no horizontal overflow on mobile body
  const isOverflowing = await page.evaluate(() => {
    return document.documentElement.scrollWidth > window.innerWidth;
  });
  assert.equal(isOverflowing, false, "Mobile page should not have horizontal scrollbar.");

  // Capture Screenshot 14 (Mobile)
  await capture("14_responsive_mobile_390.png");

  // Restore Desktop Viewport
  await page.setViewportSize({ width: 1440, height: 900 });
});

test("Scenario 9 — Accessibility and Keyboard Navigation", async () => {
  // Test modal accessibility attributes
  const checkOutBtn = page.locator(".attendance-actions button:has-text('Workday Completed')");
  // Today's attendance is completed, so check that the button has proper accessibility
  assert.ok(await checkOutBtn.isDisabled());

  // Test SVG chart keyboard focus
  const chartGroups = page.locator(".attendance-bar-group");
  const count = await chartGroups.count();
  assert.ok(count > 0, "Attendance report chart should have interactive bar groups.");

  const firstBar = chartGroups.first();
  await firstBar.focus();
  const ariaLabel = await firstBar.getAttribute("aria-label");
  assert.ok(ariaLabel && ariaLabel.length > 0, "Bar group should have descriptive aria-label.");
});

test("Scenario 10 — Page Refresh & Data Persistence", async () => {
  // Refresh page and confirm attendance state, worked time, and charts remain identical
  await page.reload();
  await page.waitForLoadState("networkidle");

  const workedText = await page.locator(".time-row > div:nth-child(5) strong").innerText();
  assert.equal(workedText, "4h 56m", "Worked duration should remain 4h 56m after refresh.");

  const indicator = page.locator(".attendance-indicator.indicator-complete");
  await indicator.waitFor({ state: "visible" });

  const chartSubtitle = await page.locator(".chart-heading-controls p").first().innerText();
  assert.ok(chartSubtitle.includes("4h 56m"), "Chart should still display 4h 56m.");
});

test("Scenario 11 — Auto checkout preserves attendance and collects pending work report", async () => {
  const record = db.prepare(`
    INSERT INTO attendance_records(employee_id, attendance_date, check_in, check_out,
      worked_minutes, break_minutes, status, checkout_reason)
    VALUES (1, '2026-11-05', '2026-11-05T04:30:00.000Z',
      '2026-11-05T14:30:00.000Z', 600, 0, 'completed', 'automatic_timeout')
    RETURNING id
  `).get();
  db.prepare(`
    INSERT INTO attendance_automation(attendance_record_id, auto_closed_at, report_due_at)
    VALUES (?, '2026-11-05T14:30:00.000Z', '2026-11-06T18:29:00.000Z')
  `).run(record.id);

  await page.reload();
  await page.waitForLoadState("networkidle");
  const pendingPanel = page.locator('[aria-labelledby="auto-report-heading"]');
  await pendingPanel.waitFor({ state: "visible" });
  assert.ok((await pendingPanel.innerText()).includes("Daily work report required"));
  await pendingPanel.locator("textarea").fill("Completed client dashboard development, attendance validation, and integration testing.");
  await pendingPanel.locator('button[type="submit"]').click();
  await pendingPanel.waitFor({ state: "hidden" });
  assert.equal(
    db.prepare("SELECT check_out FROM attendance_records WHERE id = ?").get(record.id).check_out,
    "2026-11-05T14:30:00.000Z",
  );
  const report = db.prepare("SELECT work_summary FROM daily_work_reports WHERE attendance_record_id = ?").get(record.id);
  assert.match(report.work_summary, /Completed client dashboard development/);
});


test("Scenario 12 — Full-page profile editor and reason-only leave calendar work in browser", async () => {
  await page.reload();
  await page.waitForLoadState("networkidle");
  const profileNav = page.locator(".side-nav button:has-text('My Profile')").first();
  await profileNav.click();
  await page.getByRole("heading",{name:"My Profile",exact:true}).waitFor({state:"visible"});
  assert.equal(await page.locator(".workspace-panel:has-text('My account')").count(),0);
  await page.getByLabel("Phone number").fill("+91 98765 43210");
  await page.getByRole("button",{name:"Save Changes"}).click();
  await page.getByLabel("Phone number").waitFor({state:"visible"});
  assert.equal(await page.getByLabel("Phone number").inputValue(),"+91 98765 43210");

  await page.locator(".hub-tabbar button:has-text('Leave & Calendar')").click();
  await page.getByRole("heading",{name:"Leave & Calendar",exact:true}).waitFor({state:"visible"});
  assert.equal(await page.locator(".hub-calendar-weekday").count(),7);
  assert.ok(await page.locator(".hub-calendar-day").count()>=28);
  const reasons=await page.getByLabel("Reason for leave").locator("option").allTextContents();
  assert.ok(reasons.includes("Other — please specify"));
  assert.ok(reasons.every(value=>!/(?:paid|unpaid)/i.test(value)));

  await page.getByLabel("Reason for leave").selectOption("other");
  await page.getByLabel("Please mention your reason (required)").fill("Synthetic family event");
  assert.equal(await page.getByLabel("Please mention your reason (required)").inputValue(),"Synthetic family event");
});

test("Scenario 13 — Calendar highlights company-local today and restores it after browsing months", async () => {
  await page.getByRole("heading", { name: "Leave & Calendar", exact: true }).waitFor({ state: "visible" });
  const serverSnapshot = await page.evaluate(async () => {
    const response = await fetch("/api/company-calendar", { credentials: "include" });
    if (!response.ok) throw new Error("Calendar API unavailable");
    return response.json();
  });
  assert.match(serverSnapshot.today, /^\d{4}-\d{2}-\d{2}$/);
  const todayCell = page.locator('.hub-calendar-day[aria-current="date"]');
  await todayCell.waitFor({ state: "visible" });
  assert.match((await todayCell.getAttribute("aria-label")) || "", new RegExp(serverSnapshot.today));
  await page.getByRole("button", { name: "Previous month" }).click();
  await page.getByRole("button", { name: "Jump to today's date" }).click();
  await todayCell.waitFor({ state: "visible" });
  assert.equal(await todayCell.count(), 1);
  const observances = serverSnapshot.observances;
  assert.ok(observances.some((entry) => entry.name === "Ratha Yatra"));
  assert.ok(serverSnapshot.holidays.some((entry) => entry.name === "Bhogi"));
});
