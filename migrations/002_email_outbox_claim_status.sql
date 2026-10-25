CREATE TABLE email_outbox_updated (
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
INSERT INTO email_outbox_updated(id, recipient, subject, encrypted_payload, status, attempts, last_error, created_at, sent_at)
SELECT id, recipient, subject, encrypted_payload,
       CASE WHEN status = 'sending' THEN 'pending' ELSE status END,
       attempts, last_error, created_at, sent_at
FROM email_outbox;
DROP TABLE email_outbox;
ALTER TABLE email_outbox_updated RENAME TO email_outbox;
