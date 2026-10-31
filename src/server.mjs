import { createServer } from "node:http";
import { createReadStream, existsSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { createHash, randomBytes, createCipheriv, createDecipheriv } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import nodemailer from "nodemailer";
import { getSmtpConfiguration } from "./smtp-config.mjs";
import { db, dataDir, encryptionKey } from "./database.mjs";
import {
  attendanceProgress,
  countWorkingDays,
  createApplicationOtp,
  hashPassword,
  isCompanyHoliday,
  isSecondSaturday,
  localDateTimeToUtc,
  makeCompanyEmployeeId,
  verifyPassword,
  workedMinutes,
} from "./domain.mjs";
import { applicationApprovedEmail, applicationOtpEmail, applicationSubmittedEmail } from "./email-templates.mjs";
import { DEMO_CREDENTIALS, ensureDemoAccounts } from "./demo-accounts.mjs";

const port = Number(process.env.PORT || 3001);
const appUrl = new URL(process.env.APP_URL || "http://localhost:5173");
const isProduction = process.env.NODE_ENV === "production";
if (isProduction && appUrl.protocol !== "https:") throw new Error("Production APP_URL must use HTTPS.");
const maxBodyBytes = 25 * 1024 * 1024;
const sessions = db.prepare(`
  SELECT s.token_hash, s.csrf_hash, s.expires_at, u.id AS user_id, u.email, u.role, u.active,
         e.id AS employee_row_id, e.employee_id, e.full_name, e.employment_type, e.position,
         e.department_id, d.name AS department, e.team_id, e.photo_url
  FROM sessions s
  JOIN users u ON u.id = s.user_id
  LEFT JOIN employees e ON e.user_id = u.id
  LEFT JOIN departments d ON d.id = e.department_id
  WHERE s.token_hash = ? AND s.expires_at > ?
`);
const attempts = new Map();
let drainingOutbox = false;

function smtpConfiguration() {
  return getSmtpConfiguration();
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function fail(status, message) {
  throw new HttpError(status, message);
}

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function timestamp() {
  return new Date().toISOString();
}

function getSetting(key) {
  return db.prepare("SELECT value FROM company_settings WHERE key = ?").get(key)?.value ?? "";
}

function setSetting(key, value) {
  db.prepare("INSERT INTO company_settings(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(key, String(value));
}

function withTransaction(operation) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = operation();
    db.exec("COMMIT");
    return result;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function settingsObject() {
  return Object.fromEntries(db.prepare("SELECT key, value FROM company_settings").all().map(({ key, value }) => [key, value]));
}

function currentDateInZone(zone = getSetting("timezone") || "Asia/Kolkata", date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function safeUser(user) {
  if (!user) return null;
  return {
    id: user.user_id,
    email: user.email,
    role: user.role,
    employeeId: user.employee_id ?? null,
    name: user.full_name ?? user.email.split("@")[0],
    employmentType: user.employment_type ?? null,
    position: user.position ?? null,
    department: user.department ?? null,
    teamId: user.team_id ?? null,
    photoUrl: user.photo_url ?? null,
  };
}

function cookies(header = "") {
  return Object.fromEntries(header.split(";").map((item) => {
    const separator = item.indexOf("=");
    if (separator < 0) return ["", ""];
    return [item.slice(0, separator).trim(), decodeURIComponent(item.slice(separator + 1).trim())];
  }).filter(([key]) => key));
}

function cookieHeader(name, value, maxAge, httpOnly) {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Strict", `Max-Age=${maxAge}`];
  if (httpOnly) parts.push("HttpOnly");
  if (isProduction) parts.push("Secure");
  return parts.join("; ");
}

function setCookies(res, values) {
  res.setHeader("Set-Cookie", values);
}

function csrfToken(res, cookieJar, session) {
  if (cookieJar.mm_csrf && (!session || hash(cookieJar.mm_csrf) === session.csrf_hash)) return cookieJar.mm_csrf;
  const value = randomBytes(32).toString("base64url");
  if (session) db.prepare("UPDATE sessions SET csrf_hash = ? WHERE token_hash = ?").run(hash(value), session.token_hash);
  setCookies(res, [
    ...(session ? [cookieHeader("mm_session", cookieJar.mm_session, 8 * 60 * 60, true)] : []),
    cookieHeader("mm_csrf", value, 8 * 60 * 60, false),
  ]);
  return value;
}

function getSession(req, res) {
  const jar = cookies(req.headers.cookie);
  if (!jar.mm_session) return { user: null, csrf: csrfToken(res, jar, null), jar };
  const session = sessions.get(hash(jar.mm_session), timestamp());
  if (!session || !session.active) {
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(jar.mm_session));
    const csrf = jar.mm_csrf || randomBytes(32).toString("base64url");
    setCookies(res, [cookieHeader("mm_session", "", 0, true), cookieHeader("mm_csrf", csrf, 8 * 60 * 60, false)]);
    return { user: null, csrf, jar: { ...jar, mm_csrf: csrf } };
  }
  return { user: session, csrf: csrfToken(res, jar, session), jar };
}

function requireUser(context) {
  if (!context.user) fail(401, "Please sign in to continue.");
  return context.user;
}

function requireRole(user, ...roles) {
  if (!roles.includes(user.role)) fail(403, "You do not have permission to perform this action.");
}

function checkCsrf(req, context) {
  const origin = req.headers.origin;
  if (origin) {
    try {
      if (new URL(origin).origin !== appUrl.origin) fail(403, "Request origin is not allowed.");
    } catch {
      fail(403, "Request origin is not allowed.");
    }
  } else if (isProduction) {
    fail(403, "A valid request origin is required.");
  }
  const headerToken = req.headers["x-csrf-token"];
  if (typeof headerToken !== "string" || !context.jar.mm_csrf || headerToken !== context.jar.mm_csrf) {
    fail(403, "Your session expired. Refresh the page and try again.");
  }
  if (context.user && hash(headerToken) !== context.user.csrf_hash) {
    fail(403, "Your session expired. Refresh the page and try again.");
  }
}

function rateLimit(req, key, limit, windowMs) {
  const address = req.socket.remoteAddress ?? "unknown";
  const now = Date.now();
  if (attempts.size > 10_000) {
    for (const [entryId, entryValue] of attempts) {
      if (entryValue.until <= now) attempts.delete(entryId);
    }
  }
  const id = `${address}:${key}`;
  const entry = attempts.get(id);
  if (!entry || entry.until <= now) {
    attempts.set(id, { count: 1, until: now + windowMs });
    return;
  }
  entry.count += 1;
  if (entry.count > limit) fail(429, "Too many attempts. Please wait before trying again.");
}

async function readBody(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    length += chunk.length;
    if (length > maxBodyBytes) fail(413, "Request body is too large.");
    chunks.push(chunk);
  }
  if (!length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    fail(400, "Request body must be valid JSON.");
  }
}

function requiredString(value, field, maxLength, minLength = 1) {
  if (typeof value !== "string") fail(400, `${field} is required.`);
  const result = value.trim();
  if (result.length < minLength || result.length > maxLength) fail(400, `${field} must be ${minLength}-${maxLength} characters.`);
  return result;
}

function validDate(value, field) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail(400, `${field} must be a valid date.`);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value) fail(400, `${field} must be a valid date.`);
  return value;
}

function audit(actor, action, entityType, entityId) {
  db.prepare("INSERT INTO audit_logs(actor_user_id, action, entity_type, entity_id) VALUES (?, ?, ?, ?)").run(actor ?? null, action, entityType, String(entityId));
}

function notifyUser(userId, category, title, message) {
  db.prepare("INSERT INTO notifications(user_id, category, title, message) VALUES (?, ?, ?, ?)").run(userId, category, title, message);
}

function encryptPayload(payload) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload)), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

function decryptPayload(value) {
  const [iv, tag, encrypted] = value.split(".").map((part) => Buffer.from(part, "base64url"));
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
  decipher.setAuthTag(tag);
  return JSON.parse(Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"));
}

function queueEmail(recipient, subject, text, html) {
  if (!recipient || !smtpConfiguration().configured) return false;
  db.prepare("INSERT INTO email_outbox(recipient, subject, encrypted_payload) VALUES (?, ?, ?)").run(
    recipient,
    subject,
    encryptPayload({ text, ...(html ? { html } : {}) }),
  );
  return true;
}

function smtpTransport() {
  const configuration = smtpConfiguration();
  return configuration.configured ? nodemailer.createTransport(configuration.transport) : null;
}

async function drainOutbox() {
  if (drainingOutbox) return;
  const transport = smtpTransport();
  if (!transport) return;
  drainingOutbox = true;
  try {
    const messages = db.prepare("SELECT * FROM email_outbox WHERE status = 'pending' AND attempts < 8 ORDER BY id LIMIT 5").all();
    for (const message of messages) {
      const claimed = db.prepare("UPDATE email_outbox SET status = 'sending', attempts = attempts + 1 WHERE id = ? AND status = 'pending'").run(message.id);
      if (claimed.changes !== 1) continue;
      try {
        const payload = decryptPayload(message.encrypted_payload);
        await transport.sendMail({
          from: process.env.SMTP_FROM,
          to: message.recipient,
          subject: message.subject,
          text: payload.text,
          ...(payload.html ? { html: payload.html } : {}),
        });
        db.prepare("UPDATE email_outbox SET status = 'sent', sent_at = ?, last_error = NULL WHERE id = ?").run(timestamp(), message.id);
      } catch {
        db.prepare("UPDATE email_outbox SET status = CASE WHEN attempts >= 8 THEN 'failed' ELSE 'pending' END, last_error = 'SMTP delivery failed' WHERE id = ?").run(message.id);
      }
    }
  } finally {
    drainingOutbox = false;
  }
}

function getEmployeeForUser(user) {
  const employee = db.prepare("SELECT * FROM employees WHERE user_id = ?").get(user.user_id);
  if (!employee) fail(403, "An active employee profile is required for this action.");
  return employee;
}

function canAccessEmployee(user, employeeId) {
  if (user.role === "ceo") return true;
  if (user.role !== "team_lead" || user.employee_row_id === employeeId) return user.employee_row_id === employeeId;
  return Boolean(db.prepare(`
    SELECT 1
    FROM team_members member
    JOIN team_members lead_members ON lead_members.team_id = member.team_id
    WHERE member.employee_id = ? AND lead_members.employee_id = ?
  `).get(employeeId, user.employee_row_id));
}

function listVisibleEmployees(user) {
  const select = `
    SELECT e.id, e.employee_id AS employeeId, e.full_name AS name, e.employment_type AS employmentType,
           e.position, d.name AS department, t.name AS team, u.active, e.photo_url AS photoUrl
    FROM employees e
    JOIN users u ON u.id = e.user_id
    LEFT JOIN departments d ON d.id = e.department_id
    LEFT JOIN teams t ON t.id = e.team_id
  `;
  if (user.role === "ceo") return db.prepare(`${select} ORDER BY e.full_name`).all();
  if (user.role === "team_lead") {
    return db.prepare(`${select}
      JOIN team_members member ON member.employee_id = e.id
      JOIN team_members lead_members ON lead_members.team_id = member.team_id
      WHERE lead_members.employee_id = ? ORDER BY e.full_name
    `).all(user.employee_row_id);
  }
  return db.prepare(`${select} WHERE e.id = ?`).all(user.employee_row_id);
}

function makeSession(res, userId) {
  const rawSession = randomBytes(32).toString("base64url");
  const csrf = randomBytes(32).toString("base64url");
  db.prepare("INSERT INTO sessions(token_hash, csrf_hash, user_id, expires_at) VALUES (?, ?, ?, ?)").run(
    hash(rawSession),
    hash(csrf),
    userId,
    new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
  );
  setCookies(res, [
    cookieHeader("mm_session", rawSession, 8 * 60 * 60, true),
    cookieHeader("mm_csrf", csrf, 8 * 60 * 60, false),
  ]);
  return { rawSession, csrf };
}

function buildDashboard(user) {
  const settings = settingsObject();
  const today = currentDateInZone(settings.timezone);
  const expectedMinutes = Number(settings.expected_working_minutes) || null;
  const chartExpectedMinutes = expectedMinutes ?? 480;
  if (user.role === "ceo") {
    return {
      role: user.role,
      today,
      settings,
      emailConfigured: smtpConfiguration().configured,
      employees: db.prepare("SELECT COUNT(*) AS value FROM employees e JOIN users u ON u.id = e.user_id WHERE u.active = 1").get().value,
      interns: db.prepare("SELECT COUNT(*) AS value FROM employees e JOIN users u ON u.id = e.user_id WHERE e.employment_type = 'intern' AND u.active = 1").get().value,
      present: db.prepare("SELECT COUNT(*) AS value FROM attendance_records WHERE attendance_date = ?").get(today).value,
      pendingApplications: db.prepare("SELECT COUNT(*) AS value FROM employee_applications WHERE status = 'pending'").get().value,
      pendingLeaves: db.prepare("SELECT COUNT(*) AS value FROM leave_requests WHERE status = 'pending'").get().value,
      attendanceExceptions: db.prepare("SELECT COUNT(*) AS value FROM attendance_exceptions WHERE attendance_date = ? AND status != 'resolved'").get(today).value,
      emailQueue: db.prepare("SELECT status, COUNT(*) AS count FROM email_outbox GROUP BY status").all(),
      attendanceTrend: db.prepare(`
        SELECT attendance_date AS date, COUNT(*) AS present,
          ROUND(AVG(CASE
            WHEN worked_minutes IS NOT NULL THEN MIN(worked_minutes, ?)
            WHEN check_out IS NULL THEN MIN(MAX(0, CAST((julianday('now') - julianday(check_in)) * 1440 AS INTEGER)), ?)
            ELSE 0
          END), 0) AS averageMinutes
        FROM attendance_records
        WHERE attendance_date >= date(?, '-365 days') AND attendance_date <= ?
        GROUP BY attendance_date ORDER BY attendance_date
      `).all(chartExpectedMinutes, chartExpectedMinutes, today, today),
      attendanceReport: db.prepare(`
        WITH RECURSIVE calendar(day) AS (
          SELECT date(?, '-365 days')
          UNION ALL
          SELECT date(day, '+1 day') FROM calendar WHERE day < ?
        )
        SELECT calendar.day AS date,
          (SELECT COUNT(*) FROM attendance_records a
           JOIN employees e ON e.id = a.employee_id
           JOIN users u ON u.id = e.user_id AND u.active = 1
           WHERE a.attendance_date = calendar.day AND e.proposed_joining_date <= calendar.day
             AND NOT EXISTS (
               SELECT 1 FROM leave_requests lr
               WHERE lr.employee_id = e.id AND lr.status = 'approved'
                 AND lr.start_date <= calendar.day AND lr.end_date >= calendar.day
             )) AS present,
          (SELECT COUNT(*) FROM employees e JOIN users u ON u.id = e.user_id AND u.active = 1
           WHERE e.proposed_joining_date <= calendar.day
             AND NOT EXISTS (
               SELECT 1 FROM leave_requests lr
               WHERE lr.employee_id = e.id AND lr.status = 'approved'
                 AND lr.start_date <= calendar.day AND lr.end_date >= calendar.day
             )) AS expected,
          (SELECT COUNT(DISTINCT lr.employee_id) FROM leave_requests lr
           JOIN employees e ON e.id = lr.employee_id
           JOIN users u ON u.id = e.user_id AND u.active = 1
           WHERE lr.status = 'approved' AND lr.start_date <= calendar.day AND lr.end_date >= calendar.day
             AND e.proposed_joining_date <= calendar.day) AS approvedLeave,
          (SELECT COUNT(*) FROM attendance_exceptions x
           WHERE x.attendance_date = calendar.day AND x.status = 'review_required') AS reviewRequired,
          CASE WHEN (
            SELECT COUNT(*) FROM employees e JOIN users u ON u.id = e.user_id AND u.active = 1
            WHERE e.proposed_joining_date <= calendar.day
              AND NOT EXISTS (
                SELECT 1 FROM leave_requests lr
                WHERE lr.employee_id = e.id AND lr.status = 'approved'
                  AND lr.start_date <= calendar.day AND lr.end_date >= calendar.day
              )
          ) > 0 THEN ROUND(100.0 * COALESCE((
            SELECT SUM(CASE
              WHEN a.worked_minutes IS NOT NULL THEN MIN(a.worked_minutes, ?)
              WHEN a.check_out IS NULL THEN MIN(MAX(0, CAST((julianday('now') - julianday(a.check_in)) * 1440 AS INTEGER)), ?)
              ELSE 0
            END) FROM attendance_records a
            JOIN employees e ON e.id = a.employee_id
            JOIN users u ON u.id = e.user_id AND u.active = 1
            WHERE a.attendance_date = calendar.day AND e.proposed_joining_date <= calendar.day
              AND NOT EXISTS (
                SELECT 1 FROM leave_requests lr
                WHERE lr.employee_id = e.id AND lr.status = 'approved'
                  AND lr.start_date <= calendar.day AND lr.end_date >= calendar.day
              )
          ), 0) / (
            SELECT COUNT(*) * ? FROM employees e JOIN users u ON u.id = e.user_id AND u.active = 1
            WHERE e.proposed_joining_date <= calendar.day
              AND NOT EXISTS (
                SELECT 1 FROM leave_requests lr
                WHERE lr.employee_id = e.id AND lr.status = 'approved'
                  AND lr.start_date <= calendar.day AND lr.end_date >= calendar.day
              )
          ), 0) ELSE 0 END AS attendancePercent
        FROM calendar
        WHERE strftime('%w', calendar.day) != '0'
          AND NOT (strftime('%w', calendar.day) = '6' AND CAST(strftime('%d', calendar.day) AS INTEGER) BETWEEN 8 AND 14)
          AND NOT EXISTS (SELECT 1 FROM company_holidays h WHERE h.holiday_date = calendar.day)
        ORDER BY calendar.day
      `).all(today, today, chartExpectedMinutes, chartExpectedMinutes, chartExpectedMinutes),
      departmentDistribution: db.prepare(`
        SELECT COALESCE(d.name, 'Unassigned') AS name, COUNT(*) AS count
        FROM employees e JOIN users u ON u.id = e.user_id
        LEFT JOIN departments d ON d.id = e.department_id
        WHERE u.active = 1 GROUP BY d.name ORDER BY count DESC, name
      `).all(),
      recentApplications: db.prepare("SELECT reference, full_name AS name, employment_type AS employmentType, status, created_at AS createdAt FROM employee_applications ORDER BY id DESC LIMIT 5").all(),
      attendance: db.prepare(`
        SELECT e.full_name AS name, e.employee_id AS employeeId, a.check_in AS checkIn, a.check_out AS checkOut,
               a.worked_minutes AS workedMinutes
        FROM attendance_records a JOIN employees e ON e.id = a.employee_id
        WHERE a.attendance_date = ? ORDER BY a.check_in DESC LIMIT 8
      `).all(today),
    };
  }
  if (user.role === "team_lead") {
    const visible = listVisibleEmployees(user);
    const employeeIds = visible.map((employee) => employee.id);
    const placeholders = employeeIds.map(() => "?").join(",");
    const teamAttendance = employeeIds.length ? db.prepare(`
      SELECT e.full_name AS name, e.employee_id AS employeeId, a.attendance_date AS date,
             a.check_in AS checkIn, a.check_out AS checkOut, a.worked_minutes AS workedMinutes
      FROM attendance_records a JOIN employees e ON e.id = a.employee_id
      WHERE a.attendance_date = ? AND e.id IN (${placeholders}) ORDER BY a.check_in DESC
    `).all(today, ...employeeIds) : [];
    const trend = employeeIds.length ? db.prepare(`
      SELECT attendance_date AS date, COUNT(*) AS present, ROUND(AVG(worked_minutes), 0) AS averageMinutes
      FROM attendance_records
      WHERE attendance_date >= date(?, '-365 days') AND attendance_date <= ? AND employee_id IN (${placeholders})
      GROUP BY attendance_date ORDER BY attendance_date
    `).all(today, today, ...employeeIds) : [];
    const exceptions = employeeIds.length ? db.prepare(`
      SELECT x.attendance_date AS date, x.deadline_at AS deadlineAt, x.status, e.full_name AS name
      FROM attendance_exceptions x JOIN employees e ON e.id = x.employee_id
      WHERE x.status != 'resolved' AND x.employee_id IN (${placeholders}) ORDER BY x.attendance_date DESC
    `).all(...employeeIds) : [];
    const pendingTeamLeaves = employeeIds.length ? db.prepare(`
      SELECT COUNT(*) AS value FROM leave_requests
      WHERE status = 'pending' AND employee_id IN (${placeholders})
    `).get(...employeeIds).value : 0;
    return {
      role: user.role,
      today,
      settings,
      teamMembers: visible.filter((employee) => employee.active).length,
      present: teamAttendance.length,
      pendingLeaves: pendingTeamLeaves,
      attendanceExceptions: exceptions.length,
      attendanceTrend: trend,
      attendance: teamAttendance,
      exceptions,
    };
  }
  const employee = getEmployeeForUser(user);
  const attendance = db.prepare(`
    SELECT *, check_in AS checkIn, check_out AS checkOut, worked_minutes AS workedMinutes
    FROM attendance_records WHERE employee_id = ? AND attendance_date = ?
  `).get(employee.id, today);

  // Live real-time worked minutes calculation
  const liveWorkedMinutes = attendance
    ? (attendance.check_out
        ? (attendance.worked_minutes ?? 0)
        : Math.max(0, Math.floor((Date.now() - Date.parse(attendance.check_in)) / 60000)))
    : null;

  const progress = liveWorkedMinutes !== null
    ? attendanceProgress(liveWorkedMinutes, expectedMinutes)
    : null;

  const liveAttendance = attendance
    ? {
        ...attendance,
        workedMinutes: liveWorkedMinutes,
        worked_minutes: liveWorkedMinutes,
        progress,
      }
    : null;

  const leaves = db.prepare(`
    SELECT lr.id, lr.start_date AS startDate, lr.end_date AS endDate, lr.status, lt.name AS leaveType,
           lr.working_days_count AS workingDays, lr.pay_treatment AS payTreatment,
           lr.requires_ceo_approval AS requiresCeoApproval
    FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
    WHERE lr.employee_id = ? ORDER BY lr.id DESC LIMIT 5
  `).all(employee.id);

  const attendanceTrend = db.prepare(`
    SELECT attendance_date AS date, 1 AS present,
      ROUND(CASE
        WHEN worked_minutes IS NOT NULL THEN MIN(worked_minutes, ?)
        WHEN check_out IS NULL THEN MIN(MAX(0, CAST((julianday('now') - julianday(check_in)) * 1440 AS INTEGER)), ?)
        ELSE 0
      END, 0) AS averageMinutes
    FROM attendance_records
    WHERE employee_id = ? AND attendance_date >= date(?, '-365 days') AND attendance_date <= ?
    ORDER BY attendance_date
  `).all(chartExpectedMinutes, chartExpectedMinutes, employee.id, today, today);

  // Synchronize today's live minutes in trend
  if (attendance && !attendance.check_out && liveWorkedMinutes !== null) {
    const todayTrend = attendanceTrend.find((item) => item.date === today);
    if (todayTrend) {
      todayTrend.averageMinutes = liveWorkedMinutes;
    } else {
      attendanceTrend.push({ date: today, present: 1, averageMinutes: liveWorkedMinutes });
    }
  }

  const attendanceReport = db.prepare(`
    WITH RECURSIVE calendar(day) AS (
      SELECT date(?, '-30 days')
      UNION ALL
      SELECT date(day, '+1 day') FROM calendar WHERE day < ?
    ),
    workdays AS (
      SELECT day FROM calendar
      WHERE strftime('%w', day) != '0'
        AND NOT (strftime('%w', day) = '6' AND CAST(strftime('%d', day) AS INTEGER) BETWEEN 8 AND 14)
        AND NOT EXISTS (SELECT 1 FROM company_holidays h WHERE h.holiday_date = day)
      UNION
      SELECT ? WHERE EXISTS (SELECT 1 FROM attendance_records WHERE attendance_date = ? AND employee_id = ?)
    )
    SELECT w.day AS date,
      CASE WHEN ar.id IS NOT NULL THEN 1 ELSE 0 END AS present,
      1 AS expected,
      (SELECT COUNT(*) FROM leave_requests lr WHERE lr.employee_id = ? AND lr.status = 'approved' AND lr.start_date <= w.day AND lr.end_date >= w.day) AS approvedLeave,
      (SELECT COUNT(*) FROM attendance_exceptions ax WHERE ax.employee_id = ? AND ax.attendance_date = w.day AND ax.status != 'resolved') AS reviewRequired,
      ROUND(
        CASE
          WHEN ar.worked_minutes IS NOT NULL THEN MIN(100, CAST(ar.worked_minutes AS REAL) / ? * 100)
          WHEN ar.check_in IS NOT NULL THEN MIN(100, CAST(MAX(0, CAST((julianday('now') - julianday(ar.check_in)) * 1440 AS INTEGER)) AS REAL) / ? * 100)
          WHEN (SELECT COUNT(*) FROM leave_requests lr WHERE lr.employee_id = ? AND lr.status = 'approved' AND lr.start_date <= w.day AND lr.end_date >= w.day) > 0 THEN 100
          ELSE 0
        END,
        0
      ) AS attendancePercent
    FROM workdays w
    LEFT JOIN attendance_records ar ON ar.attendance_date = w.day AND ar.employee_id = ?
    ORDER BY w.day
  `).all(today, today, today, today, employee.id, employee.id, employee.id, chartExpectedMinutes, chartExpectedMinutes, employee.id, employee.id);

  // Synchronize today's percentage with live calculated minutes
  if (attendance && !attendance.check_out && liveWorkedMinutes !== null) {
    const todayPct = Math.min(100, Math.round((liveWorkedMinutes / chartExpectedMinutes) * 100));
    const todayRep = attendanceReport.find((item) => item.date === today);
    if (todayRep) {
      todayRep.attendancePercent = todayPct;
      todayRep.present = 1;
    } else {
      attendanceReport.push({
        date: today,
        present: 1,
        expected: 1,
        approvedLeave: 0,
        reviewRequired: 0,
        attendancePercent: todayPct,
      });
    }
  }

  // Calculate 25 Paid Leaves Entitlement & Balance
  const yearStr = today.slice(0, 4);
  const approvedPaidRow = db.prepare(`
    SELECT COALESCE(SUM(working_days_count), 0) AS used
    FROM leave_requests lr
    JOIN leave_types lt ON lt.id = lr.leave_type_id
    WHERE lr.employee_id = ? AND lr.status = 'approved' AND lt.paid = 1
      AND strftime('%Y', lr.start_date) = ?
  `).get(employee.id, yearStr);
  const usedPaidDays = approvedPaidRow?.used ?? 0;
  const entitledPaidDays = 25;
  const remainingPaidDays = Math.max(0, entitledPaidDays - usedPaidDays);
  const leaveBalance = {
    entitled: entitledPaidDays,
    used: usedPaidDays,
    remaining: remainingPaidDays,
  };

  return {
    role: user.role,
    today,
    settings,
    attendance: liveAttendance,
    pendingLeaves: db.prepare("SELECT COUNT(*) AS value FROM leave_requests WHERE employee_id = ? AND status = 'pending'").get(employee.id).value,
    leaveTypes: db.prepare("SELECT id, name, paid FROM leave_types WHERE active = 1 ORDER BY name").all(),
    leaves,
    leaveBalance,
    exceptions: db.prepare("SELECT attendance_date AS date, deadline_at AS deadlineAt, status FROM attendance_exceptions WHERE employee_id = ? ORDER BY id DESC LIMIT 5").all(employee.id),
    recentAttendance: db.prepare("SELECT attendance_date AS date, check_in AS checkIn, check_out AS checkOut, worked_minutes AS workedMinutes FROM attendance_records WHERE employee_id = ? ORDER BY attendance_date DESC LIMIT 7").all(employee.id),
    attendanceTrend,
    attendanceReport,
  };
}

function getApplicationVerification(context) {
  const rawToken = context.jar.mm_application;
  if (!rawToken) fail(401, "Your application session expired. Start your application again.");
  const sessionHash = hash(rawToken);
  const verification = db.prepare("SELECT * FROM application_verifications WHERE session_hash = ?").get(sessionHash);
  if (!verification || Date.now() - Date.parse(verification.created_at) > 30 * 60 * 1000) {
    if (verification) db.prepare("DELETE FROM application_verifications WHERE session_hash = ?").run(sessionHash);
    fail(401, "Your application session expired. Start your application again.");
  }
  return { sessionHash, verification };
}

function startApplicationVerification(body, context, res) {
  rateLimit(context.req, "application-session", 10, 60 * 60 * 1000);
  const firstName = typeof body.firstName === "string" ? body.firstName.trim().slice(0, 60) : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim().slice(0, 60) : "";
  const fullName = (firstName && lastName ? `${firstName} ${lastName}` : body.fullName) || "";
  if (fullName.length < 2 || fullName.length > 120) fail(400, "Full legal name must be 2-120 characters.");
  if (context.jar.mm_application) {
    db.prepare("DELETE FROM application_verifications WHERE session_hash = ?").run(hash(context.jar.mm_application));
  }
  const rawToken = randomBytes(32).toString("base64url");
  const sessionHash = hash(rawToken);
  db.prepare("DELETE FROM application_verifications WHERE created_at < ?").run(new Date(Date.now() - 30 * 60 * 1000).toISOString());
  db.prepare("INSERT INTO application_verifications(session_hash, full_name) VALUES (?, ?)").run(sessionHash, fullName);
  setCookies(res, [cookieHeader("mm_application", rawToken, 30 * 60, true)]);
  return { status: 200, body: { ok: true, expiresInMinutes: 30 } };
}

function getVerifiedEmail(value) {
  const email = requiredString(value, "Personal email", 254, 5).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Enter a valid email address.");
  return email;
}

async function sendApplicationOtp(body, context) {
  const { sessionHash, verification } = getApplicationVerification(context);
  const contact = getVerifiedEmail(body.email);
  const mailConfiguration = smtpConfiguration();
  if (!mailConfiguration.configured) {
    fail(503, mailConfiguration.message);
  }
  const existing = db.prepare(`
    SELECT 1 FROM users WHERE email = ? COLLATE NOCASE
    UNION ALL SELECT 1 FROM employee_applications WHERE email = ? COLLATE NOCASE AND status = 'pending'
    LIMIT 1
  `).get(contact, contact);
  if (existing) fail(409, "An account or pending application already uses that email address.");
  rateLimit(context.req, `application-otp:email:${hash(contact)}`, 3, 60 * 60 * 1000);
  const code = createApplicationOtp();
  const codeHash = hash(`${sessionHash}:email:${code}`);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const transport = smtpTransport();
  if (!transport) fail(503, mailConfiguration.message);
  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to: contact,
      ...applicationOtpEmail({ name: verification.full_name, code, expiryMinutes: 10 }),
    });
  } catch (error) {
    console.error("Application email OTP delivery failed", { error: error.code ?? "SMTP_DELIVERY_FAILED" });
    fail(502, "The email verification code could not be delivered. Check the email address or try again later.");
  }
  db.prepare("UPDATE application_verifications SET email = ?, email_code_hash = ?, email_expires_at = ?, email_verified_at = NULL, email_attempts = 0 WHERE session_hash = ?")
    .run(contact, codeHash, expiresAt, sessionHash);
  const destination = contact.replace(/(^.).*(@.*$)/, "$1••••$2");
  return { status: 200, body: { ok: true, channel: "email", expiresInMinutes: 10, destination } };
}

function verifyApplicationOtp(body, context) {
  const { sessionHash, verification } = getApplicationVerification(context);
  const code = requiredString(body.code, "Verification code", 6, 6).toUpperCase();
  if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) fail(400, "Enter the six-character code from your message.");
  if (verification.email_verified_at) return { status: 200, body: { ok: true, verified: true } };
  if (!verification.email_code_hash || !verification.email_expires_at || Date.parse(verification.email_expires_at) <= Date.now()) {
    fail(400, "This verification code is missing or expired. Request a new code.");
  }
  if (verification.email_attempts >= 5) fail(429, "Too many incorrect codes. Request a new verification code.");
  if (hash(`${sessionHash}:email:${code}`) !== verification.email_code_hash) {
    db.prepare("UPDATE application_verifications SET email_attempts = email_attempts + 1 WHERE session_hash = ?").run(sessionHash);
    fail(400, "That verification code is incorrect. Check it and try again.");
  }
  const verifiedAt = timestamp();
  db.prepare("UPDATE application_verifications SET email_verified_at = ?, email_code_hash = NULL, email_expires_at = NULL, email_attempts = 0 WHERE session_hash = ?")
    .run(verifiedAt, sessionHash);
  return { status: 200, body: { ok: true, verified: true } };
}

function createApplication(body, context) {
  const { sessionHash, verification } = getApplicationVerification(context);
  if (!verification.email || !verification.email_verified_at) fail(400, "Verify your email address before submitting the application.");
  const email = verification.email;
  const firstName = typeof body.firstName === "string" ? body.firstName.trim().slice(0, 60) : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim().slice(0, 60) : "";
  const fullName = (firstName && lastName ? `${firstName} ${lastName}` : verification.full_name) || "Applicant";
  const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 25) : (typeof body.mobile === "string" ? body.mobile.trim().slice(0, 25) : "");
  const employmentType = body.employmentType;
  if (!["employee", "intern"].includes(employmentType)) fail(400, "Choose employee or intern.");
  const position = requiredString(body.position, "Requested position", 120, 2);
  const department = typeof body.department === "string" ? body.department.trim().slice(0, 100) : "";
  const proposedJoiningDate = (typeof body.proposedJoiningDate === "string" && body.proposedJoiningDate.trim())
    ? validDate(body.proposedJoiningDate, "Proposed joining date")
    : currentDateInZone();
  const discussedSalary = typeof body.discussedSalary === "string" ? body.discussedSalary.trim().slice(0, 50) : "";
  const education = typeof body.education === "string" ? body.education.trim().slice(0, 1000) : "";
  const rawPassword = requiredString(body.password, "Password", 256, 12);
  if (!/[A-Z]/.test(rawPassword)) fail(400, "Password must include at least one capital letter (A-Z).");
  if (!/[0-9]/.test(rawPassword)) fail(400, "Password must include at least one number (0-9).");
  if (!/[^A-Za-z0-9]/.test(rawPassword)) fail(400, "Password must include at least one special character (!@#$%^&*...).");
  const passwordHash = hashPassword(rawPassword);
  if (body.privacyAcknowledged !== true) fail(400, "Please acknowledge the privacy notice to submit.");

  const photoUrl = typeof body.photoUrl === "string" && body.photoUrl.trim() ? body.photoUrl.trim() : null;
  const education10thDoc = typeof body.education10thDoc === "string" && body.education10thDoc.trim() ? body.education10thDoc.trim() : null;
  const educationInterDoc = typeof body.educationInterDoc === "string" && body.educationInterDoc.trim() ? body.educationInterDoc.trim() : null;
  const educationHigherDoc = typeof body.educationHigherDoc === "string" && body.educationHigherDoc.trim() ? body.educationHigherDoc.trim() : null;
  const panFront = typeof body.panFront === "string" && body.panFront.trim() ? body.panFront.trim() : null;
  const panBack = typeof body.panBack === "string" && body.panBack.trim() ? body.panBack.trim() : null;
  const aadharFront = typeof body.aadharFront === "string" && body.aadharFront.trim() ? body.aadharFront.trim() : null;
  const aadharBack = typeof body.aadharBack === "string" && body.aadharBack.trim() ? body.aadharBack.trim() : null;

  return withTransaction(() => {
    const alreadyApplied = db.prepare(`
      SELECT 1 FROM users WHERE email = ?
      UNION ALL SELECT 1 FROM employee_applications WHERE email = ? AND status = 'pending'
      LIMIT 1
    `).get(email, email);
    const year = Number(currentDateInZone().slice(0, 4));
    let employeeId = makeCompanyEmployeeId(year);
    while (
      db.prepare("SELECT 1 FROM employees WHERE employee_id = ?").get(employeeId) ||
      db.prepare("SELECT 1 FROM employee_applications WHERE reference = ?").get(employeeId)
    ) {
      employeeId = makeCompanyEmployeeId(year);
    }
    const reference = employeeId;
    const result = db.prepare(`
      INSERT INTO employee_applications(
        reference, full_name, first_name, last_name, email, mobile, phone, employment_type,
        position, department, proposed_joining_date, education, discussed_salary,
        education_10th_doc, education_inter_doc, education_higher_doc,
        pan_front, pan_back, aadhar_front, aadhar_back,
        privacy_acknowledged_at, password_hash, email_verified_at, phone_verified_at, photo_url
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      reference,
      fullName,
      firstName,
      lastName,
      email,
      phone,
      phone,
      employmentType,
      position,
      department,
      proposedJoiningDate,
      education,
      discussedSalary,
      education10thDoc,
      educationInterDoc,
      educationHigherDoc,
      panFront,
      panBack,
      aadharFront,
      aadharBack,
      timestamp(),
      passwordHash,
      verification.email_verified_at,
      null,
      photoUrl,
    );
    db.prepare("DELETE FROM application_verifications WHERE session_hash = ?").run(sessionHash);
    const confirmation = applicationSubmittedEmail({
      name: fullName,
      position,
      employmentType,
      appUrl: appUrl.origin,
    });
    const confirmationEmailQueued = queueEmail(email, confirmation.subject, confirmation.text, confirmation.html);
    for (const ceo of db.prepare("SELECT id FROM users WHERE role = 'ceo' AND active = 1").all()) {
      notifyUser(ceo.id, "application", "New registration application", `Application ${reference} from ${fullName} is ready for review.`);
    }
    const ceoEmail = process.env.CEO_NOTIFICATION_EMAIL;
    if (ceoEmail) {
      queueEmail(ceoEmail, "Registration application requires review", `A new application (${reference}) from ${fullName} is pending. Sign in at ${appUrl.origin} to review it.`);
    }
    return { id: Number(result.lastInsertRowid), reference, fullName, email, position, confirmationEmailQueued };
  });
}

function approveApplication(user, applicationId) {
  requireRole(user, "ceo");
  return withTransaction(() => {
    const application = db.prepare("SELECT * FROM employee_applications WHERE id = ?").get(applicationId);
    if (!application) fail(404, "Application not found.");
    if (application.status !== "pending") fail(409, "This application has already been reviewed.");

    const currentYear = Number(currentDateInZone().slice(0, 4));

    let employeeId = application.reference;
    if (!/^MM-\d{4}-[1-9]{4}$/.test(employeeId)) {
      employeeId = makeCompanyEmployeeId(currentYear);
      while (
        db.prepare("SELECT 1 FROM employees WHERE employee_id = ?").get(employeeId) ||
        db.prepare("SELECT 1 FROM employee_applications WHERE reference = ? AND id != ?").get(employeeId, application.id)
      ) {
        employeeId = makeCompanyEmployeeId(currentYear);
      }
      db.prepare("UPDATE employee_applications SET reference = ? WHERE id = ?").run(employeeId, application.id);
    }
    let departmentId = null;
    if (application.department) {
      db.prepare("INSERT OR IGNORE INTO departments(name) VALUES (?)").run(application.department);
      departmentId = db.prepare("SELECT id FROM departments WHERE name = ?").get(application.department).id;
    }
    const accountActive = Boolean(application.password_hash);

    let userRowId;
    const existingUser = db.prepare("SELECT id FROM users WHERE email = ? COLLATE NOCASE").get(application.email);
    if (existingUser) {
      db.prepare("UPDATE users SET password_hash = COALESCE(?, password_hash), role = 'employee', active = ? WHERE id = ?")
        .run(application.password_hash, Number(accountActive), existingUser.id);
      userRowId = existingUser.id;
    } else {
      const userResult = db.prepare("INSERT INTO users(email, password_hash, role, active) VALUES (?, ?, 'employee', ?)").run(
        application.email,
        application.password_hash,
        Number(accountActive),
      );
      userRowId = Number(userResult.lastInsertRowid);
    }

    let employeeRowId;
    const existingEmp = db.prepare("SELECT id FROM employees WHERE user_id = ? OR employee_id = ?").get(userRowId, employeeId);
    if (existingEmp) {
      db.prepare(`
        UPDATE employees SET employee_id = ?, full_name = ?, employment_type = ?, position = ?, department_id = ?, proposed_joining_date = ?, photo_url = ?
        WHERE id = ?
      `).run(employeeId, application.full_name, application.employment_type, application.position, departmentId, application.proposed_joining_date, application.photo_url || null, existingEmp.id);
      employeeRowId = existingEmp.id;
    } else {
      const employeeResult = db.prepare(`
        INSERT INTO employees(user_id, employee_id, full_name, employment_type, position, department_id, proposed_joining_date, photo_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userRowId, employeeId, application.full_name, application.employment_type, application.position, departmentId, application.proposed_joining_date, application.photo_url || null);
      employeeRowId = Number(employeeResult.lastInsertRowid);
    }
    
    // Initialize 25 paid leave quota for approved employee
    const annualLeaveType = db.prepare("SELECT id FROM leave_types WHERE paid = 1 LIMIT 1").get();
    if (annualLeaveType) {
      db.prepare(`
        INSERT OR IGNORE INTO leave_balances(employee_id, leave_type_id, period_year, entitled_days, used_days)
        VALUES (?, ?, ?, 25, 0)
      `).run(employeeRowId, annualLeaveType.id, currentYear);
    }

    // Initialize salary structure and components based on discussed salary
    const rawSalary = String(application.discussed_salary || "").replace(/[^0-9]/g, "");
    const salaryMonthly = parseInt(rawSalary, 10);
    if (!Number.isNaN(salaryMonthly) && salaryMonthly > 0) {
      const effectiveDate = application.proposed_joining_date || currentDateInZone();
      const basic = Math.round(salaryMonthly * 0.50);
      const hra = Math.round(salaryMonthly * 0.30);
      const special = Math.max(0, salaryMonthly - basic - hra);

      const existingStruct = db.prepare("SELECT id FROM salary_structures WHERE employee_id = ? AND effective_from = ?").get(employeeRowId, effectiveDate);
      let structId;
      if (existingStruct) {
        structId = existingStruct.id;
        db.prepare("DELETE FROM salary_components WHERE salary_structure_id = ?").run(structId);
      } else {
        const structResult = db.prepare(`
          INSERT INTO salary_structures(employee_id, effective_from, currency)
          VALUES (?, ?, 'INR')
        `).run(employeeRowId, effectiveDate);
        structId = Number(structResult.lastInsertRowid);
      }
      db.prepare("INSERT INTO salary_components(salary_structure_id, name, kind, amount_minor) VALUES (?, 'Basic Salary', 'earning', ?)").run(structId, basic * 100);
      db.prepare("INSERT INTO salary_components(salary_structure_id, name, kind, amount_minor) VALUES (?, 'House Rent Allowance (HRA)', 'earning', ?)").run(structId, hra * 100);
      db.prepare("INSERT INTO salary_components(salary_structure_id, name, kind, amount_minor) VALUES (?, 'Special Allowance', 'earning', ?)").run(structId, special * 100);
    }

    db.prepare("UPDATE employee_applications SET status = 'approved', reviewed_by = ?, reviewed_at = ?, password_hash = NULL WHERE id = ? AND status = 'pending'").run(user.user_id, timestamp(), application.id);
    audit(user.user_id, "application.approved", "employee_application", application.id);
    const approvalEmail = applicationApprovedEmail({ name: application.full_name, employeeId, appUrl: appUrl.origin });
    let emailQueued = false;
    let activationUrl;
    if (accountActive) {
      emailQueued = queueEmail(application.email, approvalEmail.subject, approvalEmail.text, approvalEmail.html);
    } else {
      const rawToken = randomBytes(32).toString("base64url");
      activationUrl = `${appUrl.origin}/?activate=${encodeURIComponent(rawToken)}`;
      db.prepare("INSERT INTO activation_tokens(user_id, token_hash, expires_at) VALUES (?, ?, ?)").run(
        userRowId,
        hash(rawToken),
        new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      );
      emailQueued = queueEmail(application.email, approvalEmail.subject, `${approvalEmail.text}\n\nSet up your account within 24 hours: ${activationUrl}`, approvalEmail.html);
    }
    return {
      employeeId,
      employeeRowId,
      emailQueued,
      ...(!emailQueued && activationUrl ? { activationUrl } : {}),
    };
  });
}

function rejectApplication(user, applicationId, reason) {
  requireRole(user, "ceo");
  const safeReason = requiredString(reason, "Rejection reason", 500, 3);
  let emailQueued = false;
  withTransaction(() => {
    const application = db.prepare("SELECT * FROM employee_applications WHERE id = ? AND status = 'pending'").get(applicationId);
    if (!application) fail(404, "Pending application not found.");
    db.prepare("UPDATE employee_applications SET status = 'rejected', rejection_reason = ?, reviewed_by = ?, reviewed_at = ?, password_hash = NULL WHERE id = ?")
      .run(safeReason, user.user_id, timestamp(), applicationId);
    audit(user.user_id, "application.rejected", "employee_application", applicationId);
    emailQueued = queueEmail(application.email, "Update on your MetaMinds Pvt. Ltd. application", `Your application was not approved at this time. Reason: ${safeReason}`);
  });
  return { ok: true, emailQueued };
}

function runAttendanceExceptions() {
  const settings = settingsObject();
  const zone = settings.timezone || "Asia/Kolkata";
  const today = currentDateInZone(zone);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  if (weekday === 0) return;
  if (db.prepare("SELECT 1 FROM company_holidays WHERE holiday_date = ?").get(today)) return;
  const start = settings.scheduled_start || "10:00";
  const end = settings.scheduled_end || "18:00";
  const warningHours = Number(settings.absence_warning_hours) || 3;
  const scheduledStart = localDateTimeToUtc(today, start, zone);
  const scheduledEnd = localDateTimeToUtc(today, end, zone);
  const now = Date.now();
  if (now < scheduledStart.valueOf()) return;
  const deadline = new Date(scheduledStart.valueOf() + warningHours * 60 * 60 * 1000).toISOString();
  const hourlyIndex = now < scheduledEnd.valueOf()
    ? Math.floor((now - scheduledStart.valueOf()) / 3_600_000)
    : -1;
  const employees = db.prepare("SELECT e.id, e.full_name, u.id AS userId, u.email FROM employees e JOIN users u ON u.id = e.user_id WHERE u.active = 1 AND e.proposed_joining_date <= ?").all(today);
  const insertException = db.prepare("INSERT OR IGNORE INTO attendance_exceptions(employee_id, attendance_date, deadline_at) VALUES (?, ?, ?)");
  const insertReminder = db.prepare("INSERT OR IGNORE INTO attendance_reminders(employee_id, attendance_date, reminder_hour) VALUES (?, ?, ?)");
  for (const employee of employees) {
    withTransaction(() => {
      if (db.prepare("SELECT 1 FROM attendance_records WHERE employee_id = ? AND attendance_date = ?").get(employee.id, today)) return;
      const approvedLeave = db.prepare(`
        SELECT 1 FROM leave_requests
        WHERE employee_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ? LIMIT 1
      `).get(employee.id, today, today);
      if (approvedLeave) {
        db.prepare("UPDATE attendance_exceptions SET status = 'resolved', resolved_at = ? WHERE employee_id = ? AND attendance_date = ? AND status != 'resolved'")
          .run(timestamp(), employee.id, today);
        return;
      }
      insertException.run(employee.id, today, deadline);
      const exception = db.prepare("SELECT status FROM attendance_exceptions WHERE employee_id = ? AND attendance_date = ?").get(employee.id, today);
      if (hourlyIndex >= 0) {
        const reminder = insertReminder.run(employee.id, today, hourlyIndex);
        if (reminder.changes === 1) {
          const reminderTime = new Date(scheduledStart.valueOf() + hourlyIndex * 3_600_000);
          const timeLabel = new Intl.DateTimeFormat("en", { hour: "numeric", timeZone: zone }).format(reminderTime);
          notifyUser(employee.userId, "attendance", "Attendance check-in reminder", `You have not checked in. Please check in or contact your manager. Reminder for ${timeLabel}.`);
          if (hourlyIndex === 0) {
            queueEmail(employee.email, "Attendance check-in needed", `Your scheduled workday began at ${start}. Please check in or contact your authorized manager.`);
          }
        }
      }
      if (Date.now() >= Date.parse(deadline) && exception.status === "open") {
        const updated = db.prepare("UPDATE attendance_exceptions SET status = 'review_required' WHERE employee_id = ? AND attendance_date = ? AND status = 'open'").run(employee.id, today);
        if (updated.changes === 1) {
          notifyUser(employee.userId, "attendance", "Attendance exception needs review", "The response deadline has passed. Your absence needs review. No salary deduction is automatic.");
          queueEmail(employee.email, "Attendance exception needs review", `The response deadline has passed for ${today}. Your absence needs review; no salary deduction is automatic.`);
          const managers = db.prepare(`
            SELECT DISTINCT u.id, u.email
            FROM team_members member
            JOIN team_members lead ON lead.team_id = member.team_id
            JOIN employees manager_employee ON manager_employee.id = lead.employee_id
            JOIN users u ON u.id = manager_employee.user_id
            WHERE member.employee_id = ? AND u.role = 'team_lead' AND u.active = 1
          `).all(employee.id);
          const ceos = db.prepare("SELECT id, email FROM users WHERE role = 'ceo' AND active = 1").all();
          const approvers = [...new Map([...managers, ...ceos].map((approver) => [approver.id, approver])).values()];
          for (const approver of approvers) {
            notifyUser(approver.id, "attendance", "Unapproved absence needs CEO review", `An attendance exception for ${employee.full_name} on ${today} needs review. Any salary treatment requires CEO authorization; no deduction is calculated or applied automatically.`);
            queueEmail(approver.email, "Unapproved absence needs CEO review", `An attendance exception for ${employee.full_name} on ${today} needs review. Any salary treatment requires CEO authorization; no deduction is calculated or applied automatically.`);
          }
        }
      }
    });
  }
}

function attendanceRecordsFor(user, month) {
  if (!/^\d{4}-\d{2}$/.test(month)) fail(400, "Month must use YYYY-MM format.");
  if (user.role === "ceo") {
    return db.prepare(`
      SELECT a.attendance_date AS date, e.employee_id AS employeeId, e.full_name AS name, a.check_in AS checkIn,
             a.check_out AS checkOut, a.worked_minutes AS workedMinutes, x.status AS exceptionStatus
      FROM attendance_records a JOIN employees e ON e.id = a.employee_id
      LEFT JOIN attendance_exceptions x ON x.employee_id = e.id AND x.attendance_date = a.attendance_date
      WHERE substr(a.attendance_date, 1, 7) = ? ORDER BY a.attendance_date DESC, e.full_name
    `).all(month);
  }
  if (user.role === "team_lead") {
    const visible = listVisibleEmployees(user).map((employee) => employee.id);
    if (visible.length === 0) return [];
    const placeholders = visible.map(() => "?").join(",");
    return db.prepare(`
      SELECT a.attendance_date AS date, e.employee_id AS employeeId, e.full_name AS name, a.check_in AS checkIn,
             a.check_out AS checkOut, a.worked_minutes AS workedMinutes, x.status AS exceptionStatus
      FROM attendance_records a JOIN employees e ON e.id = a.employee_id
      LEFT JOIN attendance_exceptions x ON x.employee_id = e.id AND x.attendance_date = a.attendance_date
      WHERE substr(a.attendance_date, 1, 7) = ? AND e.id IN (${placeholders}) ORDER BY a.attendance_date DESC, e.full_name
    `).all(month, ...visible);
  }
  const employee = getEmployeeForUser(user);
  return db.prepare(`
    SELECT a.attendance_date AS date, a.check_in AS checkIn, a.check_out AS checkOut, a.worked_minutes AS workedMinutes,
           x.status AS exceptionStatus
    FROM attendance_records a LEFT JOIN attendance_exceptions x ON x.employee_id = a.employee_id AND x.attendance_date = a.attendance_date
    WHERE a.employee_id = ? AND substr(a.attendance_date, 1, 7) = ? ORDER BY a.attendance_date DESC
  `).all(employee.id, month);
}

async function route(req, res, context, body, url) {
  const path = url.pathname;
  const method = req.method ?? "GET";
  if (method !== "GET" && method !== "HEAD") checkCsrf(req, context);

  if (method === "GET" && path === "/api/health") {
    return { status: 200, body: {
      ok: true,
      database: "connected",
      emailConfigured: smtpConfiguration().configured,
      emailConfigurationMessage: smtpConfiguration().message,
    } };
  }
  if (method === "GET" && path === "/api/auth/me") {
    return { status: 200, body: { user: safeUser(context.user), csrfToken: context.csrf } };
  }
  if (method === "GET" && path === "/api/auth/demo-accounts") {
    return {
      status: 200,
      body: {
        enabled: !isProduction,
        accounts: [
          {
            role: "ceo",
            title: "CEO & Executive Portal",
            email: DEMO_CREDENTIALS.ceo.email,
            password: DEMO_CREDENTIALS.ceo.password,
            badge: "Executive Leadership",
            description: "Workforce metrics, employee approvals, audit trails, and company policies",
          },
          {
            role: "employee",
            title: "Employee Portal",
            email: DEMO_CREDENTIALS.employee.email,
            employeeId: DEMO_CREDENTIALS.employee.employeeId,
            password: DEMO_CREDENTIALS.employee.password,
            badge: "Staff Member",
            description: "Personal check-in / check-out, leave requests, attendance history, and team directory",
          },
        ],
      },
    };
  }
  if (method === "POST" && path === "/api/auth/demo-login") {
    if (isProduction) fail(403, "Demo sign in is not available in production.");
    const role = body.role === "ceo" ? "ceo" : body.role === "employee" ? "employee" : null;
    if (!role) fail(400, "Valid demo role ('ceo' or 'employee') is required.");
    ensureDemoAccounts();
    const targetEmail = role === "ceo" ? DEMO_CREDENTIALS.ceo.email : DEMO_CREDENTIALS.employee.email;
    const user = db.prepare("SELECT * FROM users WHERE email = ? COLLATE NOCASE AND active = 1").get(targetEmail);
    if (!user) fail(500, "Demo account could not be initialized.");
    if (context.jar.mm_session) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(context.jar.mm_session));
    const session = makeSession(res, user.id);
    audit(user.id, "auth.demo_login", "user", user.id);
    return { status: 200, body: { user: safeUser(sessions.get(hash(session.rawSession), timestamp())), csrfToken: session.csrf } };
  }
  if (method === "POST" && path === "/api/auth/login") {
    const identifier = requiredString(body.identifier, "Email or employee ID", 254).toLowerCase();
    const password = requiredString(body.password, "Password", 256, 1);
    rateLimit(req, `login:${hash(identifier)}`, 8, 15 * 60 * 1000);
    const user = db.prepare(`
      SELECT u.* FROM users u 
      LEFT JOIN employees e ON e.user_id = u.id
      LEFT JOIN employee_applications ea ON (ea.email = u.email OR ea.reference = e.employee_id)
      WHERE (
        u.email = ? COLLATE NOCASE 
        OR e.employee_id = ? COLLATE NOCASE
        OR ea.reference = ? COLLATE NOCASE
        OR (? = 'ceo' AND u.email = 'demo.ceo@metaminds.local')
        OR (? = 'employee' AND u.email = 'demo.employee@metaminds.local')
      ) LIMIT 1
    `).get(identifier, identifier, identifier, identifier, identifier);
    if (!user) {
      const pendingApp = db.prepare(`
        SELECT reference, status, rejection_reason FROM employee_applications
        WHERE (reference = ? COLLATE NOCASE OR email = ? COLLATE NOCASE)
        ORDER BY id DESC LIMIT 1
      `).get(identifier, identifier);

      if (pendingApp) {
        if (pendingApp.status === "pending") {
          fail(403, `Application ${pendingApp.reference} is currently awaiting review and approval by the CEO. You can sign in immediately once approved.`);
        } else if (pendingApp.status === "rejected") {
          fail(403, `Application ${pendingApp.reference} was not approved. ${pendingApp.rejection_reason ? "Reason: " + pendingApp.rejection_reason : ""}`);
        }
      }
      fail(401, "Email/employee ID or password is incorrect.");
    }
    if (!user.active || !user.password_hash || !verifyPassword(password, user.password_hash)) {
      fail(401, "Email/employee ID or password is incorrect.");
    }
    if (context.jar.mm_session) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(hash(context.jar.mm_session));
    const session = makeSession(res, user.id);
    audit(user.id, "auth.login", "user", user.id);
    return { status: 200, body: { user: safeUser(sessions.get(hash(session.rawSession), timestamp())), csrfToken: session.csrf } };
  }
  if (method === "POST" && path === "/api/auth/logout") {
    const user = requireUser(context);
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(context.user.token_hash);
    audit(user.user_id, "auth.logout", "user", user.user_id);
    setCookies(res, [cookieHeader("mm_session", "", 0, true), cookieHeader("mm_csrf", "", 0, false)]);
    return { status: 200, body: { ok: true } };
  }
  if (method === "POST" && path === "/api/auth/activate") {
    const token = requiredString(body.token, "Activation token", 128, 20);
    const password = requiredString(body.password, "Password", 256, 12);
    if (!/[A-Z]/.test(password)) fail(400, "Password must include at least one capital letter (A-Z).");
    if (!/[0-9]/.test(password)) fail(400, "Password must include at least one number (0-9).");
    if (!/[^A-Za-z0-9]/.test(password)) fail(400, "Password must include at least one special character (!@#$%^&*...).");
    const tokenRow = db.prepare("SELECT * FROM activation_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?").get(hash(token), timestamp());
    if (!tokenRow) fail(400, "This activation link is invalid, expired, or already used.");
    withTransaction(() => {
      db.prepare("UPDATE users SET password_hash = ?, active = 1 WHERE id = ? AND active = 0")
        .run(hashPassword(password), tokenRow.user_id);
      db.prepare("UPDATE activation_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL").run(timestamp(), tokenRow.id);
      audit(tokenRow.user_id, "account.activated", "user", tokenRow.user_id);
    });
    return { status: 200, body: { ok: true, message: "Account activated. You can now sign in." } };
  }
  if (method === "POST" && path === "/api/auth/password-reset/request") {
    if (typeof body.email !== "string" || !body.email.trim()) fail(400, "Work email is required.");
    const email = requiredString(body.email, "Email", 254, 5).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, "Enter a valid work email address.");
    rateLimit(req, `password-reset:${hash(email)}`, 5, 60 * 60 * 1000);
    const user = db.prepare("SELECT id, role FROM users WHERE email = ? COLLATE NOCASE AND active = 1").get(email);
    if (user && smtpConfiguration().configured) {
      const rawToken = randomBytes(32).toString("base64url");
      withTransaction(() => {
        db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(timestamp(), user.id);
        db.prepare("INSERT INTO password_reset_tokens(user_id, token_hash, expires_at) VALUES (?, ?, ?)").run(
          user.id,
          hash(rawToken),
          new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        );
      });
      if (queueEmail(email, "Reset your MetaMinds Pvt. Ltd. password", `Use this one-time link within 60 minutes to reset your password: ${appUrl.origin}/?reset=${encodeURIComponent(rawToken)}`)) {
        void drainOutbox();
      }
    }
    return { status: 200, body: { ok: true, message: "If an active account matches that email and email delivery is configured, a reset link may be sent." } };
  }
  if (method === "POST" && path === "/api/auth/password-reset") {
    const token = requiredString(body.token, "Reset token", 128, 20);
    const password = requiredString(body.password, "Password", 256, 12);
    if (!/[A-Z]/.test(password)) fail(400, "Password must include at least one capital letter (A-Z).");
    if (!/[0-9]/.test(password)) fail(400, "Password must include at least one number (0-9).");
    if (!/[^A-Za-z0-9]/.test(password)) fail(400, "Password must include at least one special character (!@#$%^&*...).");
    const tokenRow = db.prepare("SELECT * FROM password_reset_tokens WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?").get(hash(token), timestamp());
    if (!tokenRow) fail(400, "This reset link is invalid, expired, or already used.");
    withTransaction(() => {
      const user = db.prepare("SELECT active FROM users WHERE id = ?").get(tokenRow.user_id);
      if (!user?.active) fail(400, "This reset link is invalid, expired, or already used.");
      const consumed = db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL AND expires_at > ?")
        .run(timestamp(), tokenRow.id, timestamp());
      if (consumed.changes !== 1) fail(400, "This reset link is invalid, expired, or already used.");
      const updated = db.prepare("UPDATE users SET password_hash = ? WHERE id = ? AND active = 1")
        .run(hashPassword(password), tokenRow.user_id);
      if (updated.changes !== 1) fail(400, "This reset link is invalid, expired, or already used.");
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(tokenRow.user_id);
      db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE user_id = ? AND used_at IS NULL").run(timestamp(), tokenRow.user_id);
      audit(tokenRow.user_id, "auth.password_reset", "user", tokenRow.user_id);
    });
    return { status: 200, body: { ok: true, message: "Password updated. Please sign in again." } };
  }
  if (method === "POST" && path === "/api/applications/verification/start") {
    return startApplicationVerification(body, context, res);
  }
  if (method === "POST" && path === "/api/applications/verification/email/send") {
    return await sendApplicationOtp(body, context);
  }
  if (method === "POST" && path === "/api/applications/verification/email/verify") {
    return verifyApplicationOtp(body, context);
  }
  if (method === "POST" && path === "/api/applications") {
    rateLimit(req, "application", 5, 60 * 60 * 1000);
    const application = createApplication(body, context);
    setCookies(res, [cookieHeader("mm_application", "", 0, true)]);
    if (application.confirmationEmailQueued) void drainOutbox();
    return { status: 201, body: application };
  }
  if (method === "GET" && path === "/api/applications/status") {
    const reference = url.searchParams.get("reference") || "";
    if (!reference) fail(400, "Reference is required.");
    const app = db.prepare(`
      SELECT id, reference, full_name AS fullName, email, position, status, rejection_reason AS rejectionReason
      FROM employee_applications
      WHERE reference = ?
    `).get(reference);
    if (!app) fail(404, "Application not found.");
    let approvedEmployeeId = null;
    if (app.status === "approved") {
      const emp = db.prepare("SELECT employee_id FROM employees WHERE user_id = (SELECT id FROM users WHERE email = ? COLLATE NOCASE) OR employee_id = ?").get(app.email, app.reference);
      approvedEmployeeId = emp?.employee_id || app.reference;
    }
    return {
      status: 200,
      body: {
        status: app.status,
        fullName: app.fullName,
        email: app.email,
        position: app.position,
        employeeId: approvedEmployeeId,
        rejectionReason: app.status === "rejected" ? app.rejectionReason : null,
      },
    };
  }
  if (method === "GET" && path === "/api/dashboard") {
    const user = requireUser(context);
    return { status: 200, body: buildDashboard(user) };
  }
  if (method === "GET" && path === "/api/applications") {
    const user = requireUser(context);
    requireRole(user, "ceo");
    const selectCols = `
      a.id, a.reference, a.full_name AS name, a.first_name AS firstName, a.last_name AS lastName,
      a.email, a.phone, a.employment_type AS employmentType, a.position, a.department,
      a.proposed_joining_date AS proposedJoiningDate, a.discussed_salary AS discussedSalary,
      a.education, a.education_10th_doc AS education10thDoc, a.education_inter_doc AS educationInterDoc,
      a.education_higher_doc AS educationHigherDoc, a.pan_front AS panFront, a.pan_back AS panBack,
      a.aadhar_front AS aadharFront, a.aadhar_back AS aadharBack, a.status,
      a.rejection_reason AS rejectionReason, a.photo_url AS photoUrl, a.created_at AS createdAt,
      e.employee_id AS employeeId
    `;
    const rawStatus = url.searchParams.get("status");
    const statusParam = rawStatus ? rawStatus.toLowerCase().trim() : "pending";
    const validStatuses = ["pending", "approved", "rejected"];

    const rows = validStatuses.includes(statusParam)
      ? db.prepare(`SELECT ${selectCols} FROM employee_applications a LEFT JOIN employees e ON e.user_id = (SELECT u.id FROM users u WHERE u.email = a.email COLLATE NOCASE) WHERE LOWER(a.status) = ? ORDER BY a.id DESC`).all(statusParam)
      : db.prepare(`SELECT ${selectCols} FROM employee_applications a LEFT JOIN employees e ON e.user_id = (SELECT u.id FROM users u WHERE u.email = a.email COLLATE NOCASE) WHERE LOWER(a.status) = 'pending' ORDER BY a.id DESC`).all();
    return { status: 200, body: rows };
  }
  const applicationAction = path.match(/^\/api\/applications\/(\d+)\/(approve|reject)$/);
  if (method === "POST" && applicationAction) {
    const user = requireUser(context);
    const id = Number(applicationAction[1]);
    if (applicationAction[2] === "approve") {
      const result = approveApplication(user, id);
      void drainOutbox();
      return { status: 200, body: result };
    }
    const result = rejectApplication(user, id, body.reason);
    void drainOutbox();
    return { status: 200, body: result };
  }
  if (method === "GET" && path === "/api/employees") {
    const user = requireUser(context);
    if (!["ceo", "team_lead", "employee"].includes(user.role)) fail(403, "Not authorized.");
    return { status: 200, body: listVisibleEmployees(user) };
  }
  if (method === "GET" && path === "/api/attendance") {
    const user = requireUser(context);
    return { status: 200, body: attendanceRecordsFor(user, url.searchParams.get("month") || currentDateInZone().slice(0, 7)) };
  }
  if (method === "GET" && path === "/api/policy") {
    requireUser(context);
    const settings = settingsObject();
    return { status: 200, body: {
      timezone: settings.timezone,
      today: currentDateInZone(settings.timezone),
      expectedWorkingMinutes: Number(settings.expected_working_minutes) || null,
      scheduledStart: settings.scheduled_start,
      scheduledEnd: settings.scheduled_end,
      absenceWarningHours: Number(settings.absence_warning_hours),
    } };
  }
  if (method === "POST" && path === "/api/attendance/check-in") {
    const user = requireUser(context);
    const employee = getEmployeeForUser(user);
    const date = currentDateInZone();
    const now = timestamp();
    try {
      db.prepare("INSERT INTO attendance_records(employee_id, attendance_date, check_in) VALUES (?, ?, ?)").run(employee.id, date, now);
    } catch (error) {
      if (error.code === "ERR_SQLITE_ERROR") fail(409, "You have already checked in for today.");
      throw error;
    }
    db.prepare("UPDATE attendance_exceptions SET status = 'resolved', resolved_at = ? WHERE employee_id = ? AND attendance_date = ? AND status != 'resolved'").run(now, employee.id, date);
    audit(user.user_id, "attendance.check_in", "attendance_record", `${employee.id}:${date}`);
    return { status: 201, body: { checkIn: now, date } };
  }
  if (method === "POST" && path === "/api/attendance/check-out") {
    const user = requireUser(context);
    const employee = getEmployeeForUser(user);
    const date = currentDateInZone();
    const record = db.prepare("SELECT * FROM attendance_records WHERE employee_id = ? AND attendance_date = ?").get(employee.id, date);
    if (!record) fail(409, "Check in before checking out.");
    if (record.check_out) fail(409, "You have already checked out for today.");
    const now = timestamp();
    const minutes = workedMinutes(record.check_in, now);
    db.prepare("UPDATE attendance_records SET check_out = ?, worked_minutes = ? WHERE id = ? AND check_out IS NULL").run(now, minutes, record.id);
    audit(user.user_id, "attendance.check_out", "attendance_record", record.id);
    return { status: 200, body: { checkOut: now, workedMinutes: minutes } };
  }
  if (method === "POST" && path === "/api/leave") {
    const user = requireUser(context);
    const employee = getEmployeeForUser(user);
    const leaveTypeId = Number(body.leaveTypeId);
    if (!Number.isInteger(leaveTypeId) || !db.prepare("SELECT 1 FROM leave_types WHERE id = ? AND active = 1").get(leaveTypeId)) {
      fail(400, "Choose an available leave type.");
    }
    const startDate = validDate(body.startDate, "Start date");
    const endDate = validDate(body.endDate, "End date");
    if (startDate > endDate) fail(400, "End date must be on or after the start date.");
    const reason = requiredString(body.reason, "Reason", 1000, 3);

    const holidaysSet = new Set(db.prepare("SELECT holiday_date FROM company_holidays").all().map((r) => r.holiday_date));
    const workingDays = countWorkingDays(startDate, endDate, holidaysSet);
    if (workingDays === 0) {
      fail(400, "The requested period contains only non-working days or company holidays.");
    }

    const year = startDate.slice(0, 4);
    const approvedRow = db.prepare(`
      SELECT COALESCE(SUM(working_days_count), 0) AS used
      FROM leave_requests lr
      JOIN leave_types lt ON lt.id = lr.leave_type_id
      WHERE lr.employee_id = ? AND lr.status = 'approved' AND lt.paid = 1
        AND strftime('%Y', lr.start_date) = ?
    `).get(employee.id, year);
    const usedDays = approvedRow?.used ?? 0;
    const entitledDays = 25;
    const remaining = Math.max(0, entitledDays - usedDays);

    let payTreatment = "full_paid";
    let requiresCeoApproval = 0;
    let excessDays = 0;

    if (workingDays > remaining) {
      payTreatment = "half_pay";
      requiresCeoApproval = 1;
      excessDays = workingDays - remaining;
    }

    const result = withTransaction(() => {
      const overlap = db.prepare(`
        SELECT 1 FROM leave_requests
        WHERE employee_id = ? AND status IN ('pending', 'approved') AND start_date <= ? AND end_date >= ?
        LIMIT 1
      `).get(employee.id, endDate, startDate);
      if (overlap) fail(409, "This request overlaps an existing pending or approved leave request.");
      const inserted = db.prepare(`
        INSERT INTO leave_requests(
          employee_id, leave_type_id, start_date, end_date, reason,
          working_days_count, pay_treatment, requires_ceo_approval, excess_days
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(employee.id, leaveTypeId, startDate, endDate, reason, workingDays, payTreatment, requiresCeoApproval, excessDays);
      audit(user.user_id, "leave.submitted", "leave_request", inserted.lastInsertRowid);

      const approvers = requiresCeoApproval
        ? db.prepare("SELECT id, email FROM users WHERE role = 'ceo' AND active = 1").all()
        : db.prepare(`
            SELECT DISTINCT u.id, u.email
            FROM team_members member
            JOIN team_members lead ON lead.team_id = member.team_id
            JOIN employees manager_employee ON manager_employee.id = lead.employee_id
            JOIN users u ON u.id = manager_employee.user_id
            WHERE member.employee_id = ? AND u.role = 'team_lead' AND u.active = 1
          `).all(employee.id);

      const targetApprovers = approvers.length ? approvers : db.prepare("SELECT id, email FROM users WHERE role = 'ceo' AND active = 1").all();
      for (const approver of targetApprovers) {
        notifyUser(approver.id, "leave", requiresCeoApproval ? "Excess leave needs CEO approval" : "Leave request submitted",
          requiresCeoApproval
            ? `Employee requested ${workingDays} days (${excessDays} days beyond 25 paid limit). CEO review required.`
            : "A new leave request is waiting for your review.");
        queueEmail(approver.email, requiresCeoApproval ? "Excess leave request pending CEO approval" : "Leave request submitted",
          "A new leave request is waiting for your review. Sign in to the people portal to review it.");
      }
      return Number(inserted.lastInsertRowid);
    });
    return { status: 201, body: { id: result, status: "pending", requiresCeoApproval, excessDays, workingDays } };
  }
  if (method === "GET" && path === "/api/leave/balance") {
    const user = requireUser(context);
    const employee = getEmployeeForUser(user);
    const year = currentDateInZone().slice(0, 4);
    const approvedRow = db.prepare(`
      SELECT COALESCE(SUM(working_days_count), 0) AS used
      FROM leave_requests lr
      JOIN leave_types lt ON lt.id = lr.leave_type_id
      WHERE lr.employee_id = ? AND lr.status = 'approved' AND lt.paid = 1
        AND strftime('%Y', lr.start_date) = ?
    `).get(employee.id, year);
    const used = approvedRow?.used ?? 0;
    const entitled = 25;
    const remaining = Math.max(0, entitled - used);
    return { status: 200, body: { entitled, used, remaining, year: Number(year) } };
  }
  if (method === "GET" && path === "/api/leave") {
    const user = requireUser(context);
    if (user.role === "ceo") {
      return { status: 200, body: db.prepare(`
        SELECT lr.id, lr.employee_id AS employeeRowId, e.full_name AS name, e.employee_id AS employeeId,
               lt.name AS leaveType, lr.start_date AS startDate, lr.end_date AS endDate, lr.reason, lr.status,
               lr.working_days_count AS workingDays, lr.pay_treatment AS payTreatment,
               lr.requires_ceo_approval AS requiresCeoApproval, lr.excess_days AS excessDays,
               lr.ceo_decision_notes AS ceoDecisionNotes, lr.created_at AS createdAt
        FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id JOIN leave_types lt ON lt.id = lr.leave_type_id
        ORDER BY lr.id DESC
      `).all() };
    }
    if (user.role === "team_lead") {
      const visible = listVisibleEmployees(user).map((employee) => employee.id);
      if (!visible.length) return { status: 200, body: [] };
      const placeholders = visible.map(() => "?").join(",");
      return { status: 200, body: db.prepare(`
        SELECT lr.id, lr.employee_id AS employeeRowId, e.full_name AS name, e.employee_id AS employeeId,
               lt.name AS leaveType, lr.start_date AS startDate, lr.end_date AS endDate, lr.reason, lr.status,
               lr.working_days_count AS workingDays, lr.pay_treatment AS payTreatment,
               lr.requires_ceo_approval AS requiresCeoApproval, lr.excess_days AS excessDays,
               lr.ceo_decision_notes AS ceoDecisionNotes, lr.created_at AS createdAt
        FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id JOIN leave_types lt ON lt.id = lr.leave_type_id
        WHERE e.id IN (${placeholders}) ORDER BY lr.id DESC
      `).all(...visible) };
    }
    const employee = getEmployeeForUser(user);
    return { status: 200, body: db.prepare(`
      SELECT lr.id, lt.name AS leaveType, lr.start_date AS startDate, lr.end_date AS endDate, lr.reason, lr.status,
             lr.working_days_count AS workingDays, lr.pay_treatment AS payTreatment,
             lr.requires_ceo_approval AS requiresCeoApproval, lr.excess_days AS excessDays,
             lr.ceo_decision_notes AS ceoDecisionNotes, lr.created_at AS createdAt
      FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id WHERE lr.employee_id = ? ORDER BY lr.id DESC
    `).all(employee.id) };
  }
  const leaveAction = path.match(/^\/api\/leave\/(\d+)\/(approve|reject)$/);
  if (method === "POST" && leaveAction) {
    const user = requireUser(context);
    requireRole(user, "ceo", "team_lead");
    const request = db.prepare("SELECT * FROM leave_requests WHERE id = ? AND status = 'pending'").get(Number(leaveAction[1]));
    if (!request) fail(404, "Pending leave request not found.");
    if (user.employee_row_id === request.employee_id) fail(403, "You cannot approve your own leave request.");
    if (!canAccessEmployee(user, request.employee_id)) fail(403, "This employee is outside your assigned team.");

    if (request.requires_ceo_approval && user.role !== "ceo") {
      fail(403, "This request exceeds the 25 paid leave quota and requires CEO authorization.");
    }

    const decision = leaveAction[2] === "approve" ? "approved" : "rejected";
    const reason = decision === "rejected" ? requiredString(body.reason, "Rejection reason", 500, 3) : null;

    let finalPayTreatment = request.pay_treatment || "full_paid";
    if (decision === "approved" && user.role === "ceo" && body.payTreatment) {
      if (["full_paid", "half_pay", "unpaid"].includes(body.payTreatment)) {
        finalPayTreatment = body.payTreatment;
      }
    }
    const ceoNotes = body.notes ? String(body.notes).slice(0, 500) : null;

    const employeeUser = db.prepare("SELECT u.id, u.email FROM employees e JOIN users u ON u.id = e.user_id WHERE e.id = ?").get(request.employee_id);
    withTransaction(() => {
      db.prepare(`
        UPDATE leave_requests
        SET status = ?, pay_treatment = ?, ceo_decision_notes = ?, reviewed_by = ?, reviewed_at = ?
        WHERE id = ? AND status = 'pending'
      `).run(decision, finalPayTreatment, ceoNotes, user.user_id, timestamp(), request.id);

      db.prepare("INSERT INTO leave_approvals(leave_request_id, reviewer_user_id, decision, reason) VALUES (?, ?, ?, ?)")
        .run(request.id, user.user_id, decision, reason || ceoNotes);

      // If approved, update leave_balances
      if (decision === "approved") {
        const year = Number(request.start_date.slice(0, 4));
        const daysToCount = finalPayTreatment === "half_pay" ? (request.working_days_count * 0.5) : request.working_days_count;
        db.prepare(`
          INSERT INTO leave_balances(employee_id, leave_type_id, period_year, entitled_days, used_days)
          VALUES (?, ?, ?, 25, ?)
          ON CONFLICT(employee_id, leave_type_id, period_year) DO UPDATE SET used_days = used_days + ?
        `).run(request.employee_id, request.leave_type_id, year, daysToCount, daysToCount);
      }

      const treatmentLabel = finalPayTreatment === "half_pay"
        ? " (Approved at 50% Half Pay)"
        : finalPayTreatment === "full_paid"
        ? " (Approved as 100% Paid Leave)"
        : "";

      notifyUser(employeeUser.id, "leave", `Leave request ${decision}`, decision === "approved"
        ? `Your leave request was approved${treatmentLabel}.`
        : `Your leave request was not approved. ${reason}`);
      queueEmail(employeeUser.email, `Leave request ${decision}`, decision === "approved"
        ? `Your leave request was approved${treatmentLabel}. Sign in to the people portal to view the details.`
        : `Your leave request was not approved. Reason: ${reason}`);
      audit(user.user_id, `leave.${decision}`, "leave_request", request.id);
    });
    return { status: 200, body: { ok: true, status: decision, payTreatment: finalPayTreatment } };
  }
  if (method === "GET" && path === "/api/leave-types") {
    requireUser(context);
    return { status: 200, body: db.prepare("SELECT id, name, paid FROM leave_types WHERE active = 1 ORDER BY name").all() };
  }
  if (method === "POST" && path === "/api/leave-types") {
    const user = requireUser(context);
    requireRole(user, "ceo");
    const name = requiredString(body.name, "Leave type", 80, 2);
    const paid = body.paid === true;
    try {
      db.prepare("INSERT INTO leave_types(name, paid) VALUES (?, ?)").run(name, paid ? 1 : 0);
    } catch (error) {
      if (error.code === "ERR_SQLITE_ERROR") fail(409, "A leave type with that name already exists.");
      throw error;
    }
    audit(user.user_id, "leave_type.created", "leave_type", name);
    return { status: 201, body: { ok: true } };
  }
  if (method === "GET" && path === "/api/teams") {
    const user = requireUser(context);
    if (user.role === "ceo") return { status: 200, body: db.prepare("SELECT id, name FROM teams ORDER BY name").all() };
    return { status: 200, body: db.prepare(`
      SELECT DISTINCT t.id, t.name FROM teams t
      JOIN team_members m ON m.team_id = t.id
      JOIN team_members lead ON lead.team_id = t.id
      WHERE lead.employee_id = ? ORDER BY t.name
    `).all(user.employee_row_id) };
  }
  if (method === "POST" && path === "/api/teams") {
    const user = requireUser(context);
    requireRole(user, "ceo");
    const name = requiredString(body.name, "Team name", 80, 2);
    let departmentId = null;
    if (typeof body.department === "string" && body.department.trim()) {
      db.prepare("INSERT OR IGNORE INTO departments(name) VALUES (?)").run(body.department.trim().slice(0, 100));
      departmentId = db.prepare("SELECT id FROM departments WHERE name = ?").get(body.department.trim().slice(0, 100)).id;
    }
    try {
      const result = db.prepare("INSERT INTO teams(name, department_id) VALUES (?, ?)").run(name, departmentId);
      audit(user.user_id, "team.created", "team", result.lastInsertRowid);
      return { status: 201, body: { id: Number(result.lastInsertRowid), name } };
    } catch (error) {
      if (error.code === "ERR_SQLITE_ERROR") fail(409, "A team with that name already exists.");
      throw error;
    }
  }
  if (method === "POST" && path === "/api/teams/assign") {
    const user = requireUser(context);
    requireRole(user, "ceo");
    const teamId = Number(body.teamId);
    const employeeId = Number(body.employeeId);
    const role = body.role;
    if (!["team_lead", "employee"].includes(role)) fail(400, "Role must be Team Lead or employee.");
    if (!db.prepare("SELECT id FROM teams WHERE id = ?").get(teamId) || !db.prepare("SELECT id FROM employees WHERE id = ?").get(employeeId)) fail(404, "Team or employee not found.");
    withTransaction(() => {
      db.prepare("DELETE FROM team_members WHERE employee_id = ?").run(employeeId);
      db.prepare("INSERT INTO team_members(team_id, employee_id) VALUES (?, ?)").run(teamId, employeeId);
      const targetUserId = db.prepare("SELECT user_id FROM employees WHERE id = ?").get(employeeId).user_id;
      db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, targetUserId);
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(targetUserId);
      db.prepare("UPDATE employees SET team_id = ? WHERE id = ?").run(teamId, employeeId);
      audit(user.user_id, "team.member_assigned", "employee", employeeId);
    });
    return { status: 200, body: { ok: true } };
  }
  if (method === "GET" && path === "/api/settings") {
    const user = requireUser(context);
    requireRole(user, "ceo");
    return { status: 200, body: {
      settings: settingsObject(),
      emailConfigured: smtpConfiguration().configured,
      ceoNotificationConfigured: Boolean(process.env.CEO_NOTIFICATION_EMAIL),
      pendingEmails: db.prepare("SELECT COUNT(*) AS count FROM email_outbox WHERE status IN ('pending', 'sending')").get().count,
      failedEmails: db.prepare("SELECT COUNT(*) AS count FROM email_outbox WHERE status = 'failed'").get().count,
      payrollConfigured: false,
    } };
  }
  if (method === "POST" && path === "/api/settings") {
    const user = requireUser(context);
    requireRole(user, "ceo");
    const allowed = new Set(["timezone", "scheduled_start", "scheduled_end", "expected_working_minutes", "absence_warning_hours"]);
    withTransaction(() => {
    for (const [key, value] of Object.entries(body)) {
      if (!allowed.has(key) || typeof value !== "string") fail(400, "Settings contain an unsupported or invalid value.");
      const sanitized = value.trim();
      if (key === "timezone") {
        try {
          new Intl.DateTimeFormat("en-US", { timeZone: sanitized });
        } catch {
          fail(400, "Timezone must be a supported IANA timezone.");
        }
      } else if (["scheduled_start", "scheduled_end"].includes(key) && !/^([01]\d|2[0-3]):[0-5]\d$/.test(sanitized)) {
        fail(400, `${key} must use 24-hour HH:MM format.`);
      } else if (key === "expected_working_minutes" && sanitized && (!/^\d+$/.test(sanitized) || Number(sanitized) < 1 || Number(sanitized) > 1440)) {
        fail(400, "Expected paid working time must be 1-1440 minutes, or blank until configured.");
      } else if (key === "absence_warning_hours" && (!/^\d+$/.test(sanitized) || Number(sanitized) < 1 || Number(sanitized) > 24)) {
        fail(400, "Absence warning period must be 1-24 hours.");
      }
      setSetting(key, sanitized);
    }
    audit(user.user_id, "company.settings_updated", "company_settings", "attendance_policy");
    });
    return { status: 200, body: { settings: settingsObject() } };
  }
  if (method === "POST" && path === "/api/settings/email/retry") {
    const user = requireUser(context);
    requireRole(user, "ceo");
    const mailConfiguration = smtpConfiguration();
    if (!mailConfiguration.configured) fail(503, mailConfiguration.message);
    const result = db.prepare("UPDATE email_outbox SET status = 'pending', attempts = 0, last_error = NULL WHERE status = 'failed'").run();
    audit(user.user_id, "email.failed_messages_retried", "email_outbox", result.changes);
    return { status: 200, body: { queued: result.changes } };
  }
  if (method === "GET" && path === "/api/payroll") {
    const user = requireUser(context);
    requireRole(user, "ceo", "team_lead", "employee");
    const requestedPeriod = url.searchParams.get("period") || currentDateInZone().slice(0, 7);
    const [yearStr, monthStr] = requestedPeriod.split("-");
    const year = Number(yearStr) || 2026;
    const month = Number(monthStr) || 10;
    const monthStart = `${requestedPeriod}-01`;
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const monthEnd = `${requestedPeriod}-${String(lastDay).padStart(2, "0")}`;

    const holidaysSet = new Set(db.prepare("SELECT holiday_date FROM company_holidays").all().map((r) => r.holiday_date));
    const totalWorkingDays = countWorkingDays(monthStart, monthEnd, holidaysSet);

    // Filter employees: CEO sees all active employees; employees see only themselves
    const employees = user.role === "ceo"
      ? db.prepare(`
          SELECT e.id, e.employee_id AS employeeId, e.full_name AS name, e.position,
                 d.name AS department, e.photo_url AS photoUrl, u.email
          FROM employees e
          JOIN users u ON u.id = e.user_id
          LEFT JOIN departments d ON d.id = e.department_id
          WHERE u.active = 1
          ORDER BY e.full_name
        `).all()
      : db.prepare(`
          SELECT e.id, e.employee_id AS employeeId, e.full_name AS name, e.position,
                 d.name AS department, e.photo_url AS photoUrl, u.email
          FROM employees e
          JOIN users u ON u.id = e.user_id
          LEFT JOIN departments d ON d.id = e.department_id
          WHERE e.id = ?
        `).all(user.employee_row_id);

    const existingRun = db.prepare("SELECT * FROM payroll_runs WHERE period = ?").get(requestedPeriod);

    const items = employees.map((emp) => {
      // 1. Check salary structure
      const struct = db.prepare("SELECT id FROM salary_structures WHERE employee_id = ? ORDER BY effective_from DESC LIMIT 1").get(emp.id);
      let basic = 37500;
      let hra = 22500;
      let special = 15000;
      if (struct) {
        const comps = db.prepare("SELECT name, kind, amount_minor FROM salary_components WHERE salary_structure_id = ?").all(struct.id);
        const bComp = comps.find(c => c.name.toLowerCase().includes("basic"));
        const hComp = comps.find(c => c.name.toLowerCase().includes("hra") || c.name.toLowerCase().includes("rent"));
        const sComp = comps.find(c => c.name.toLowerCase().includes("special"));
        if (bComp) basic = Math.round(bComp.amount_minor / 100);
        if (hComp) hra = Math.round(hComp.amount_minor / 100);
        if (sComp) special = Math.round(sComp.amount_minor / 100);
      }
      const gross = basic + hra + special;

      // 2. Attendance & Leaves in this period
      const attendanceCount = db.prepare(`
        SELECT COUNT(DISTINCT attendance_date) AS count
        FROM attendance_records
        WHERE employee_id = ? AND attendance_date >= ? AND attendance_date <= ? AND (worked_minutes > 0 OR check_out IS NULL)
      `).get(emp.id, monthStart, monthEnd)?.count ?? 0;

      const leaves = db.prepare(`
        SELECT start_date, end_date, pay_treatment, working_days_count
        FROM leave_requests
        WHERE employee_id = ? AND status = 'approved' AND start_date <= ? AND end_date >= ?
      `).all(emp.id, monthEnd, monthStart);

      let paidLeaveDays = 0;
      let halfPayLeaveDays = 0;
      for (const l of leaves) {
        const spanStart = l.start_date < monthStart ? monthStart : l.start_date;
        const spanEnd = l.end_date > monthEnd ? monthEnd : l.end_date;
        const days = countWorkingDays(spanStart, spanEnd, holidaysSet);
        if (l.pay_treatment === "half_pay") {
          halfPayLeaveDays += days;
        } else {
          paidLeaveDays += days;
        }
      }

      const presentDays = attendanceCount;
      const payableDays = Math.min(totalWorkingDays, presentDays + paidLeaveDays + (halfPayLeaveDays * 0.5));
      const unpaidDays = Math.max(0, totalWorkingDays - payableDays);
      const dailyRate = totalWorkingDays > 0 ? (gross / totalWorkingDays) : 0;
      const leaveDeduction = Math.round(unpaidDays * dailyRate);

      // Statutory deductions (PF, Professional Tax, TDS)
      const pf = Math.min(1800, Math.round(basic * 0.12));
      const pt = 200;
      const tds = Math.round(gross * 0.05);
      const totalDeductions = leaveDeduction + pf + pt + tds;
      const net = Math.max(0, gross - totalDeductions);

      return {
        employeeId: emp.id,
        code: emp.employeeId,
        name: emp.name,
        position: emp.position,
        department: emp.department || "Engineering",
        photoUrl: emp.photoUrl,
        email: emp.email,
        basic,
        hra,
        special,
        gross,
        totalWorkingDays,
        presentDays,
        paidLeaveDays,
        halfPayLeaveDays,
        unpaidDays,
        leaveDeduction,
        pf,
        pt,
        tds,
        totalDeductions,
        net,
      };
    });

    const totalGross = items.reduce((s, i) => s + i.gross, 0);
    const totalDeductions = items.reduce((s, i) => s + i.totalDeductions, 0);
    const totalNet = items.reduce((s, i) => s + i.net, 0);

    const historicalRuns = db.prepare("SELECT id, period, status, finalized_at AS finalizedAt FROM payroll_runs ORDER BY period DESC").all();

    return {
      status: 200,
      body: {
        period: requestedPeriod,
        totalWorkingDays,
        items,
        run: existingRun ? {
          id: existingRun.id,
          period: existingRun.period,
          status: existingRun.status,
          finalizedAt: existingRun.finalized_at,
          finalizedBy: existingRun.finalized_by,
        } : null,
        stats: {
          totalGross,
          totalDeductions,
          totalNet,
          totalEmployees: items.length,
        },
        historicalRuns,
      }
    };
  }
  if (method === "POST" && path === "/api/payroll/runs/generate") {
    const user = requireUser(context);
    requireRole(user, "ceo");
    const period = requiredString(body.period, "Period", 7, 7);
    const run = db.prepare(`
      INSERT INTO payroll_runs(period, status) VALUES (?, 'draft')
      ON CONFLICT(period) DO UPDATE SET status = 'draft'
      RETURNING id, period, status
    `).get(period);
    audit(user.user_id, "payroll.generated", "payroll_run", run.id);
    return { status: 200, body: run };
  }
  if (method === "POST" && path === "/api/payroll/runs/disburse") {
    const user = requireUser(context);
    requireRole(user, "ceo");
    const period = requiredString(body.period, "Period", 7, 7);
    const run = db.prepare(`
      INSERT INTO payroll_runs(period, status, finalized_by, finalized_at)
      VALUES (?, 'finalized', ?, ?)
      ON CONFLICT(period) DO UPDATE SET status = 'finalized', finalized_by = excluded.finalized_by, finalized_at = excluded.finalized_at
      RETURNING id, period, status, finalized_at AS finalizedAt
    `).get(period, user.user_id, timestamp());

    for (const emp of db.prepare("SELECT user_id, full_name FROM employees").all()) {
      notifyUser(emp.user_id, "payroll", "Salary Disbursed", `Your salary and payslip for ${period} have been approved and disbursed.`);
    }
    audit(user.user_id, "payroll.disbursed", "payroll_run", run.id);
    return { status: 200, body: { ok: true, run } };
  }
  if (method === "GET" && path === "/api/notifications") {
    const user = requireUser(context);
    return { status: 200, body: db.prepare("SELECT id, category, title, message, read_at AS readAt, created_at AS createdAt FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30").all(user.user_id) };
  }
  if (method === "POST" && path === "/api/notifications/read") {
    const user = requireUser(context);
    const id = Number(body.id);
    if (!Number.isInteger(id)) fail(400, "Notification ID is invalid.");
    db.prepare("UPDATE notifications SET read_at = ? WHERE id = ? AND user_id = ?").run(timestamp(), id, user.user_id);
    return { status: 200, body: { ok: true } };
  }
  if (method === "GET" && path === "/api/audit") {
    const user = requireUser(context);
    requireRole(user, "ceo");
    return { status: 200, body: db.prepare(`
      SELECT a.action, a.entity_type AS entityType, a.entity_id AS entityId, a.created_at AS createdAt, u.email AS actor
      FROM audit_logs a LEFT JOIN users u ON u.id = a.actor_user_id ORDER BY a.id DESC LIMIT 100
    `).all() };
  }
  fail(404, "This route does not exist.");
}

function mimeType(path) {
  return ({
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
  })[extname(path)] || "application/octet-stream";
}

function serveStatic(req, res, pathname) {
  const dist = resolve("dist");
  if (!existsSync(dist)) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Frontend build not found. Run npm run build.");
    return;
  }
  let target = resolve(dist, `.${decodeURIComponent(pathname)}`);
  if (!target.startsWith(`${dist}${sep}`) && target !== resolve(dist, "index.html")) {
    res.writeHead(403).end("Forbidden");
    return;
  }
  if (!existsSync(target)) target = resolve(dist, "index.html");
  const contentType = mimeType(target);
  res.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": target.endsWith("index.html") ? "no-cache" : "public, max-age=31536000, immutable",
  });
  if (req.method === "HEAD") return res.end();
  createReadStream(target).pipe(res);
}

const server = createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Cache-Control", "no-store");
  if (isProduction) {
    res.setHeader("Content-Security-Policy", "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  try {
    const url = new URL(req.url ?? "/", appUrl);
    if (url.pathname.startsWith("/api/")) {
      if (!["GET", "POST", "HEAD"].includes(req.method ?? "")) fail(405, "Method not allowed.");
      if (req.method !== "GET" && req.method !== "HEAD" && req.headers["content-type"]?.split(";")[0] !== "application/json") {
        fail(415, "Requests must use application/json.");
      }
      const context = { ...getSession(req, res), req };
      const body = req.method === "POST" ? await readBody(req) : {};
      const result = await route(req, res, context, body, url);
      res.writeHead(result.status, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(result.body));
      return;
    }
    if (isProduction && req.headers.origin) {
      try {
        if (new URL(req.headers.origin).origin !== appUrl.origin) fail(403, "Request origin is not allowed.");
      } catch {
        fail(403, "Request origin is not allowed.");
      }
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    if (status >= 500) {
      console.error("Request failed", {
        method: req.method,
        path: req.url?.split("?")[0],
        message: error.message,
        stack: error.stack,
        error: error.code ?? "INTERNAL_ERROR",
      });
    }
    if (res.headersSent) return res.end();
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ error: status === 500 ? (error.message || "The request could not be completed.") : error.message }));
  }
});

db.prepare("UPDATE email_outbox SET status = 'pending' WHERE status = 'sending'").run();
db.prepare("DELETE FROM application_verifications WHERE created_at <= ?").run(new Date(Date.now() - 30 * 60 * 1000).toISOString());
db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(timestamp());
setInterval(() => {
  try {
    runAttendanceExceptions();
  } catch (error) {
    console.error("Attendance exception processing failed", { error: error.code ?? "JOB_ERROR" });
  }
  void drainOutbox();
}, 60_000).unref();
void drainOutbox();
if (!isProduction) {
  try {
    ensureDemoAccounts();
  } catch (error) {
    console.error("Failed to ensure demo accounts", error);
  }
}
server.listen(port, () => {
  console.log(`MetaMinds Pvt. Ltd. portal API listening on http://localhost:${port}`);
  if (!smtpConfiguration().configured) console.log(smtpConfiguration().message);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    server.close();
    await delay(50);
    db.close();
    process.exit(0);
  });
}
