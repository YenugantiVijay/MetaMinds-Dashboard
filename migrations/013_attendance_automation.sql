-- Attendance automation applies only to sessions started after this migration is installed.
-- Historical and previously open sessions remain untouched.
CREATE TABLE IF NOT EXISTS attendance_automation_policy (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  activated_at TEXT NOT NULL
);
INSERT OR IGNORE INTO attendance_automation_policy(id, activated_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE TABLE IF NOT EXISTS attendance_automation (
  attendance_record_id INTEGER PRIMARY KEY REFERENCES attendance_records(id) ON DELETE CASCADE,
  standard_notified_at TEXT,
  warning_notified_at TEXT,
  auto_closed_at TEXT,
  report_due_at TEXT,
  report_submitted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_attendance_auto_pending
  ON attendance_automation(report_due_at, report_submitted_at)
  WHERE auto_closed_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_attendance_open_sessions
  ON attendance_records(check_in)
  WHERE check_out IS NULL;
