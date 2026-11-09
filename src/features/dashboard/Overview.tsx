import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  BriefcaseBusiness,
  CalendarDays,
  Clock3,
  FileCheck2,
  ShieldCheck,
  Users,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Dashboard, NotifyFn, Section, User } from "../../types";
import { api, durationLabel, formatDate, formatTime } from "../../services/api";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingState } from "../../components/ui/LoadingState";
import { StatusPill } from "../../components/ui/StatusPill";
import { UserAvatar } from "../../components/ui/UserAvatar";
import { WorkHoursLollipopChart, type WorkHoursItem } from "../../WorkHoursLollipopChart";
import { AttendanceReportCard, type AttendanceDayItem, type AttendanceReportStatus } from "../../AttendanceReportCard";
import { CheckOutModal } from "../attendance/CheckOutModal";
import { PendingAutoReport } from "../attendance/PendingAutoReport";
import type { CheckoutReason } from "../../types";
import { Coffee, Play } from "lucide-react";
import { AttendanceTable } from "../attendance/AttendanceTable";
import { OverviewHero } from "./OverviewHero";
import { StatCard } from "./StatCard";

export interface OverviewProps {
  user: User;
  notify: NotifyFn;
  onNavigate: (section: Section) => void;
}

export function Overview({ user, notify, onNavigate }: OverviewProps) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [checkoutModalOpen, setCheckoutModalOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      const res = await api<Dashboard>("/api/dashboard");
      setData(res);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to load overview.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void reload();
    // Auto-refresh polling every 30 seconds for real-time dashboard sync
    const interval = setInterval(() => {
      void reload();
    }, 30000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void reload();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [reload]);

  const employeeAttendance = data?.attendance && !Array.isArray(data.attendance) ? data.attendance : null;
  const isOnBreak = employeeAttendance?.status === "on_break";
  const isCompleted = Boolean(employeeAttendance?.checkOut);
  const isWorking = Boolean(employeeAttendance?.checkIn && !employeeAttendance?.checkOut && !isOnBreak);

  // Real-time ticking elapsed minutes for checked-in employee
  const [liveElapsedMinutes, setLiveElapsedMinutes] = useState<number>(() => {
    if (employeeAttendance?.checkIn && !employeeAttendance?.checkOut) {
      return Math.max(0, Math.floor((Date.now() - new Date(employeeAttendance.checkIn).getTime()) / 60000));
    }
    return employeeAttendance?.workedMinutes ?? 0;
  });

  useEffect(() => {
    if (!employeeAttendance?.checkIn || employeeAttendance?.checkOut) {
      setLiveElapsedMinutes(employeeAttendance?.workedMinutes ?? 0);
      return;
    }
    const updateElapsed = () => {
      if (employeeAttendance.status === "on_break") {
        setLiveElapsedMinutes(employeeAttendance.workedMinutes ?? 0);
        return;
      }
      const elapsed = Math.max(0, Math.floor((Date.now() - new Date(employeeAttendance.checkIn!).getTime()) / 60000));
      // Active-work progress excludes tracked breaks; 9/10-hour limits use elapsed time.
      setLiveElapsedMinutes(Math.max(0, elapsed - (employeeAttendance.breakMinutes ?? 0)));
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 5000);
    return () => clearInterval(interval);
  }, [employeeAttendance?.checkIn, employeeAttendance?.checkOut, employeeAttendance?.workedMinutes, employeeAttendance?.status]);

  async function handleCheckIn() {
    setBusy(true);
    try {
      await api("/api/attendance/check-in", { method: "POST", body: JSON.stringify({}) });
      notify("Check-in recorded using server time.");
      await reload();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Attendance could not be updated.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleStartBreak() {
    setBusy(true);
    try {
      await api("/api/attendance/break/start", { method: "POST", body: JSON.stringify({}) });
      notify("Work session paused. Enjoy your break!");
      await reload();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to start break.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleResumeWork() {
    setBusy(true);
    try {
      await api("/api/attendance/break/resume", { method: "POST", body: JSON.stringify({}) });
      notify("Work session resumed. Welcome back!");
      await reload();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to resume work.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckoutConfirm(
    reason: CheckoutReason,
    note?: string,
    reportData?: { workSummary: string; projectReference?: string; blockers?: string }
  ) {
    setBusy(true);
    try {
      await api("/api/attendance/check-out", {
        method: "POST",
        body: JSON.stringify({
          reason,
          note,
          workSummary: reportData?.workSummary,
          projectReference: reportData?.projectReference,
          blockers: reportData?.blockers,
        }),
      });
      if (reason === "workday_complete") {
        notify("Workday completed. Your daily work report has been submitted.");
      } else {
        notify("Check-out recorded successfully.");
      }
      await reload();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Attendance could not be updated.", "error");
      throw error; // Keep checkout dialog open and retain the employee's summary.
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <LoadingState />;

  function OverviewCharts({
    data,
    chartPeriod,
    onPeriodChange,
  }: {
    data: Dashboard | null;
    chartPeriod: "daily" | "weekly" | "monthly";
    onPeriodChange: (period: "daily" | "weekly" | "monthly") => void;
  }) {
    const trend = data?.attendanceTrend ?? [];
    const report = data?.attendanceReport ?? [];
    const targetConfigured = data?.settings?.attendance_policy_confirmed === "true";
    const expectedTargetMinutes = targetConfigured && Number(data?.settings?.expected_working_minutes) > 0
      ? Number(data.settings.expected_working_minutes)
      : 480;

    const activeToday = data?.today || new Date().toISOString().slice(0, 10);
    const trendMap = new Map(trend.map((item) => [item.date, item]));
    const reportMap = new Map(report.map((item) => [item.date, item]));

    // Daily View: Last 6 calendar days strictly up to activeToday using deterministic UTC arithmetic
    const dailyRows: WorkHoursItem[] = Array.from({ length: 6 }, (_, index) => {
      const offset = 5 - index;
      const d = new Date(`${activeToday}T00:00:00Z`);
      d.setUTCDate(d.getUTCDate() - offset);
      const dayKey = d.toISOString().slice(0, 10);
      const isToday = dayKey === activeToday;

      const trendItem = trendMap.get(dayKey);
      const reportItem = reportMap.get(dayKey);

      let mins = trendItem?.averageMinutes ?? null;
      if (isToday) {
        mins = (isWorking || isOnBreak || isCompleted || (liveElapsedMinutes > 0))
          ? (employeeAttendance?.workedMinutes ?? liveElapsedMinutes)
          : (trendItem?.averageMinutes ?? null);
      }

      const hasRecord = mins !== null && mins > 0;
      const hours = mins !== null ? Math.round((mins / 60) * 100) / 100 : 0;

      let status: WorkHoursItem["status"] = "no_record";
      if (isToday) {
        if (isWorking) status = "active";
        else if (isOnBreak) status = "on_break";
        else if (isCompleted) status = "completed";
        else if (!isWorkingDay) {
          status = dayPolicy?.reason === "sunday" || dayPolicy?.reason === "second_saturday" ? "weekly_off" : "company_holiday";
        }
      } else if (reportItem?.status) {
        if (reportItem.status === "completed") status = "completed";
        else if (reportItem.status === "weekly_off") status = "weekly_off";
        else if (reportItem.status === "company_holiday") status = "company_holiday";
      }

      return {
        id: dayKey,
        label: new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(d),
        fullLabel: new Intl.DateTimeFormat("en", {
          weekday: "long",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(d),
        initial: new Intl.DateTimeFormat("en", { weekday: "narrow", timeZone: "UTC" }).format(d),
        hours,
        workedMinutes: mins,
        breakMinutes: trendItem?.breakMinutes ?? (isToday ? employeeAttendance?.breakMinutes : 0),
        status,
        isToday,
        hasRecord,
        holidayName: reportItem?.holidayName ?? (isToday ? dayPolicy?.holidayName : null),
      };
    });

    // Weekly View: 6 weekly windows up to activeToday
    const weeklyRows: WorkHoursItem[] = Array.from({ length: 6 }, (_, index) => {
      const endOffset = (5 - index) * 7;
      const end = new Date(`${activeToday}T00:00:00Z`);
      end.setUTCDate(end.getUTCDate() - endOffset);

      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - 6);

      const startKey = start.toISOString().slice(0, 10);
      const endKey = end.toISOString().slice(0, 10);

      const recordedDays = trend.filter((t) => t.date >= startKey && t.date <= endKey && t.averageMinutes !== null && t.averageMinutes > 0);
      
      const isCurrentWeek = index === 5;
      let totalMins = recordedDays.reduce((sum, d) => sum + (d.averageMinutes ?? 0), 0);
      let countDays = recordedDays.length;

      if (isCurrentWeek && (isWorking || isOnBreak) && !recordedDays.some((d) => d.date === activeToday)) {
        totalMins += liveElapsedMinutes;
        countDays += 1;
      }

      const avgMins = countDays > 0 ? Math.round(totalMins / countDays) : 0;
      const hours = Math.round((avgMins / 60) * 100) / 100;

      return {
        id: `week-${index}`,
        label: new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(start),
        fullLabel: `${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(start)} – ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(end)}`,
        initial: `${index + 1}`,
        hours,
        workedMinutes: avgMins,
        hasRecord: countDays > 0,
        workdayCount: countDays,
        isProvisional: isCurrentWeek && (isWorking || isOnBreak),
        isToday: isCurrentWeek,
      };
    });

    // Monthly View: Up to current month of current year (no future dates)
    const currentYear = parseInt(activeToday.slice(0, 4), 10);
    const currentMonthIdx = parseInt(activeToday.slice(5, 7), 10) - 1;
    const monthInitials = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

    const monthlyRows: WorkHoursItem[] = Array.from({ length: 12 }, (_, index) => {
      const monthDate = new Date(Date.UTC(currentYear, index, 1));
      const nextMonth = new Date(Date.UTC(currentYear, index + 1, 1));
      const startKey = monthDate.toISOString().slice(0, 10);
      const endKey = nextMonth.toISOString().slice(0, 10);

      const isFutureMonth = index > currentMonthIdx;
      const isCurrentMonth = index === currentMonthIdx;

      const recordedDays = !isFutureMonth
        ? trend.filter((t) => t.date >= startKey && t.date < endKey && t.averageMinutes !== null && t.averageMinutes > 0)
        : [];

      let totalMins = recordedDays.reduce((sum, d) => sum + (d.averageMinutes ?? 0), 0);
      let countDays = recordedDays.length;

      if (isCurrentMonth && (isWorking || isOnBreak) && !recordedDays.some((d) => d.date === activeToday)) {
        totalMins += liveElapsedMinutes;
        countDays += 1;
      }

      const avgMins = countDays > 0 ? Math.round(totalMins / countDays) : 0;
      const hours = Math.round((avgMins / 60) * 100) / 100;

      return {
        id: `month-${index}`,
        label: new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(monthDate),
        fullLabel: new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(monthDate),
        initial: monthInitials[index],
        hours,
        workedMinutes: avgMins,
        hasRecord: countDays > 0,
        workdayCount: countDays,
        isToday: isCurrentMonth,
      };
    });

    const workChartRows = chartPeriod === "daily" ? dailyRows : chartPeriod === "weekly" ? weeklyRows : monthlyRows;

    // Attendance Card Data matching real statuses and targets
    const attendanceCardData: AttendanceDayItem[] = dailyRows.map((day) => {
      const reportItem = reportMap.get(day.id);
      let pct: number | null = null;

      if (day.isToday) {
        if (isWorking || isOnBreak || isCompleted || (liveElapsedMinutes > 0)) {
          const currentMins = day.workedMinutes ?? liveElapsedMinutes;
          pct = targetConfigured
            ? Math.min(100, Math.round((currentMins / expectedTargetMinutes) * 100))
            : null;
        } else if (reportItem) {
          pct = reportItem.attendancePercent;
        }
      } else if (reportItem) {
        pct = reportItem.attendancePercent;
      }

      return {
        id: day.id,
        day: day.initial,
        fullDate: day.fullLabel,
        attendancePercent: pct,
        status: day.status as AttendanceReportStatus,
        workedMinutes: day.workedMinutes,
        holidayName: day.holidayName,
        isToday: day.isToday,
      };
    });

    return (
      <div className="overview-grid overview-charts-grid">
        <WorkHoursLollipopChart
          period={chartPeriod}
          onPeriodChange={onPeriodChange}
          liveData={isWorking || isOnBreak || liveElapsedMinutes > 0}
          data={workChartRows}
        />

        <AttendanceReportCard
          data={attendanceCardData}
          targetConfigured={targetConfigured}
        />
      </div>
    );
  }

  if (user.role === "ceo") {
    return (
      <div className="page-content">
        <OverviewHero
          user={user}
          today={data?.today}
          label="EXECUTIVE OVERVIEW"
          description="Your central view of people, attendance, and onboarding at MetaMinds Pvt. Ltd."
          action={
            <Button variant="secondary" onClick={() => onNavigate("applications")}>
              <FileCheck2 size={16} /> Review applications
            </Button>
          }
        />
        {!data?.emailConfigured && (
          <div className="notice notice-warning">
            <ShieldCheck size={18} />
            <span>
              <strong>Email updates are unavailable.</strong> Approvals and employee ID assignment still work,
              but email verification, password recovery, and applicant notifications need SMTP.{" "}
              <button className="inline-link" onClick={() => onNavigate("settings")}>
                Review settings
              </button>
            </span>
          </div>
        )}
        <div className="stats-grid">
          <StatCard
            label="Active people"
            value={data?.employees ?? 0}
            detail={`${data?.interns ?? 0} active interns`}
            icon={<Users size={20} />}
            tone="tone-blue"
          />
          <StatCard
            label="Present today"
            value={data?.present ?? 0}
            detail="Recorded check-ins"
            icon={<Activity size={20} />}
            tone="tone-green"
          />
          <StatCard
            label="Pending applications"
            value={data?.pendingApplications ?? 0}
            detail="Awaiting CEO review"
            icon={<FileCheck2 size={20} />}
            tone="tone-purple"
          />
          <StatCard
            label="Leave requests"
            value={data?.pendingLeaves ?? 0}
            detail="Pending approval"
            icon={<CalendarDays size={20} />}
            tone="tone-amber"
          />
        </div>
        <div className="overview-grid lower-grid">
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Today’s attendance</h2>
                <p>Most recent check-ins</p>
              </div>
              <button className="text-button" onClick={() => onNavigate("attendance")}>
                View attendance <ArrowUpRight size={15} />
              </button>
            </div>
            <AttendanceTable
              rows={Array.isArray(data?.attendance) ? data.attendance : []}
              timezone={data?.settings?.timezone}
            />
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Recent applications</h2>
                <p>Onboarding activity</p>
              </div>
              <button className="text-button" onClick={() => onNavigate("applications")}>
                View all <ArrowUpRight size={15} />
              </button>
            </div>
            {data?.recentApplications?.length ? (
              <div className="recent-list">
                {data.recentApplications.map((item) => (
                  <div className="recent-row" key={item.reference}>
                    <span className="recent-avatar">{item.name.slice(0, 1).toUpperCase()}</span>
                    <span className="recent-meta">
                      <strong>{item.name}</strong>
                      <small>
                        {item.employmentType} · {item.reference}
                      </small>
                    </span>
                    <StatusPill status={item.status} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No applications yet"
                detail="New applications will appear here after submission."
              />
            )}
          </section>
        </div>
        <section className="panel overview-departments">
          <div className="panel-heading">
            <div>
              <h2>People by department</h2>
              <p>Active employee records</p>
            </div>
            <span className="panel-icon">
              <Users size={18} />
            </span>
          </div>
          {data?.departmentDistribution?.length ? (
            <div className="department-list">
              {data.departmentDistribution.map((item) => (
                <div className="department-row" key={item.name}>
                  <span className="department-dot" />
                  <span>{item.name}</span>
                  <strong>{item.count}</strong>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="No department data"
              detail="Department counts will appear after approved onboarding."
            />
          )}
        </section>
        {Boolean(data?.attendanceExceptions) && (
          <div className="notice notice-warning">
            <Clock3 size={18} />
            <span>
              <strong>{data?.attendanceExceptions} attendance exception(s) need review.</strong> Potential
              unpaid absences are flagged for CEO review only; no deduction is calculated or applied
              automatically.
            </span>
            <button className="inline-link" onClick={() => onNavigate("attendance")}>
              Open attendance
            </button>
          </div>
        )}
      </div>
    );
  }

  if (user.role === "team_lead") {
    const teamRows = Array.isArray(data?.attendance) ? data.attendance : [];
    const teamTrend = data?.attendanceTrend ?? [];
    const hasTeamHours = teamTrend.some((item) => item.averageMinutes !== null && item.averageMinutes > 0);
    const chartRows = (
      hasTeamHours
        ? teamTrend
        : Array.from({ length: 7 }, (_, index) => {
            const date = new Date(`${data?.today ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`);
            date.setUTCDate(date.getUTCDate() - (6 - index));
            return {
              date: date.toISOString().slice(0, 10),
              averageMinutes: [408, 444, 372, 486, 426, 354, 456][index],
            };
          })
    ).map((item) => ({
      day: new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(
        new Date(`${item.date}T00:00:00Z`)
      ),
      hours: item.averageMinutes === null ? 0 : Math.round((item.averageMinutes / 60) * 10) / 10,
    }));

    return (
      <div className="page-content">
        <OverviewHero
          user={user}
          today={data?.today}
          label="TEAM LEAD OVERVIEW"
          description="A focused view of your team’s attendance, schedules, and leave requests."
          action={
            <Button variant="secondary" onClick={() => onNavigate("leave")}>
              <CalendarDays size={16} /> Review leave
            </Button>
          }
        />
        <div className="stats-grid stats-three">
          <StatCard
            label="Team members"
            value={data?.teamMembers ?? 0}
            detail="Active assigned accounts"
            icon={<Users size={20} />}
            tone="tone-blue"
          />
          <StatCard
            label="Present today"
            value={data?.present ?? 0}
            detail="Server-recorded check-ins"
            icon={<Activity size={20} />}
            tone="tone-green"
          />
          <StatCard
            label="Pending leave"
            value={data?.pendingLeaves ?? 0}
            detail="Requests for your team"
            icon={<CalendarDays size={20} />}
            tone="tone-purple"
          />
        </div>
        <div className="overview-grid">
          <section className="panel chart-panel">
            <div className="panel-heading">
              <div>
                <h2>Team work-hours trend</h2>
                <p>Average recorded hours per day · last 7 days</p>
              </div>
              <span className={`panel-badge ${hasTeamHours ? "" : "sample-badge"}`}>
                {hasTeamHours ? "Live data" : "Sample data"}
              </span>
            </div>
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartRows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke="#edf0f3" />
                  <XAxis
                    dataKey="day"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b", fontSize: 13, fontWeight: 600 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "#64748b", fontSize: 13, fontWeight: 600 }}
                  />
                  <Tooltip />
                  <Bar
                    dataKey="hours"
                    name="Average hours"
                    fill="#f28b32"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>Attendance exceptions</h2>
                <p>Cases requiring manager review</p>
              </div>
              <span className="panel-icon">
                <Clock3 size={18} />
              </span>
            </div>
            {data?.exceptions?.length ? (
              <div className="recent-list">
                {data.exceptions.map((item) => (
                  <div className="recent-row" key={`${item.name}-${item.date}`}>
                    <span className="recent-avatar recent-avatar-purple">
                      <Clock3 size={18} />
                    </span>
                    <span className="recent-meta">
                      <strong>{item.name}</strong>
                      <small>
                        {formatDate(item.date)} · deadline {formatTime(item.deadlineAt, data.settings.timezone)}
                      </small>
                    </span>
                    <StatusPill status={item.status} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                title="No open exceptions"
                detail="Attendance exceptions for your assigned team will appear here."
              />
            )}
          </section>
        </div>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Team attendance today</h2>
              <p>Only your assigned team is visible</p>
            </div>
            <button className="text-button" onClick={() => onNavigate("attendance")}>
              View history <ArrowUpRight size={15} />
            </button>
          </div>
          <AttendanceTable rows={teamRows} timezone={data?.settings?.timezone} />
        </section>
        {Boolean(data?.attendanceExceptions) && (
          <div className="notice notice-warning">
            <Clock3 size={18} />
            <span>
              <strong>{data?.attendanceExceptions} exception(s) need follow-up.</strong> Any salary
              treatment requires CEO authorization and is never automatic.
            </span>
          </div>
        )}
      </div>
    );
  }

  const todayAttendance = employeeAttendance;
  const currentWorkedMins = isWorking ? liveElapsedMinutes : (todayAttendance?.workedMinutes ?? null);
  const dayPolicy = data?.attendanceDayPolicy;
  const isWorkingDay = dayPolicy?.isWorkingDay ?? true;

  return (
    <div className="page-content">
      <OverviewHero
        user={user}
        today={data?.today}
        label="EMPLOYEE OVERVIEW"
        description={`Your personal workday, attendance, and leave workspace${
          user.position ? ` · ${user.position}` : ""
        }.`}
      />
      {user.employmentType === "intern" && (
        <div className="notice notice-info">
          <BriefcaseBusiness size={17} />
          <span>
            You are viewing the employee experience for an <strong>intern</strong>. Employment category is
            separate from system access.
          </span>
        </div>
      )}
      <div className="employee-grid">
        <section className="panel today-panel">
          <div className="panel-heading">
            <div>
              <h2>Today at work</h2>
              <p>{data?.settings?.timezone || "Company timezone"} · {data?.settings?.attendance_policy_confirmed === "true" ? "8 hours/day standard" : "Target not configured"}</p>
            </div>
            <span
              className={`attendance-indicator ${
                isCompleted
                  ? "indicator-complete"
                  : isOnBreak
                  ? "indicator-break"
                  : isWorking
                  ? "indicator-active"
                  : !isWorkingDay
                  ? "indicator-holiday"
                  : "indicator-idle"
              }`}
              title={
                isOnBreak
                  ? "On Break"
                  : isWorking
                  ? "Working — Active session"
                  : isCompleted
                  ? `Completed — ${durationLabel(todayAttendance?.workedMinutes)}`
                  : !isWorkingDay
                  ? dayPolicy?.message
                  : "Not checked in"
              }
            />
          </div>
          {!isWorkingDay && (
            <div className="notice notice-info compact-notice" role="status" style={{ marginBottom: "16px" }}>
              <CalendarDays size={18} />
              <div>
                <strong>
                  {dayPolicy?.reason === "sunday"
                    ? "Sunday — Weekly Off"
                    : dayPolicy?.reason === "second_saturday"
                    ? "Second Saturday — Weekly Off"
                    : `${dayPolicy?.holidayName ? `${dayPolicy.holidayName} — ` : ""}Company Holiday`}
                </strong>
                <p style={{ margin: "4px 0 0", fontSize: "12.5px" }}>
                  {dayPolicy?.reason === "sunday"
                    ? "Enjoy your weekly off. Attendance will be available on your next scheduled working day."
                    : dayPolicy?.reason === "second_saturday"
                    ? "Today is a scheduled company holiday. Attendance is unavailable."
                    : `${dayPolicy?.holidayName ? `${dayPolicy.holidayName} is an official company holiday.` : "Today is a company holiday."} Attendance is unavailable.`}
                </p>
              </div>
            </div>
          )}
          <div className="time-row">
            <div>
              <small>CHECK IN</small>
              <strong>
                {formatTime(todayAttendance?.check_in ?? todayAttendance?.checkIn, data?.settings?.timezone)}
              </strong>
            </div>
            <div className="time-divider" />
            <div>
              <small>CHECK OUT</small>
              <strong>
                {formatTime(todayAttendance?.check_out ?? todayAttendance?.checkOut, data?.settings?.timezone)}
              </strong>
            </div>
            <div className="time-divider" />
            <div>
              <small>{isOnBreak ? "ELAPSED WORK" : "WORKED"}</small>
              <strong>{durationLabel(currentWorkedMins)}</strong>
            </div>
            {Boolean(todayAttendance?.breakMinutes && todayAttendance.breakMinutes > 0) && (
              <>
                <div className="time-divider" />
                <div>
                  <small>BREAKS</small>
                  <strong style={{ color: isOnBreak ? "#f59e0b" : "#64748b" }}>
                    {todayAttendance?.breakMinutes ?? 0}m
                  </strong>
                </div>
              </>
            )}
          </div>
          {todayAttendance?.checkIn && !isCompleted && data?.attendanceAutomation && (
            <div className="notice notice-info compact-notice" role="status" style={{ marginTop: 12, marginBottom: 12 }}>
              <Clock3 size={17} aria-hidden="true" />
              <span>
                <strong>{currentWorkedMins !== null && currentWorkedMins >= 480
                  ? "Eight active work hours completed"
                  : `Active work: ${durationLabel(currentWorkedMins)} / 8h target`}</strong>
                <small style={{ display: "block" }}>
                  A reminder is sent after 9 elapsed hours. An open session automatically closes after 10 elapsed hours,
                  including breaks.
                </small>
              </span>
            </div>
          )}
          <div className="attendance-actions">
            {!todayAttendance ? (
              <Button
                disabled={busy || !isWorkingDay}
                onClick={() => void handleCheckIn()}
                title={!isWorkingDay ? dayPolicy?.message : undefined}
              >
                <Clock3 size={16} /> Check in
              </Button>
            ) : isOnBreak ? (
              <>
                <Button
                  onClick={() => void handleResumeWork()}
                  disabled={busy}
                  style={{ background: "#10b981", borderColor: "#059669", color: "#ffffff" }}
                >
                  <Play size={16} /> Resume Work
                </Button>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setCheckoutModalOpen(true)}
                >
                  <ArrowDownToLine size={16} /> Finish Session
                </Button>
              </>
            ) : isWorking ? (
              <>
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() => void handleStartBreak()}
                  style={{ color: "#d97706" }}
                >
                  <Coffee size={16} /> Take Break
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => setCheckoutModalOpen(true)}
                >
                  <ArrowDownToLine size={16} /> Check out
                </Button>
              </>
            ) : (
              <Button
                variant="secondary"
                disabled={true}
                title="Workday completed"
              >
                <Clock3 size={16} /> Workday Completed
              </Button>
            )}
          </div>
          {isOnBreak && (
            <p style={{ fontSize: "12px", color: "#d97706", margin: "10px 0 0", textAlign: "center", fontWeight: 600 }}>
              Session paused on break. Click "Resume Work" when ready to continue.
            </p>
          )}
          {isCompleted && todayAttendance?.checkoutReason && (
            <p style={{ fontSize: "12px", color: "#64748b", margin: "10px 0 0", textAlign: "center" }}>
              Finalized ({todayAttendance.checkoutReason === "automatic_timeout" ? "Automatically checked out — report required" : todayAttendance.checkoutReason === "leaving_early" ? "Leaving Early" : todayAttendance.checkoutReason === "other" ? "Other Reason" : "Workday Complete"}).
            </p>
          )}
          {!isWorkingDay && !isWorking && !isOnBreak && !isCompleted && (
            <p style={{ fontSize: "12px", color: "#64748b", margin: "10px 0 0", textAlign: "center" }}>
              {dayPolicy?.message}
            </p>
          )}
        </section>
        <section className="panel profile-panel">
          <UserAvatar user={user} className="profile-avatar" />
          <p className="eyebrow">YOUR PROFILE</p>
          <h2>{user.name}</h2>
          <p>{user.position || "Position not assigned"}</p>
          <div className="profile-divider" />
          <div className="profile-detail">
            <span>Employee ID</span>
            <strong>{user.employeeId || "Pending"}</strong>
          </div>
          <div className="profile-detail">
            <span>Employment type</span>
            <strong>{user.employmentType || "—"}</strong>
          </div>
          <div className="profile-detail">
            <span>Department</span>
            <strong>{user.department || "Unassigned"}</strong>
          </div>
        </section>
      </div>
      <PendingAutoReport reports={data?.pendingAutoReports ?? []} notify={notify} onSubmitted={reload} timezone={data?.settings?.timezone} />
      <OverviewCharts data={data} chartPeriod={chartPeriod} onPeriodChange={setChartPeriod} />
      <CheckOutModal
        isOpen={checkoutModalOpen}
        onClose={() => setCheckoutModalOpen(false)}
        onConfirmBreak={handleStartBreak}
        onConfirmCheckout={handleCheckoutConfirm}
      />
      <div className="overview-grid lower-grid">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Recent attendance</h2>
              <p>Your latest recorded workdays</p>
            </div>
            <button className="text-button" onClick={() => onNavigate("attendance")}>
              View history <ArrowUpRight size={14} />
            </button>
          </div>
          {data?.recentAttendance?.length ? (
            <AttendanceTable rows={data.recentAttendance} own timezone={data?.settings?.timezone} />
          ) : (
            <EmptyState
              title="No attendance records yet"
              detail="Your check-ins will appear here."
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Leave requests</h2>
              <p>{data?.pendingLeaves ?? 0} awaiting review</p>
            </div>
            <button className="text-button" onClick={() => onNavigate("leave")}>
              Manage leave <ArrowUpRight size={14} />
            </button>
          </div>
          {data?.leaves?.length ? (
            <div className="recent-list">
              {data.leaves.slice(0, 4).map((leave, index) => (
                <div className="recent-row" key={`${leave.startDate}-${index}`}>
                  <span className="recent-avatar recent-avatar-purple">
                    <CalendarDays size={15} />
                  </span>
                  <span className="recent-meta">
                    <strong>{leave.leaveType}</strong>
                    <small>
                      {formatDate(leave.startDate)} – {formatDate(leave.endDate)}
                    </small>
                  </span>
                  <StatusPill status={leave.status} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState
              title="Nothing on the calendar"
              detail="Leave requests and their approval status will show here."
            />
          )}
        </section>
      </div>
    </div>
  );
}
