CREATE TABLE IF NOT EXISTS attendance_reminders (
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  attendance_date TEXT NOT NULL,
  reminder_hour INTEGER NOT NULL CHECK (reminder_hour BETWEEN 0 AND 23),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (employee_id, attendance_date, reminder_hour)
);

ALTER TABLE employees ADD COLUMN photo_url TEXT;

UPDATE company_settings SET value = '18:00' WHERE key = 'scheduled_end' AND value = '17:00';
UPDATE company_settings SET value = '480' WHERE key = 'expected_working_minutes' AND value = '';
