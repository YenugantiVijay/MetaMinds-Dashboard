# MetaMinds — Attendance Automation Policy (proposed implementation)

**Effective only for new sessions started after migration 013 is installed.** Historical sessions and previously opened attendance are not automatically rewritten.

## Rules

- Standard target: **480 minutes (8 hours) of recorded active work**. Active work = elapsed session minutes minus recorded break minutes; payroll treatment remains a separate approved policy.
- Warning: **540 minutes (9 hours) elapsed** after actual check-in, including breaks. Generate one in-app notification and queue one SMTP email (if configured).
- Automatic checkout: **600 minutes (10 hours) elapsed** after actual check-in, including breaks.
- The scheduled server job checks each minute; if it runs late, attendance is recorded at the exact check-in + 600-minute cutoff.
- Automatic checkout reason is `automatic_timeout`. No work summary is fabricated.
- Employees submit the real daily summary after automatic closure, with an optional project reference and blockers.
- Report deadline: **23:59 company-local time on the next scheduled working day**, skipping Sundays, second Saturdays, and configured company holidays.
- Pending reports never block the next check-in. Overdue reports receive one additional reminder.
- The attendance session is closed, **not the user authentication session**. Employees remain able to log in and submit the report.
- No automated salary deductions, overtime pay, or historical data recalculation.

## Data and behavior

Migration `013_attendance_automation.sql` stores the activation instant and idempotency flags for the 8-hour, 9-hour, and auto-close events. `src/attendance-automation.mjs` uses the existing SQLite transaction and notification/email helpers.

The standard work target is about recorded active minutes, but warnings and checkout use elapsed session time. Previously completed sessions retain their old stored minutes; work-hour adjustments must be handled in a separate audited policy migration, not silently rewritten.

The CEO and already-authorized Team Leads can view report status through `GET /api/attendance/auto-reports`. Employees can use `POST /api/attendance/auto-report` only for their own automatic checkout record. The endpoint rejects duplicate submissions and requires a real summary. Historical manual records without work summaries are not backfilled with fictional text.

Manual checkout requires an explicit reason; Workday Complete requires a work summary (20–2000 characters). A manual checkout request arriving after the 10-hour deadline reconciles automatic closure first.

## Email operations

SMTP is optional for attendance correctness. If unavailable, in-app notices and report status persist, and automatic checkout still runs. A warning marker records a notification attempt, not proof of successful Gmail delivery. Email delivery and retries can be reviewed through the existing email outbox.

## Deployment checklist

1. Back up the local/production SQLite database including any WAL state using a consistent backup method.
2. Rotate previously exposed credentials and confirm the authentication changes are safe.
3. Apply migration 013 (startup migration runner). Verify `PRAGMA foreign_key_check`.
4. Run `npm run check`, `npm run build`, `npm test` on Node 26; test the UI with Playwright.
5. Check company timezone, company holiday calendar, and SMTP configuration.
6. Verify one session with recorded breaks and a simulated 9-hour/10-hour threshold using an isolated test database.
7. Verify worker recovery after restart, role-scoped report access, pending/overdue notifications and historical-data preservation.
8. Do not merge this PR until the full CI suite is green and a reviewer has checked the new database migration.

## Scope intentionally excluded

An HR role is not present in the current permission model; do not grant broad personal-data access by introducing an insecure role shortcut. Managers can review corrections through separately approved authorization workflows. Overtime authorization and paid/unpaid break treatment require company policy.
