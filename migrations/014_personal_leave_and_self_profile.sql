-- Company personal leave policy introduced 2026-11; preserve all historical paid-leave records.
ALTER TABLE leave_requests ADD COLUMN policy_mode TEXT NOT NULL DEFAULT 'legacy'
  CHECK (policy_mode IN ('legacy', 'personal'));
ALTER TABLE leave_requests ADD COLUMN reason_category TEXT;
ALTER TABLE leave_requests ADD COLUMN exemption_day INTEGER NOT NULL DEFAULT 0
  CHECK (exemption_day IN (0,1));
-- Exactly one approved exemption day per employee per calendar year.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_exemption_per_year
  ON leave_requests(employee_id, substr(start_date, 1, 4))
  WHERE exemption_day = 1 AND status = 'approved';

-- Personal leave category is created lazily on the first request, after legacy seeds.

-- Employee-owned non-identity contact details; no PAN/Aadhaar or bank information.
CREATE TABLE IF NOT EXISTS employee_self_profiles (
  employee_id INTEGER PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  phone TEXT NOT NULL DEFAULT '',
  address TEXT NOT NULL DEFAULT '',
  emergency_name TEXT NOT NULL DEFAULT '',
  emergency_relationship TEXT NOT NULL DEFAULT '',
  emergency_phone TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
