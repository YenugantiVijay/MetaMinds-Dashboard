import { evaluateAttendanceDayPolicy, localDateTimeToUtc } from "./domain.mjs";

export const ATTENDANCE_TARGET_MINUTES = 480;
export const ATTENDANCE_WARNING_ELAPSED_MINUTES = 540;
export const ATTENDANCE_MAX_ELAPSED_MINUTES = 600;
const MINUTE_MS = 60_000;

export function companyDateAt(instant, timezone) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date(instant));
}

export function nextWorkingDayDeadline(cutoff, timezone, holidays = new Map()) {
  const base = companyDateAt(cutoff, timezone);
  const cursor = new Date(`${base}T12:00:00.000Z`);
  for (let count = 0; count < 370; count += 1) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const date = cursor.toISOString().slice(0, 10);
    if (evaluateAttendanceDayPolicy(date, holidays).isWorkingDay) {
      return localDateTimeToUtc(date, "23:59", timezone).toISOString();
    }
  }
  throw new Error("No working day found for attendance report deadline.");
}

// The totals are always server-derived. Break intervals are clipped to the
// session boundaries to avoid counting a break beyond automatic checkout.
export function sessionDurations(db, record, until) {
  const start = Date.parse(record.check_in);
  const end = new Date(until).valueOf();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    throw new Error("Invalid attendance timestamps.");
  }
  const breaks = db.prepare(
    "SELECT break_start, break_end FROM attendance_breaks WHERE attendance_record_id = ? ORDER BY break_start",
  ).all(record.id);
  let breakMs = 0;
  let lastEnd = start;
  for (const interval of breaks) {
    const from = Date.parse(interval.break_start);
    const to = interval.break_end ? Date.parse(interval.break_end) : end;
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    // Clamp and union overlapping intervals rather than double-count them.
    const clippedStart = Math.max(start, from, lastEnd);
    const clippedEnd = Math.min(end, to);
    if (clippedEnd > clippedStart) {
      breakMs += clippedEnd - clippedStart;
      lastEnd = clippedEnd;
    }
  }
  const elapsedMinutes = Math.floor((end - start) / MINUTE_MS);
  const breakMinutes = Math.min(elapsedMinutes, Math.floor(breakMs / MINUTE_MS));
  return {
    elapsedMinutes,
    breakMinutes,
    activeWorkMinutes: Math.max(0, elapsedMinutes - breakMinutes),
  };
}

// Designed for an idempotent, restart-safe server-side minute worker.
// The caller supplies the existing transactional notification/email/audit helpers.
export function runAttendanceAutomation({
  db, withTransaction, notifyUser, queueEmail, audit,
  now = new Date(), timezone = "Asia/Kolkata", holidays = new Map(),
}) {
  const policy = db.prepare("SELECT activated_at FROM attendance_automation_policy WHERE id = 1").get();
  if (!policy) return { standard: 0, warned: 0, closed: 0, overdue: 0 };
  const nowDate = new Date(now);
  const nowMs = nowDate.valueOf();
  if (!Number.isFinite(nowMs)) throw new Error("Automation clock is invalid.");
  const nowIso = nowDate.toISOString();
  const result = { standard: 0, warned: 0, closed: 0, overdue: 0 };

  const openSessions = db.prepare(`
    SELECT a.id, a.employee_id, a.check_in, a.attendance_date,
           e.user_id, u.email
    FROM attendance_records a
    JOIN employees e ON e.id = a.employee_id
    JOIN users u ON u.id = e.user_id
    WHERE a.check_out IS NULL AND a.check_in >= ?
    ORDER BY a.check_in
  `).all(policy.activated_at);

  for (const session of openSessions) {
    const started = Date.parse(session.check_in);
    if (!Number.isFinite(started) || started > nowMs) continue;
    const cutoffIso = new Date(started + ATTENDANCE_MAX_ELAPSED_MINUTES * MINUTE_MS).toISOString();

    if (nowMs >= Date.parse(cutoffIso)) {
      withTransaction(() => {
        const current = db.prepare("SELECT * FROM attendance_records WHERE id = ? AND check_out IS NULL").get(session.id);
        if (!current) return;
        // The recorded automatic cutoff is exact even if the worker starts late.
        db.prepare(`
          UPDATE attendance_breaks SET break_end = ?
          WHERE attendance_record_id = ? AND break_end IS NULL
        `).run(cutoffIso, session.id);
        const totals = sessionDurations(db, current, cutoffIso);
        const updated = db.prepare(`
          UPDATE attendance_records
          SET check_out = ?, worked_minutes = ?, break_minutes = ?,
              status = 'completed', checkout_reason = 'automatic_timeout',
              checkout_note = 'Automatically closed at the 10-hour elapsed-session limit.'
          WHERE id = ? AND check_out IS NULL
        `).run(cutoffIso, totals.activeWorkMinutes, totals.breakMinutes, session.id);
        if (updated.changes !== 1) return;
        const deadline = nextWorkingDayDeadline(cutoffIso, timezone, holidays);
        db.prepare(`
          INSERT INTO attendance_automation(attendance_record_id, auto_closed_at, report_due_at)
          VALUES (?, ?, ?)
          ON CONFLICT(attendance_record_id) DO UPDATE SET
            auto_closed_at = excluded.auto_closed_at, report_due_at = excluded.report_due_at
        `).run(session.id, cutoffIso, deadline);
        notifyUser(session.user_id, "attendance", "Attendance automatically checked out",
          "Your 10-hour attendance session was closed. Please submit your daily work summary by the next scheduled working day.");
        queueEmail(session.email, "MetaMinds | Automatic check-out recorded",
          `Your attendance session was closed at the 10-hour elapsed limit. Please sign in to submit your daily work report by ${deadline}. If your recorded work hours are incorrect, request an attendance correction.`);
        for (const manager of db.prepare("SELECT id FROM users WHERE role = 'ceo' AND active = 1").all()) {
          notifyUser(manager.id, "attendance", "Automatic check-out needs work report",
            `An employee session was automatically closed and its daily report is pending (attendance record ${session.id}).`);
        }
        audit(null, "attendance.automatically_checked_out", "attendance_record", session.id);
        result.closed += 1;
      });
      continue;
    }

    const totals = sessionDurations(db, session, nowIso);
    if (totals.activeWorkMinutes >= ATTENDANCE_TARGET_MINUTES) {
      withTransaction(() => {
        db.prepare("INSERT OR IGNORE INTO attendance_automation(attendance_record_id) VALUES (?)").run(session.id);
        const updated = db.prepare(`
          UPDATE attendance_automation SET standard_notified_at = ?
          WHERE attendance_record_id = ? AND standard_notified_at IS NULL
        `).run(nowIso, session.id);
        if (updated.changes !== 1) return;
        notifyUser(session.user_id, "attendance", "Standard workday completed",
          "You have recorded eight active work hours. Submit your work summary and check out when you finish.");
        result.standard += 1;
      });
    }
    if (totals.elapsedMinutes >= ATTENDANCE_WARNING_ELAPSED_MINUTES) {
      withTransaction(() => {
        db.prepare("INSERT OR IGNORE INTO attendance_automation(attendance_record_id) VALUES (?)").run(session.id);
        const updated = db.prepare(`
          UPDATE attendance_automation SET warning_notified_at = ?
          WHERE attendance_record_id = ? AND warning_notified_at IS NULL
        `).run(nowIso, session.id);
        if (updated.changes !== 1) return;
        notifyUser(session.user_id, "attendance", "Your session is approaching automatic check-out",
          "Your session has reached nine elapsed hours. It will close automatically at ten hours.");
        queueEmail(session.email, "MetaMinds | Work session reminder",
          "Your work session has reached nine elapsed hours. Please check out and submit your daily report before the ten-hour automatic cutoff.");
        audit(null, "attendance.auto_checkout_warning", "attendance_record", session.id);
        result.warned += 1;
      });
    }
  }

  const overdue = db.prepare(`
    SELECT a.attendance_record_id, e.user_id, u.email
    FROM attendance_automation a
    JOIN attendance_records r ON r.id = a.attendance_record_id
    JOIN employees e ON e.id = r.employee_id
    JOIN users u ON u.id = e.user_id
    WHERE a.auto_closed_at IS NOT NULL
      AND a.report_submitted_at IS NULL
      AND a.report_due_at < ?
      AND a.overdue_notified_at IS NULL
  `).all(nowIso);
  for (const row of overdue) {
    withTransaction(() => {
      const changed = db.prepare(`
        UPDATE attendance_automation SET overdue_notified_at = ?
        WHERE attendance_record_id = ? AND report_submitted_at IS NULL AND overdue_notified_at IS NULL
      `).run(nowIso, row.attendance_record_id);
      if (changed.changes !== 1) return;
      notifyUser(row.user_id, "attendance", "Daily work report overdue",
        "Your automatic check-out report is overdue. Please submit your work summary as soon as possible.");
      queueEmail(row.email, "MetaMinds | Daily work report overdue",
        "Your daily work report following automatic check-out is overdue. Please sign in and submit it.");
      result.overdue += 1;
    });
  }
  return result;
}
