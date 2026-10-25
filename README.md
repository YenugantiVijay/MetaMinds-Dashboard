# Meta Minds people portal

## Repository audit

The workspace was empty: there was no existing frontend, backend, registration source, database, test suite, deployment configuration, or Git metadata to preserve. The public registration URL could not be inspected because the environment's TLS connection failed. The referenced dashboard screenshot was not included in the attached files, so styling follows the written design brief. No remote implementation or company data was assumed.

PHP 8.3 and Node.js 26 were present, but Composer, MySQL, and a PHP SQLite driver were not. The implementation therefore uses React, TypeScript, Vite, a same-origin Node.js API, and Node 26's built-in SQLite module. This is a runnable foundation for development and workflow validation; it is not a claim that SQLite or this implementation is ready to store production HR records.

## Implemented

- Responsive employee portal with CEO, Team Lead, employee, and intern-facing navigation; employment category is stored separately from account role. The supplied MetaMinds Pvt. Ltd. logo and correct company name appear across the portal's public and signed-in brand surfaces.
- Server-side authentication with scrypt password hashes, expiring HttpOnly session cookies, CSRF tokens, login throttling, logout, account activation, and one-time password-reset links.
- Public employee/intern application flow with email-only verification using a six-character alphanumeric OTP, password setup, server validation, duplicate checks, and privacy acknowledgement. Phone numbers are not collected. Passwords are stored as hashes, but applicants cannot sign in before CEO approval.
- CEO-only application review. Employee records and IDs are created transactionally after approval; an approved applicant can then sign in using the password created during application. Approval and employee ID assignment do not depend on SMTP. If SMTP is unavailable, the decision can still be recorded and the assigned ID is available to the CEO, but email updates are not sent. Applicant access roles cannot be set in the public form.
- Approval assigns IDs in the `MM-YYYY-NNNN` format using a shared yearly sequence. Application receipt and approval messages use branded HTML and plain-text SMTP templates; applicants receive a copyable reference and a pending-review confirmation.
- Sign-in accepts a work email or an assigned employee ID (`MM-YYYY-NNNN`); an application reference (`MM-APP-...`) is not a sign-in ID. Password-reset links are sent to the approved account's work email and require configured email delivery.
- Private SQLite database and versioned SQL migrations. Activation/reset email bodies are encrypted in the outbox; SMTP delivery is attempted only when configured and delivery state is tracked.
- Employee directory, CEO-controlled team and Team Lead assignment, server-timestamped check-in/check-out, attendance history, hourly attendance reminders, absence-warning exceptions, and leave request/approval records.
- The initial attendance policy is 10 AM–6 PM, eight expected work hours, Monday–Saturday, with a three-hour manager-review threshold. The CEO can adjust shift times and expected hours; the weekly off is currently Sunday.
- Attendance charts distinguish full/partial progress, approved leave, and cases needing manager review. Sample chart values are labeled and never alter live attendance or KPI records.
- Employee IDs use the fixed `MM-YYYY-NNNN` format. Paid-leave entitlements are not configured, potential unpaid leave requires CEO review, and salary deductions are never calculated or applied automatically.
- CEO audit log, notifications, live database-derived dashboard statistics, and an access-restricted payroll screen that remains disabled until approved payroll rules exist.
- Unit and end-to-end tests use synthetic data only.

## Current limitations and production blockers

This build covers the main onboarding and basic people workflows; it does **not** satisfy every acceptance criterion in the supplied brief. In particular:

- The existing PHP registration workflow was unreachable, so integration with its database and login system remains unverified.
- Storage is local SQLite via Node's `node:sqlite` module. It is suitable for a single-instance development setup, not a multi-instance HR production deployment. A reviewed MySQL adapter and a data migration plan are still required.
- Identity document uploads are intentionally not accepted. Private document downloads, emergency contacts, and referral records are not exposed in the UI.
- Leave balances/entitlements, configurable working-day calendars for leave, and transactional balance adjustments still need company-approved policy.
- Attendance correction requests, permission requests/reviews for an absence exception, configurable weekly-off calendars, and holiday administration are not yet available in the UI. Sunday is currently treated as the weekly off.
- Payroll is deliberately disabled. Salary policies, payable-day rules, deductions, tax treatment, and effective dates must be supplied and reviewed before implementation; no net pay is fabricated.
- The email outbox runs in the API process. Configure and test a production mail provider, reliable job processing, delivery monitoring, and backup/restore before use.
- Demo/production seed data is not inserted by default. Synthetic chart samples are explicitly labeled, and KPI counts remain database-derived. The guarded demo seeder is for local development only.
- Employee role assignment is CEO-controlled through team assignment, but a general roles/permissions editor and account deactivation workflow are not yet available.
- Table pagination/sorting, global search, and dedicated correction/exception review screens are not implemented.
- Full database encryption at rest, production backup and restore procedures, retention/deletion automation, external security review, and a MySQL deployment have not been completed.
- Automated coverage currently focuses on core calculations and the registration-to-activation, attendance, leave, authorization, and password-reset workflows. Browser validation was manual; no Playwright suite has been configured.

Do not use real employee identity documents, bank details, or payroll data in this build. Before production use, complete the blockers above, verify applicable Indian privacy/payroll obligations with qualified professionals, deploy behind HTTPS, and obtain an independent security review.

## Setup

Requirements: Node.js 26 or newer and npm. The built-in `node:sqlite` module is currently experimental in Node; the scripts suppress its runtime warning, but that does not change its support status.

```powershell
npm install
Copy-Item .env.example .env
npm run setup:admin
npm run dev
```

The setup command asks for the initial CEO/MD email and accepts the password without echoing it. It refuses to create a second CEO. No default credentials or demo employees are created automatically. To add a local CEO demo login, explicitly enable the guarded setup command in a non-production PowerShell session:

```powershell
$env:DEMO_SETUP_ENABLED = "true"
npm run setup:demo
Remove-Item Env:DEMO_SETUP_ENABLED
```

The command creates local demo accounts for `demo.ceo@metaminds.local` and `demo.lead@metaminds.local`, prints newly generated passwords once, and leaves existing demo accounts unchanged. The Team Lead is assigned a demo team and employee ID. The command is unavailable when `NODE_ENV=production`. Both accounts have privileged access; never expose them to production. The development frontend is at `http://localhost:5173`.

To run the API and production frontend after building:

```powershell
npm run build
npm start
```

Set `APP_URL` to the actual frontend origin. In production, use `NODE_ENV=production`, an HTTPS reverse proxy, and an `https://` `APP_URL`; the API sets `Secure` cookies in production mode.

## Environment configuration

See [.env.example](./.env.example). Important variables:

- `DATA_DIR`: path to the private SQLite database and application encryption key. By default this is `.meta-minds-portal` under the current OS user's home directory. Keep it outside any public static-file root, restrict OS access, and back up the database and `.application-key` together.
- `APP_URL`, `PORT`, `NODE_ENV`: public origin, API port, and production cookie/security mode.
- `COMPANY_TIMEZONE`, `SCHEDULED_START`, `SCHEDULED_END`, `EXPECTED_WORKING_HOURS`, `ABSENCE_WARNING_HOURS`: initial attendance policy. Defaults are Asia/Kolkata, 10:00–18:00, eight expected hours, and a three-hour manager-review threshold. The scheduler sends an in-app reminder each hour from shift start until check-in or approved leave; the weekly off is Sunday.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `CEO_NOTIFICATION_EMAIL`: SMTP and CEO alert configuration. SMTP credentials belong only in the server environment. Email OTPs and application confirmations require a valid host, sender, port, and either both SMTP credentials or neither; a queued message is not shown as delivered until SMTP confirms it.

For Gmail, use `smtp.gmail.com`, port `465`, `SMTP_SECURE=true`, and your Gmail address for both `SMTP_USER` and `SMTP_FROM`. Create a Google App Password with 2-Step Verification enabled and set it as `SMTP_PASSWORD`; do not use your normal Google password or commit the `.env` file. Spaces in the grouped App Password are ignored. After configuring it, run `npm run check:smtp` to verify the connection and authentication without sending a message, then restart `npm run dev`. The server's health endpoint and email-verification screen report missing SMTP settings without exposing credentials.

Application email OTPs are six characters, contain letters and digits, expire after 10 minutes, and are limited to five verification attempts. Sending a real verification email requires SMTP credentials; when SMTP is unavailable, the form reports the configuration error instead of bypassing verification or claiming a code was sent. The application password is activated only after CEO approval. The “Email JS” request is implemented as server-rendered JavaScript Nodemailer templates over SMTP, rather than a browser-side EmailJS integration, so SMTP credentials are not exposed to applicants.

## Database, migrations, and tests

Schema migrations live in [migrations/](./migrations/). SQLite initialization applies unapplied, numbered SQL files automatically and stores applied versions in `schema_migrations`. The key entities and relationships are summarized in [docs/database.md](./docs/database.md).

```powershell
npm test
npm run check
npm run build
npm audit
```

The integration test creates an isolated temporary database and synthetic CEO, employee, and Team Lead accounts to exercise contact verification, approval, account access, and role-specific workflows using mock SMTP and Twilio endpoints. It does not use company records or contact real providers. No demo credentials or test accounts are added to the normal application database.
