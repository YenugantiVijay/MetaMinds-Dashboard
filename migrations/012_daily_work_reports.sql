CREATE TABLE IF NOT EXISTS daily_work_reports (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  attendance_record_id INTEGER NOT NULL REFERENCES attendance_records(id) ON DELETE CASCADE,
  work_date TEXT NOT NULL,
  work_summary TEXT NOT NULL,
  project_reference TEXT,
  blockers TEXT,
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT,
  UNIQUE(attendance_record_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_work_reports_emp_date ON daily_work_reports(employee_id, work_date);
CREATE INDEX IF NOT EXISTS idx_daily_work_reports_date ON daily_work_reports(work_date);
