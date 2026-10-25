ALTER TABLE employee_applications ADD COLUMN password_hash TEXT;
ALTER TABLE employee_applications ADD COLUMN email_verified_at TEXT;
ALTER TABLE employee_applications ADD COLUMN phone_verified_at TEXT;

CREATE TABLE application_verifications (
  session_hash TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT,
  mobile TEXT,
  email_code_hash TEXT,
  email_expires_at TEXT,
  email_verified_at TEXT,
  email_attempts INTEGER NOT NULL DEFAULT 0,
  phone_code_hash TEXT,
  phone_expires_at TEXT,
  phone_verified_at TEXT,
  phone_attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE employee_id_year_sequences (
  year INTEGER PRIMARY KEY CHECK (year BETWEEN 2000 AND 9999),
  next_value INTEGER NOT NULL CHECK (next_value > 0)
);
