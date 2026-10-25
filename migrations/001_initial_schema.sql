CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  password_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('ceo', 'team_lead', 'employee')),
  active INTEGER NOT NULL DEFAULT 0 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS teams (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  department_id INTEGER REFERENCES departments(id)
);
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  employee_id TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  employment_type TEXT NOT NULL CHECK (employment_type IN ('employee', 'intern')),
  position TEXT NOT NULL,
  department_id INTEGER REFERENCES departments(id),
  team_id INTEGER REFERENCES teams(id),
  proposed_joining_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS team_members (
  team_id INTEGER NOT NULL REFERENCES teams(id),
  employee_id INTEGER NOT NULL UNIQUE REFERENCES employees(id),
  PRIMARY KEY(team_id, employee_id)
);
CREATE TABLE IF NOT EXISTS employee_applications (
  id INTEGER PRIMARY KEY,
  reference TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  mobile TEXT NOT NULL,
  employment_type TEXT NOT NULL CHECK (employment_type IN ('employee', 'intern')),
  position TEXT NOT NULL,
  department TEXT NOT NULL DEFAULT '',
  proposed_joining_date TEXT NOT NULL,
  education TEXT NOT NULL DEFAULT '',
  privacy_acknowledged_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS applications_status_created ON employee_applications(status, created_at);
CREATE INDEX IF NOT EXISTS applications_email_status ON employee_applications(email, status);
CREATE TABLE IF NOT EXISTS application_documents (
  id INTEGER PRIMARY KEY,
  application_id INTEGER NOT NULL REFERENCES employee_applications(id),
  private_storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS employee_emergency_contacts (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  name TEXT NOT NULL,
  relationship TEXT NOT NULL,
  phone TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS employee_referrals (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  referral_name TEXT NOT NULL,
  referral_employee_id TEXT
);
CREATE TABLE IF NOT EXISTS employee_id_sequences (
  employment_type TEXT PRIMARY KEY CHECK (employment_type IN ('employee', 'intern')),
  next_value INTEGER NOT NULL CHECK (next_value > 0)
);
CREATE TABLE IF NOT EXISTS activation_tokens (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  csrf_hash TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS attendance_records (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  attendance_date TEXT NOT NULL,
  check_in TEXT NOT NULL,
  check_out TEXT,
  worked_minutes INTEGER,
  UNIQUE(employee_id, attendance_date)
);
CREATE TABLE IF NOT EXISTS attendance_exceptions (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  attendance_date TEXT NOT NULL,
  deadline_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'review_required', 'resolved')),
  resolved_at TEXT,
  UNIQUE(employee_id, attendance_date)
);
CREATE TABLE IF NOT EXISTS attendance_corrections (
  id INTEGER PRIMARY KEY,
  attendance_record_id INTEGER NOT NULL REFERENCES attendance_records(id),
  requested_by INTEGER NOT NULL REFERENCES users(id),
  reviewed_by INTEGER REFERENCES users(id),
  reason TEXT NOT NULL,
  proposed_check_in TEXT,
  proposed_check_out TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_at TEXT
);
CREATE TABLE IF NOT EXISTS leave_types (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  paid INTEGER NOT NULL DEFAULT 0 CHECK (paid IN (0, 1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1))
);
CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by INTEGER REFERENCES users(id),
  reviewed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (start_date <= end_date)
);
CREATE INDEX IF NOT EXISTS leave_status_created ON leave_requests(status, created_at);
CREATE TABLE IF NOT EXISTS leave_balances (
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id),
  period_year INTEGER NOT NULL,
  entitled_days REAL NOT NULL DEFAULT 0,
  used_days REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(employee_id, leave_type_id, period_year)
);
CREATE TABLE IF NOT EXISTS leave_approvals (
  id INTEGER PRIMARY KEY,
  leave_request_id INTEGER NOT NULL REFERENCES leave_requests(id),
  reviewer_user_id INTEGER NOT NULL REFERENCES users(id),
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS company_holidays (
  id INTEGER PRIMARY KEY,
  holiday_date TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS salary_structures (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  currency TEXT NOT NULL DEFAULT 'INR',
  UNIQUE(employee_id, effective_from)
);
CREATE TABLE IF NOT EXISTS salary_components (
  id INTEGER PRIMARY KEY,
  salary_structure_id INTEGER NOT NULL REFERENCES salary_structures(id),
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('earning', 'deduction')),
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  UNIQUE(salary_structure_id, name)
);
CREATE TABLE IF NOT EXISTS payroll_runs (
  id INTEGER PRIMARY KEY,
  period TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('draft', 'finalized')),
  policy_version TEXT,
  finalized_by INTEGER REFERENCES users(id),
  finalized_at TEXT
);
CREATE TABLE IF NOT EXISTS payroll_items (
  id INTEGER PRIMARY KEY,
  payroll_run_id INTEGER NOT NULL REFERENCES payroll_runs(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  calculation_snapshot TEXT NOT NULL,
  gross_minor INTEGER NOT NULL,
  deductions_minor INTEGER NOT NULL,
  net_minor INTEGER NOT NULL,
  UNIQUE(payroll_run_id, employee_id)
);
CREATE TABLE IF NOT EXISTS payslips (
  id INTEGER PRIMARY KEY,
  payroll_item_id INTEGER NOT NULL UNIQUE REFERENCES payroll_items(id),
  private_storage_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE IF NOT EXISTS company_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS email_outbox (
  id INTEGER PRIMARY KEY,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  encrypted_payload TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  sent_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS audit_logs_created ON audit_logs(created_at);
