# MetaMinds Employee Self-Service & Company Leave Policy

## Scope

This feature introduces the November 2026 company policy: **one calendar-year exemption day** for each employee, with subsequent personal leave requests reviewed by the CEO. It does **not** establish paid/unpaid payroll treatment. Existing historical paid-leave records, leave balances, and payroll safeguards remain untouched for audit purposes.

### Company holidays

The calendar displays dates in the existing `company_holidays` table with occasion-specific decorative symbols. The company administrator can add or update official dates using the existing holiday management controls. Sundays and second Saturdays remain weekly offs under the existing attendance policy.

**Important:** A government-office gazette does not necessarily define private-sector company holidays. Different states, workplaces and regions publish different lists, and some religious observances can shift dates. Management must publish a verified company-specific list for each year and verify it against the applicable official gazette. The frontend does not generate unverified holidays or automatically change historical dates.

Reference lists for verification:
- Andhra Pradesh 2026 Gazette general holidays: https://static2.india.gov.in/npiprod/uploads/andhra_pradesh_Holiday_2026_1_5936468adb.pdf
- Government of India (DoPT) 2026: https://nhai.gov.in/assets/pdf/List_of_holidays-2026.pdf

### Employee exemption

- A request for **one scheduled working day** is automatically recorded as that employee's annual exemption if no exemption has previously been approved in the same start-date calendar year.
- A request for multiple working days or a subsequent personal leave is **pending CEO approval**.
- Requests spanning two calendar years must be split by year.
- The backend rejects overlapping pending/approved requests and zero-working-day ranges.
- The CEO is the only reviewer of new personal-leave requests; Team Leads retain historical permissions on legacy requests.
- The database enforces the one-approved-exemption-per-year limit with a partial unique index.
- Reasons: Personal work, Medical/health, Family function, Emergency, Travel, Festival/occasion, Other; Other requires a written explanation.
- **Employee-facing and management-facing views do not ask the employee to choose paid/unpaid.** Payroll treatment remains a separate company policy and is not inferred from this workflow.

### Profile and privacy

The full-page profile supports self-service phone, address and emergency-contact updates. Employee ID, official name, role, job title and work email are deliberately read-only and require authorized management verification to change.

**Sensitive information:** PAN, Aadhaar, bank account details, educational certificates and other ID documents are not accepted through the standard profile API. Uploading such data requires explicit privacy/retention policies, private encrypted storage, size/type checks, authorization, auditing and a vetted identity-verification process. Until those controls exist, the UI gives an honest restricted state rather than an insecure upload field.

### Controlled local development reset

GitHub does not contain or provide access to the developer's local SQLite database. Merely merging this code does **not** remove existing employee accounts.

The previous broad deletion scripts have been replaced/disabled for safety. To review counts in an explicitly designated disposable development database:

```sh
DATA_DIR=/absolute/path/to/disposable-test-data NODE_ENV=development node scripts/cleanup-employee-accounts.mjs
```

To execute after independently verifying the preview and backup destination:

```sh
DATA_DIR=/absolute/path/to/disposable-test-data NODE_ENV=development node scripts/cleanup-employee-accounts.mjs --execute --confirm-disposable-data
```

On Windows PowerShell, assign `$env:DATA_DIR` and `$env:NODE_ENV` before running Node.

The script backs up the SQLite database and encryption key, preserves the CEO demo credential and company configuration, nulls deleted-user references in immutable audit records, and deletes only records associated with the removed non-CEO accounts. Application submissions that cannot be confidently linked to a deleted employee are deliberately retained. **Never run this against real or production employee records.**

## Validation

Required: Node 26 `npm run check`, `npm run build`, and `npm test`. Browser tests should cover the full-page profile, reason-only leave submission, monthly calendar, responsive layout, CEO review, and unchanged legacy workflows.

No live employee data, sensitive document uploads, or production environment were modified by the GitHub implementation.
