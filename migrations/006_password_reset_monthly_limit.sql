CREATE TABLE IF NOT EXISTS password_reset_monthly_usage (
  user_id INTEGER NOT NULL REFERENCES users(id),
  usage_month TEXT NOT NULL,
  reset_count INTEGER NOT NULL DEFAULT 0 CHECK (reset_count BETWEEN 0 AND 5),
  PRIMARY KEY (user_id, usage_month)
);
