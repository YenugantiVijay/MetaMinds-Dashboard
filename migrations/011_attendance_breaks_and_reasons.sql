ALTER TABLE attendance_records ADD COLUMN checkout_reason TEXT;
ALTER TABLE attendance_records ADD COLUMN checkout_note TEXT;
ALTER TABLE attendance_records ADD COLUMN break_minutes INTEGER DEFAULT 0;
ALTER TABLE attendance_records ADD COLUMN status TEXT DEFAULT 'completed';

UPDATE attendance_records
SET status = CASE WHEN check_out IS NOT NULL THEN 'completed' ELSE 'active' END
WHERE status IS NULL OR status = 'completed';

CREATE TABLE IF NOT EXISTS attendance_breaks (
  id INTEGER PRIMARY KEY,
  attendance_record_id INTEGER NOT NULL REFERENCES attendance_records(id),
  break_start TEXT NOT NULL,
  break_end TEXT
);

CREATE INDEX IF NOT EXISTS idx_attendance_breaks_record ON attendance_breaks(attendance_record_id);
