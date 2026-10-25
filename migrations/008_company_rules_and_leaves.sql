-- Migration 008: Company rules, Indian calendar public holidays, and 25 paid leaves policy

ALTER TABLE leave_requests ADD COLUMN working_days_count REAL DEFAULT 0;
ALTER TABLE leave_requests ADD COLUMN pay_treatment TEXT DEFAULT 'full_paid';
ALTER TABLE leave_requests ADD COLUMN requires_ceo_approval INTEGER NOT NULL DEFAULT 0;
ALTER TABLE leave_requests ADD COLUMN excess_days REAL DEFAULT 0;
ALTER TABLE leave_requests ADD COLUMN ceo_decision_notes TEXT;

-- Update company settings to enforce 8 hours (480 mins) and 25 annual paid leaves
INSERT INTO company_settings(key, value) VALUES ('expected_working_minutes', '480')
  ON CONFLICT(key) DO UPDATE SET value = '480';

INSERT INTO company_settings(key, value) VALUES ('annual_paid_leaves', '25')
  ON CONFLICT(key) DO UPDATE SET value = '25';

-- Seed Indian Public / Gazetted Holidays
INSERT OR IGNORE INTO company_holidays(holiday_date, name) VALUES
  ('2025-01-26', 'Republic Day'),
  ('2025-03-14', 'Holi'),
  ('2025-03-31', 'Id-ul-Fitr'),
  ('2025-04-14', 'Dr. B.R. Ambedkar Jayanti'),
  ('2025-04-18', 'Good Friday'),
  ('2025-05-01', 'Maharashtra / May Day'),
  ('2025-06-07', 'Id-ul-Zuha (Bakrid)'),
  ('2025-08-15', 'Independence Day'),
  ('2025-09-05', 'Milad-un-Nabi'),
  ('2025-10-02', 'Mahatma Gandhi Jayanti'),
  ('2025-10-20', 'Diwali (Deepavali)'),
  ('2025-11-05', 'Guru Nanak Jayanti'),
  ('2025-12-25', 'Christmas Day'),
  ('2026-01-26', 'Republic Day'),
  ('2026-03-04', 'Holi'),
  ('2026-03-21', 'Id-ul-Fitr'),
  ('2026-04-03', 'Good Friday'),
  ('2026-04-14', 'Dr. B.R. Ambedkar Jayanti'),
  ('2026-05-01', 'Maharashtra / May Day'),
  ('2026-05-31', 'Id-ul-Zuha (Bakrid)'),
  ('2026-08-15', 'Independence Day'),
  ('2026-09-04', 'Milad-un-Nabi'),
  ('2026-10-02', 'Mahatma Gandhi Jayanti'),
  ('2026-10-20', 'Dussehra (Vijayadashami)'),
  ('2026-11-08', 'Diwali (Deepavali)'),
  ('2026-11-24', 'Guru Nanak Jayanti'),
  ('2026-12-25', 'Christmas Day'),
  ('2027-01-26', 'Republic Day'),
  ('2027-03-23', 'Holi'),
  ('2027-08-15', 'Independence Day'),
  ('2027-10-02', 'Mahatma Gandhi Jayanti'),
  ('2027-12-25', 'Christmas Day');

-- Initialize 25 paid leave entitlement for all existing employees
INSERT OR IGNORE INTO leave_balances(employee_id, leave_type_id, period_year, entitled_days, used_days)
SELECT e.id, lt.id, 2026, 25, 0
FROM employees e
CROSS JOIN leave_types lt
WHERE lt.paid = 1;
