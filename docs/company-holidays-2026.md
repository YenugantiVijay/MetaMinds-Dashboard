# Verified 2026 festival calendar and CEO holiday management

## Source and applicability
MetaMinds now maintains an Andhra Pradesh **2026** company holiday baseline using:
- [Andhra Pradesh Gazette, December 4, 2025, G.O.Rt.2276](https://www.gvmc.gov.in/wss/image_uploads/26HL.pdf) (Annexure I: General Holidays; Annexure II: Optional Holidays).

The company has chosen to include the gazetted Andhra Pradesh general holidays as its 2026 company days off. Government-office holidays are not automatically mandatory for every private employer; MetaMinds uses these as its **company-approved policy**. Sundays and second Saturdays are weekly offs under the existing attendance rules.

Migration `015_verified_2026_holidays_and_celebrations.sql` adds:
- 24 AP 2026 general holidays, including Bhogi, Sankranti, Kanuma, Maha Shivaratri, Holi, Ugadi, Sri Rama Navami, Varalakshmi Vratham, Krishna Janmashtami, Vinayaka Chavithi, Durga Ashtami, Vijayadasami, and Deepavali.
- 7 optional celebrations as **calendar observances**, with icons but **not** automatic company days off.
- `kind` metadata (`government`, `ceo`, `legacy`), source URL, CEO note, creator and correction timestamps.
- Corrections for specific inaccurate values previously seeded by migration 008. Unrelated custom holidays are preserved.

**Dates may change.** The gazette explicitly allows later amendments for moon sightings and festival announcements. Do not extrapolate 2026 dates to 2027 or claim a live government feed. The CEO must consult the official notification and revise the future date with a new HTTPS official source URL when needed.

## CEO functions
In **Company settings → Company holidays & CEO-declared days off**:
1. Enter the first and optionally the last date of an ad-hoc company closure (maximum 31 consecutive days).
2. Give it a name and optional reason, then declare the closure. Existing holidays in the range cause an error rather than creating duplicate records.
3. Future official dates can be corrected by selecting `Correct date` and providing an updated official source URL.
4. Future CEO-created days off can be removed. Past/current days and government holidays cannot be removed.
5. Changes are audited, and active employee/Team Lead accounts receive an in-app notification.

New check-in and leave-working-day calculations use `company_holidays`. Optional observances do not affect attendance.

## Employee calendar
- The server provides `today` using the configured company timezone, rather than trusting the browser timezone.
- The page refreshes that value every minute and when the browser tab becomes visible.
- Today gets a distinct ring/badge and a **Today** navigation action.
- Iconography distinguishes verified holidays, optional celebrations, CEO-declared days off, and personal leave. Date numbers remain accessible for clarity.
- Legacy and unverified future-year holiday dates should be reviewed by management.

## Local employee reset — separate from GitHub
GitHub cannot access a developer's local `%USERPROFILE%\\.meta-minds-portal\\portal.sqlite`. To review and reset **verified disposable test employee accounts** on the Windows development PC, run from the MetaMinds project directory:

```powershell
powershell -ExecutionPolicy Bypass -File .\\scripts\\reset-local-test-employees.ps1
```

The script previews counts, requires typing `RESET TEST EMPLOYEES`, uses `NODE_ENV=development`, verifies a SQLite backup and encryption key, preserves the CEO demo and company config, then removes non-CEO test accounts. **It has NOT been executed through this GitHub PR.** It retains application submissions and immutable audit events that cannot safely be proven disposable. Use only on a dedicated test database with no real staff information.

## Validation
Run `npm run check`, `npm run build`, `npm test` on Node 26. Regression coverage includes official holiday provenance, optional dates, CEO authorization, closure overlap, future corrections, and browser today-navigation behavior. No new payroll actions are added.
