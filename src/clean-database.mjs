// This former global wipe script was unsafe: it bypassed foreign keys and deleted audit logs.
// Deliberately retired. Use the preview-first guarded script instead.
throw new Error(
  "Global database wipes are disabled. Use scripts/cleanup-employee-accounts.mjs in a dedicated disposable development database, review the preview, then explicitly confirm execution."
);
