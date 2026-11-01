import { useCallback, useEffect, useState } from "react";
import { CalendarDays, CircleHelp, Clock3, FileText, ShieldCheck } from "lucide-react";
import type { Attendance, NotifyFn, User } from "../../types";
import { api, durationLabel, formatDate, formatTime } from "../../services/api";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingState } from "../../components/ui/LoadingState";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { StatCard } from "../dashboard/StatCard";
import { DailyWorkReportsView } from "./DailyWorkReportsView";

export interface AttendancePageProps {
  user: User;
  notify: NotifyFn;
}

export function AttendancePage({ user, notify }: AttendancePageProps) {
  const [activeTab, setActiveTab] = useState<"attendance" | "reports">("attendance");
  const [rows, setRows] = useState<Attendance[]>([]);
  const [month, setMonth] = useState("");
  const [expectedMinutes, setExpectedMinutes] = useState<number | null>(null);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const policy = await api<{ expectedWorkingMinutes: number | null; timezone: string; today: string }>(
        "/api/policy"
      );
      const selectedMonth = month || policy.today.slice(0, 7);
      if (!month) setMonth(selectedMonth);
      const records = await api<Attendance[]>(`/api/attendance?month=${selectedMonth}`);
      setRows(records);
      setExpectedMinutes(policy.expectedWorkingMinutes);
      setTimezone(policy.timezone);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not load attendance.", "error");
    } finally {
      setLoading(false);
    }
  }, [month, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalMinutes = rows.reduce((sum, row) => sum + (row.workedMinutes ?? 0), 0);
  const expectedLabel = expectedMinutes ? `${(expectedMinutes / 60).toLocaleString("en-IN")}h` : "Not configured";

  return (
    <div className="page-content">
      <PageHeader
        title="Attendance & Reporting"
        subtitle="Server-recorded work hours, daily work reports, and attendance exceptions."
        action={
          activeTab === "attendance" ? (
            <label className="date-chip month-picker">
              <CalendarDays size={15} />
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
            </label>
          ) : undefined
        }
      />

      <div className="tab-pill-group" role="tablist" aria-label="Attendance sections" style={{ marginBottom: "20px" }}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "attendance"}
          className={`tab-pill-btn ${activeTab === "attendance" ? "tab-pill-active" : ""}`}
          onClick={() => setActiveTab("attendance")}
        >
          <Clock3 size={16} /> Attendance Log
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "reports"}
          className={`tab-pill-btn ${activeTab === "reports" ? "tab-pill-active" : ""}`}
          onClick={() => setActiveTab("reports")}
        >
          <FileText size={16} /> Daily Work Reports
        </button>
      </div>

      {activeTab === "reports" ? (
        <DailyWorkReportsView user={user} notify={notify} timezone={timezone} />
      ) : (
        <>
          <div className="stats-grid stats-three">
            <StatCard
              label="Recorded days"
              value={rows.length}
              detail="For selected month"
              icon={<CalendarDays size={20} />}
              tone="tone-blue"
            />
            <StatCard
              label="Recorded hours"
              value={`${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`}
              detail="Checked-out days only"
              icon={<Clock3 size={20} />}
              tone="tone-green"
            />
            <StatCard
              label="Expected hours"
              value={expectedLabel}
              detail={expectedMinutes ? "Configured paid hours per day" : "Confirm paid hours and breaks"}
              icon={<CircleHelp size={20} />}
              tone="tone-amber"
            />
          </div>
          <div className="legend-row">
            <span><i className="legend-dot dot-green" />Complete</span>
            <span><i className="legend-dot dot-blue" />Partial</span>
            <span><i className="legend-dot dot-amber" />Exception</span>
            <span><i className="legend-dot dot-purple" />Approved leave</span>
            <span><i className="legend-dot dot-red" />Unpaid absence review</span>
            <span><i className="legend-dot dot-gray" />Holiday / weekly off</span>
          </div>
          <section className="panel table-panel">
            {loading ? (
              <LoadingState />
            ) : rows.length ? (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      {user.role !== "employee" && <th>Employee</th>}
                      <th>Date</th>
                      <th>Check in</th>
                      <th>Check out</th>
                      <th>Hours</th>
                      <th>Completion</th>
                      <th>Exception</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => {
                      const percentage =
                        expectedMinutes && row.workedMinutes !== null
                          ? Math.min(100, Math.round((row.workedMinutes / expectedMinutes) * 100))
                          : null;
                      const status = percentage === null ? null : percentage >= 100 ? "complete" : "partial";
                      return (
                        <tr key={`${row.date}-${index}`}>
                          {user.role !== "employee" && (
                            <td>
                              {row.name}
                              <small className="table-sub">{row.employeeId}</small>
                            </td>
                          )}
                          <td>{formatDate(row.date)}</td>
                          <td>{formatTime(row.checkIn, timezone)}</td>
                          <td>{formatTime(row.checkOut, timezone)}</td>
                          <td>{durationLabel(row.workedMinutes)}</td>
                          <td>
                            {row.workedMinutes === null ? (
                              <span className="muted-cell">In progress</span>
                            ) : status ? (
                              <div className="completion-cell">
                                <StatusPill status={status} />
                                <small>
                                  {percentage}% · {durationLabel(row.workedMinutes)}
                                </small>
                                {expectedMinutes && row.workedMinutes > expectedMinutes && (
                                  <small className="overtime-note">
                                    Overtime +{durationLabel(row.workedMinutes - expectedMinutes)}
                                  </small>
                                )}
                              </div>
                            ) : (
                              <span className="muted-cell">Policy not configured</span>
                            )}
                          </td>
                          <td>{row.exceptionStatus ? <StatusPill status={row.exceptionStatus} /> : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No attendance records"
                detail="Check-in records will be shown for this month. Company holidays and weekly offs are not marked absent."
                icon={<Clock3 size={22} />}
              />
            )}
          </section>
        </>
      )}
      <div className="notice notice-info">
        <ShieldCheck size={17} />
        <span>
          Work duration is calculated by the server. Approved breaks and overtime still require confirmed company
          policy. Overtime is not included in the displayed completion percentage.
        </span>
      </div>
    </div>
  );
}
