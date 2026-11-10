-- Store AES-256-GCM encrypted onboarding certificates and KYC documents in application_documents
ALTER TABLE application_documents ADD COLUMN doc_type TEXT;
ALTER TABLE application_documents ADD COLUMN encrypted_content TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_application_documents_app_type
  ON application_documents(application_id, doc_type)
  WHERE doc_type IS NOT NULL;
