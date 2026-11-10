import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Bell, CalendarDays, Clock3, Fingerprint, ShieldCheck } from "lucide-react";
import type { NotifyFn } from "../../types";
import { api, formatDate } from "../../services/api";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingState } from "../../components/ui/LoadingState";
import { PageHeader } from "../../components/ui/PageHeader";

export interface SettingsPageProps {
  notify: NotifyFn;
}

export function SettingsPage({ notify }: SettingsPageProps) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [ceoNotificationConfigured, setCeoNotificationConfigured] = useState(false);
  const [pendingEmails, setPendingEmails] = useState(0);
  const [failedEmails, setFailedEmails] = useState(0);
  const [holidays, setHolidays] = useState<Array<{
    id: number; holidayDate: string; name: string;
    kind?: "government" | "ceo" | "legacy";
    sourceUrl?: string | null; note?: string | null;
  }>>([]);
  const [companyToday, setCompanyToday] = useState("");
  const [holidayEndDate, setHolidayEndDate] = useState("");
  const [holidayNote, setHolidayNote] = useState("");
  const [adjustingHolidayId, setAdjustingHolidayId] = useState<number | null>(null);
  const [adjustedDate, setAdjustedDate] = useState("");
  const [adjustedSource, setAdjustedSource] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [holidayName, setHolidayName] = useState("");
  const [holidayBusy, setHolidayBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [result, calendar] = await Promise.all([
        api<{
          settings: Record<string, string>;
          emailConfigured: boolean;
          ceoNotificationConfigured: boolean;
          pendingEmails: number;
          failedEmails: number;
        }>("/api/settings"),
        api<{
          today: string;
          holidays: Array<{
            id: number; holidayDate: string; name: string;
            kind?: "government" | "ceo" | "legacy";
            sourceUrl?: string | null; note?: string | null;
          }>;
        }>("/api/company-calendar"),
      ]);
      setHolidays(calendar.holidays);
      setCompanyToday(calendar.today);
      setSettings(result.settings);
      setEmailConfigured(result.emailConfigured);
      setCeoNotificationConfigured(result.ceoNotificationConfigured);
      setPendingEmails(result.pendingEmails);
      setFailedEmails(result.failedEmails);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not load settings.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  function change(key: string, value: string) {
    setSettings((current) => ({ ...current, [key]: value }));
  }

  const attendancePolicyConfirmed = settings.attendance_policy_confirmed === "true";

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/settings", {
        method: "POST",
        body: JSON.stringify({
          timezone: settings.timezone,
          scheduled_start: settings.scheduled_start || "10:00",
          scheduled_end: settings.scheduled_end || "18:00",
          expected_working_minutes: attendancePolicyConfirmed ? settings.expected_working_minutes : "",
          absence_warning_hours: settings.absence_warning_hours,
          attendance_policy_confirmed: attendancePolicyConfirmed ? "true" : "false",
        }),
      });
      notify("Company settings saved.");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not save company settings.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function addHoliday() {
    if (!holidayDate || !holidayName.trim()) {
      notify("Enter a company closure date and name.", "error");
      return;
    }
    setHolidayBusy(true);
    try {
      const response = await api<{ count: number }>("/api/company-holidays/declare", {
        method: "POST",
        body: JSON.stringify({
          startDate: holidayDate,
          endDate: holidayEndDate || holidayDate,
          name: holidayName,
          note: holidayNote,
        }),
      });
      setHolidayDate("");
      setHolidayEndDate("");
      setHolidayName("");
      setHolidayNote("");
      notify(`${response.count} company day(s) off declared. Employees have been notified.`);
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not add company holiday.", "error");
    } finally {
      setHolidayBusy(false);
    }
  }

  async function removeHoliday(id: number) {
    setHolidayBusy(true);
    try {
      await api("/api/company-holidays/remove", {
        method: "POST",
        body: JSON.stringify({ id }),
      });
      notify("Company holiday removed.");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not remove company holiday.", "error");
    } finally {
      setHolidayBusy(false);
    }
  }

  async function correctHolidayDate() {
    if (!adjustingHolidayId || !adjustedDate) {
      notify("Select the corrected date.", "error");
      return;
    }
    setHolidayBusy(true);
    try {
      await api("/api/company-holidays/reschedule", {
        method: "POST",
        body: JSON.stringify({ id: adjustingHolidayId, date: adjustedDate, sourceUrl: adjustedSource }),
      });
      setAdjustingHolidayId(null);
      setAdjustedDate("");
      setAdjustedSource("");
      notify("Holiday date corrected. Employees have been notified.");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not correct holiday date.", "error");
    } finally { setHolidayBusy(false); }
  }

  const upcomingHolidays = holidays.filter((item) => !companyToday || item.holidayDate >= companyToday);

  if (loading) return <LoadingState />;

  return (
    <div className="page-content">
      <PageHeader
        title="Company settings"
        subtitle="Configure approved attendance policies and review service readiness."
      />
      <form className="settings-layout" onSubmit={save}>
        <section className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <h2>Attendance policy</h2>
              <p>Attendance uses server timestamps and the configured company timezone.</p>
            </div>
            <Clock3 size={18} />
          </div>
          {!attendancePolicyConfirmed && (
            <div className="notice notice-warning">
              <ShieldCheck size={17} />
              <span>
                Schedule policy is not confirmed. Automatic absence reminders and attendance completion
                percentages are disabled until an authorized CEO confirms the real working hours.
              </span>
            </div>
          )}
          {attendancePolicyConfirmed && (
            <div className="notice notice-info">
              <ShieldCheck size={17} />
              <span>
                Attendance policy confirmed. Automated reminders will use the schedule below and the company
                holiday calendar.
              </span>
            </div>
          )}
          <div className="settings-grid">
            <label>
              Company timezone
              <input
                required
                value={settings.timezone || ""}
                onChange={(event) => change("timezone", event.target.value)}
                placeholder="Asia/Kolkata"
              />
              <small>Use an IANA timezone name.</small>
            </label>
            <label>
              Scheduled start
              <input
                required={attendancePolicyConfirmed}
                type="time"
                value={attendancePolicyConfirmed ? settings.scheduled_start || "" : ""}
                onChange={(event) => change("scheduled_start", event.target.value)}
              />
            </label>
            <label>
              Scheduled end
              <input
                required={attendancePolicyConfirmed}
                type="time"
                value={attendancePolicyConfirmed ? settings.scheduled_end || "" : ""}
                onChange={(event) => change("scheduled_end", event.target.value)}
              />
            </label>
            <label>
              Expected workday hours
              <input
                required={attendancePolicyConfirmed}
                type="number"
                min="0.25"
                max="24"
                step="0.25"
                value={
                  attendancePolicyConfirmed && settings.expected_working_minutes
                    ? Number(settings.expected_working_minutes) / 60
                    : ""
                }
                onChange={(event) =>
                  change(
                    "expected_working_minutes",
                    event.target.value ? String(Math.round(Number(event.target.value) * 60)) : ""
                  )
                }
                placeholder="Set approved hours"
              />
              <small>Enter the actual company-approved duration; it is not assumed by the system.</small>
            </label>
            <label>
              Manager review threshold
              <input
                required
                type="number"
                min="1"
                max="24"
                value={settings.absence_warning_hours || "3"}
                onChange={(event) => change("absence_warning_hours", event.target.value)}
              />
              <small>
                Employees receive hourly reminders from shift start; unresolved cases are flagged after this
                many hours. No automatic salary deduction.
              </small>
            </label>
            <label className="full-width consent-row">
              <input
                type="checkbox"
                checked={attendancePolicyConfirmed}
                onChange={(event) => {
                  const confirmed = event.target.checked;
                  setSettings((current) => ({
                    ...current,
                    attendance_policy_confirmed: confirmed ? "true" : "false",
                    ...(confirmed
                      ? { scheduled_start: "", scheduled_end: "", expected_working_minutes: "" }
                      : { expected_working_minutes: "" }),
                  }));
                }}
              />
              <span>
                I confirm these working hours and attendance rules are approved company policy. Automated
                absence reminders and attendance completion percentages stay disabled until this is checked.
              </span>
            </label>
          </div>
        </section>
        <section className="panel settings-panel ceo-holiday-manager" aria-label="CEO company holidays">
          <div className="panel-heading">
            <div>
              <h2>Company holidays &amp; CEO-declared days off</h2>
              <p>Declare unplanned single-day or multi-day closures, and review verified festival dates.</p>
            </div>
            <CalendarDays size={18} />
          </div>
          <p className="ceo-holiday-help">
            Only the CEO can change the company holiday calendar. Government holidays follow the
            verified Andhra Pradesh 2026 notification. If a festival date changes, correct the
            upcoming holiday with an updated official source. Optional festival observances
            shown to employees are not automatically days off.
          </p>
          <div className="settings-grid">
            <label>
              First day off
              <input type="date" min={companyToday || undefined} value={holidayDate}
                onChange={(event) => { setHolidayDate(event.target.value); setHolidayEndDate(""); }} />
            </label>
            <label>
              Last day off (optional)
              <input type="date" min={holidayDate || companyToday || undefined} value={holidayEndDate}
                onChange={(event) => setHolidayEndDate(event.target.value)} />
              <small>Leave blank to declare one day. Up to 31 consecutive days.</small>
            </label>
            <label>
              Name / occasion
              <input maxLength={120} value={holidayName}
                onChange={(event) => setHolidayName(event.target.value)}
                placeholder="e.g. Company special holiday, local festival" />
            </label>
            <label>
              Reason or details (optional)
              <input maxLength={500} value={holidayNote}
                onChange={(event) => setHolidayNote(event.target.value)}
                placeholder="e.g. Company annual celebration" />
            </label>
            <div className="settings-holiday-action">
              <Button type="button" disabled={holidayBusy || !holidayDate || !holidayName.trim()}
                onClick={() => void addHoliday()}>
                {holidayBusy ? "Saving…" : "Declare company day off"}
              </Button>
            </div>
          </div>
          {upcomingHolidays.length ? (
            <div className="table-scroll">
              <table>
                <thead><tr><th>Date</th><th>Holiday / occasion</th><th>Category</th><th>Actions</th></tr></thead>
                <tbody>{upcomingHolidays.map((holiday) => (
                  <tr key={holiday.id}>
                    <td>{formatDate(holiday.holidayDate)}</td>
                    <td><strong>{holiday.name}</strong>
                      {holiday.note && <small className="table-sub">{holiday.note}</small>}
                      {holiday.sourceUrl && <small className="table-sub">
                        <a className="holiday-source-link" href={holiday.sourceUrl} target="_blank" rel="noopener noreferrer">
                          Official source
                        </a>
                      </small>}
                    </td>
                    <td><span className={`holiday-kind ${holiday.kind === "ceo" ? "ceo" : ""}`}>
                      {holiday.kind === "government" ? "Government" : holiday.kind === "ceo" ? "CEO-declared" : "Previously configured"}
                    </span></td>
                    <td>
                      {holiday.holidayDate > companyToday ? (
                        <div className="hub-save-actions">
                          <Button type="button" variant="quiet" disabled={holidayBusy}
                            onClick={() => {
                              setAdjustingHolidayId(holiday.id);
                              setAdjustedDate(holiday.holidayDate);
                              setAdjustedSource("");
                            }}>Correct date</Button>
                          {holiday.kind !== "government" && <Button type="button" variant="quiet"
                            disabled={holidayBusy} onClick={() => void removeHoliday(holiday.id)}>Remove</Button>}
                        </div>
                      ) : <span className="muted-cell">Today — locked</span>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No upcoming holidays configured"
              detail="Declare an additional company day off or verify the annual government holiday register."
              icon={<CalendarDays size={22} />} />
          )}
          {adjustingHolidayId !== null && (
            <div className="holiday-correct-form" role="group" aria-label="Correct future holiday date">
              <label>Corrected date
                <input type="date" min={companyToday || undefined} value={adjustedDate}
                  onChange={(event) => setAdjustedDate(event.target.value)}/>
              </label>
              <label>Updated official notice URL
                <input type="url" maxLength={500} placeholder="https://…"
                  value={adjustedSource} onChange={(event) => setAdjustedSource(event.target.value)}/>
                <small>Required for government holidays.</small>
              </label>
              <Button type="button" disabled={holidayBusy || !adjustedDate}
                onClick={() => void correctHolidayDate()}>Save corrected date</Button>
              <Button type="button" variant="secondary" onClick={() => setAdjustingHolidayId(null)}>Cancel</Button>
            </div>
          )}
          <p className="settings-footnote">
            Dates already in progress or past cannot be removed or rescheduled. Future changes are
            audited and reflected in employee leave and attendance calculations.
          </p>
        </section>
        <section className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <h2>Employee ID format</h2>
              <p>Assigned once, after CEO approval, using the approval year and unguessable non-zero digits.</p>
            </div>
            <Fingerprint size={18} />
          </div>
          <div className="format-preview">
            <small>Generated format</small>
            <strong>MM-YYYY-NNNN</strong>
            <small>Example: MM-2026-7492 (No zeros, unguessable)</small>
          </div>
        </section>
        <section className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <h2>Email delivery</h2>
              <p>Secrets stay in the server environment and are never exposed to the browser.</p>
            </div>
            <Bell size={18} />
          </div>
          <div className="config-status">
            <div>
              <span className={`status-dot ${emailConfigured ? "dot-enabled" : ""}`} />
              <strong>{emailConfigured ? "SMTP configured" : "SMTP not configured"}</strong>
              <small>
                {emailConfigured
                  ? `${pendingEmails} queued · ${failedEmails} failed`
                  : "Configure SMTP_HOST, SMTP_FROM, and matching SMTP credentials to send email verification codes and application confirmations."}
              </small>
            </div>
            <div>
              <span className={`status-dot ${ceoNotificationConfigured ? "dot-enabled" : ""}`} />
              <strong>{ceoNotificationConfigured ? "CEO email configured" : "CEO email not configured"}</strong>
              <small>Set CEO_NOTIFICATION_EMAIL to receive new application email alerts.</small>
            </div>
          </div>
          <p className="settings-footnote">
            Email verification codes and application messages use the configured server-side SMTP service. A
            queued message is not guaranteed to reach the inbox.
          </p>
        </section>
        <div className="settings-submit">
          <span>Working hours and attendance reminders follow the configured company policy.</span>
          <Button disabled={busy}>{busy ? "Saving…" : "Save settings"}</Button>
        </div>
      </form>
    </div>
  );
}
