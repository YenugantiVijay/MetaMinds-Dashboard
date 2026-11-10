-- 2026 company holiday register sourced from Andhra Pradesh Gazette G.O.Rt.2276.
-- State government dates form the company-approved 2026 holiday baseline.
-- Future years MUST be verified separately. Optional observances NEVER block attendance.
ALTER TABLE company_holidays ADD COLUMN kind TEXT NOT NULL DEFAULT 'legacy'
  CHECK (kind IN ('legacy','government','ceo'));
ALTER TABLE company_holidays ADD COLUMN source_url TEXT;
ALTER TABLE company_holidays ADD COLUMN note TEXT;
ALTER TABLE company_holidays ADD COLUMN created_by INTEGER REFERENCES users(id);
ALTER TABLE company_holidays ADD COLUMN revised_at TEXT;
CREATE INDEX IF NOT EXISTS idx_company_holiday_kind_date ON company_holidays(kind,holiday_date);

CREATE TABLE IF NOT EXISTS calendar_observances (
  id INTEGER PRIMARY KEY,
  observance_date TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '✨',
  source_url TEXT,
  UNIQUE(observance_date, name)
);
CREATE INDEX IF NOT EXISTS idx_calendar_observance_date ON calendar_observances(observance_date);

-- Remove only specific outdated, unedited legacy seed values from migration 008.
-- Does not delete CEO-created holidays or unrelated company rows.
DELETE FROM company_holidays WHERE
  (holiday_date='2026-03-04' AND name='Holi') OR
  (holiday_date='2026-03-21' AND name='Id-ul-Fitr') OR
  (holiday_date='2026-05-31' AND name='Id-ul-Zuha (Bakrid)') OR
  (holiday_date='2026-09-04' AND name='Milad-un-Nabi') OR
  (holiday_date='2026-11-24' AND name='Guru Nanak Jayanti') OR
  (holiday_date='2026-05-01' AND name='Maharashtra / May Day') OR
  (holiday_date='2027-03-23' AND name='Holi');

INSERT OR IGNORE INTO company_holidays (holiday_date,name,kind,source_url) VALUES
  ('2026-01-14','Bhogi','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-01-15','Makara Sankranti','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-01-16','Kanuma','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-01-26','Republic Day','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-02-15','Maha Shivaratri','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-03-03','Holi','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-03-19','Ugadi','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-03-20','Eid-ul-Fitr (Ramzan)','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-03-27','Sri Rama Navami','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-04-03','Good Friday','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-04-05','Babu Jagjivan Ram Jayanti','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-04-14','Dr. B.R. Ambedkar Jayanti','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-05-27','Eid-ul-Adha (Bakrid)','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-06-25','Muharram','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-08-15','Independence Day','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-08-21','Varalakshmi Vratham','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-08-25','Milad-un-Nabi','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-09-04','Sri Krishna Janmashtami','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-09-14','Vinayaka Chavithi','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-10-02','Mahatma Gandhi Jayanti','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-10-18','Durga Ashtami','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-10-20','Vijaya Dasami','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-11-08','Deepavali','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-12-25','Christmas','government','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf');

-- Classify only recognizable prior seed names on gazetted dates; preserve custom labels.
UPDATE company_holidays SET kind='government',source_url='https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'
WHERE holiday_date BETWEEN '2026-01-01' AND '2026-12-31' AND kind='legacy'
AND (
  (holiday_date='2026-01-14' AND name IN ('Bhogi')) OR
  (holiday_date='2026-01-15' AND name IN ('Makara Sankranti')) OR
  (holiday_date='2026-01-16' AND name IN ('Kanuma')) OR
  (holiday_date='2026-01-26' AND name IN ('Republic Day')) OR
  (holiday_date='2026-02-15' AND name IN ('Maha Shivaratri')) OR
  (holiday_date='2026-03-03' AND name IN ('Holi')) OR
  (holiday_date='2026-03-19' AND name IN ('Ugadi')) OR
  (holiday_date='2026-03-20' AND name IN ('Eid-ul-Fitr (Ramzan)')) OR
  (holiday_date='2026-03-27' AND name IN ('Sri Rama Navami')) OR
  (holiday_date='2026-04-03' AND name IN ('Good Friday')) OR
  (holiday_date='2026-04-05' AND name IN ('Babu Jagjivan Ram Jayanti')) OR
  (holiday_date='2026-04-14' AND name IN ('Dr. B.R. Ambedkar Jayanti')) OR
  (holiday_date='2026-05-27' AND name IN ('Eid-ul-Adha (Bakrid)')) OR
  (holiday_date='2026-06-25' AND name IN ('Muharram')) OR
  (holiday_date='2026-08-15' AND name IN ('Independence Day')) OR
  (holiday_date='2026-08-21' AND name IN ('Varalakshmi Vratham')) OR
  (holiday_date='2026-08-25' AND name IN ('Milad-un-Nabi')) OR
  (holiday_date='2026-09-04' AND name IN ('Sri Krishna Janmashtami')) OR
  (holiday_date='2026-09-14' AND name IN ('Vinayaka Chavithi')) OR
  (holiday_date='2026-10-02' AND name IN ('Mahatma Gandhi Jayanti','Mahatma Gandhi Jayanti')) OR
  (holiday_date='2026-10-18' AND name IN ('Durga Ashtami')) OR
  (holiday_date='2026-10-20' AND name IN ('Vijaya Dasami','Dussehra (Vijayadashami)')) OR
  (holiday_date='2026-11-08' AND name IN ('Deepavali')) OR
  (holiday_date='2026-12-25' AND name IN ('Christmas'))
);

-- Migration 008 used different, recognizable English aliases for these official days.
UPDATE company_holidays SET kind='government',
  source_url='https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'
WHERE kind='legacy' AND (
  (holiday_date='2026-12-25' AND name='Christmas Day') OR
  (holiday_date='2026-11-08' AND name='Diwali (Deepavali)') OR
  (holiday_date='2026-10-20' AND name='Dussehra (Vijayadashami)')
);

-- Optional observances: show festive icons; do NOT silently treat these as holidays.
INSERT OR IGNORE INTO calendar_observances(observance_date,name,icon,source_url) VALUES
  ('2026-01-01','New Year''s Day','✨','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-03-31','Mahavir Jayanti','🪷','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-04-20','Basava Jayanti','🌸','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-05-01','Buddha Purnima','🪷','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-07-16','Ratha Yatra','🛕','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-10-10','Mahalaya Amavasya','🪔','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf'),
  ('2026-11-24','Guru Nanak Jayanti','🌼','https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf');
