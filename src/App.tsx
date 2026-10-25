import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Activity, ArrowDownToLine, ArrowUpRight, Bell, BriefcaseBusiness, CalendarDays, Camera, Check, Copy,
  ChevronDown, ChevronLeft, ChevronRight, CircleHelp, Clock3, CreditCard, Eye, EyeOff, FileCheck2, FileText, Fingerprint,
  GraduationCap, LayoutDashboard, Mail, LogOut, Menu, Search, Settings, ShieldCheck,
  Sparkles, Upload, Users, X, UserRound, ZoomIn,
} from "lucide-react";

import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { WorkHoursLollipopChart } from "./WorkHoursLollipopChart";
import { AttendanceReportCard } from "./AttendanceReportCard";

type User = {
  id: number;
  email: string;
  role: "ceo" | "team_lead" | "employee";
  employeeId: string | null;
  name: string;
  employmentType: "employee" | "intern" | null;
  position: string | null;
  department: string | null;
  photoUrl?: string | null;
};

type Application = {
  id: number;
  reference: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string;
  employmentType: string;
  position: string;
  department: string;
  proposedJoiningDate: string;
  discussedSalary?: string;
  education: string;
  education10thDoc?: string | null;
  educationInterDoc?: string | null;
  educationHigherDoc?: string | null;
  panFront?: string | null;
  panBack?: string | null;
  aadharFront?: string | null;
  aadharBack?: string | null;
  status: string;
  rejectionReason?: string;
  createdAt: string;
  employeeId?: string | null;
  activationUrl?: string;
  photoUrl?: string | null;
};

type Attendance = {
  date: string;
  name?: string;
  employeeId?: string;
  checkIn: string;
  checkOut: string | null;
  workedMinutes: number | null;
  check_in?: string;
  check_out?: string | null;
  progress?: { percentage: number | null; complete: boolean; overtimeMinutes: number } | null;
  exceptionStatus?: string | null;
};

type Leave = {
  id: number;
  employeeRowId?: number;
  name?: string;
  employeeId?: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: string;
  workingDays?: number;
  payTreatment?: "full_paid" | "half_pay" | "unpaid";
  requiresCeoApproval?: number;
  excessDays?: number;
  ceoDecisionNotes?: string;
  createdAt: string;
};

type Dashboard = {
  role: string;
  today: string;
  settings: Record<string, string>;
  emailConfigured?: boolean;
  employees?: number;
  interns?: number;
  present?: number;
  pendingApplications?: number;
  attendanceExceptions?: number;
  teamMembers?: number;
  emailQueue?: Array<{ status: string; count: number }>;
  attendanceTrend?: Array<{ date: string; present: number; averageMinutes: number | null }>;
  attendanceReport?: Array<{ date: string; present: number; expected: number; approvedLeave: number; reviewRequired: number; attendancePercent: number }>;
  departmentDistribution?: Array<{ name: string; count: number }>;
  recentApplications?: Array<{ reference: string; name: string; employmentType: string; status: string; createdAt: string }>;
  attendance?: Attendance | Attendance[] | null;
  pendingLeaves?: number;
  leaveBalance?: {
    entitled: number;
    used: number;
    remaining: number;
  };
  leaveTypes?: Array<{ id: number; name: string; paid: number }>;
  leaves?: Leave[];
  exceptions?: Array<{ date: string; deadlineAt: string; status: string; name?: string }>;
  recentAttendance?: Attendance[];
};

type Section = "overview" | "applications" | "employees" | "attendance" | "leave" | "payroll" | "settings" | "audit";

const sectionTitles: Record<Section, string> = {
  overview: "Overview",
  applications: "Applications",
  employees: "People directory",
  attendance: "Attendance",
  leave: "Leave management",
  payroll: "Payroll",
  settings: "Company settings",
  audit: "Audit log",
};

let csrfToken = "";

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const send = () => fetch(path, {
      ...options,
      credentials: "same-origin",
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.method && options.method !== "GET" ? { "X-CSRF-Token": csrfToken } : {}),
        ...options.headers,
      },
    });
  let response = await send();
  let payload = await response.json().catch(() => ({}));
  if (response.status === 403 && payload.error === "Your session expired. Refresh the page and try again." && options.method !== "GET") {
    const sessionResponse = await fetch("/api/auth/me", { credentials: "same-origin" });
    const session = await sessionResponse.json().catch(() => ({}));
    if (sessionResponse.ok && session.csrfToken) {
      csrfToken = session.csrfToken;
      response = await send();
      payload = await response.json().catch(() => ({}));
    }
  }
  if (!response.ok) throw new Error(payload.error || "The request could not be completed.");
  if (payload.csrfToken) csrfToken = payload.csrfToken;
  return payload as T;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value.slice(0, 10)}T00:00:00`));
}

function formatTime(value?: string | null, timezone = "Asia/Kolkata") {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(value));
}

function durationLabel(minutes?: number | null) {
  if (minutes === null || minutes === undefined) return "In progress";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <p className="eyebrow">METAMINDS PVT. LTD. · PEOPLE</p>
        <h1>{title}</h1>
        {subtitle && <p className="page-subtitle">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

function UserAvatar({ user, className = "" }: { user: { photoUrl?: string | null; name: string }; className?: string }) {
  const fallback = "/demo-avatar.svg";
  return <img className={`user-avatar ${className}`} src={user.photoUrl || fallback} alt={`${user.name} profile`} onError={(event) => { if (event.currentTarget.src !== new URL(fallback, window.location.href).href) event.currentTarget.src = fallback; }} />;
}

function BrandMark() {
  return (
    <div className="brand" aria-label="MetaMinds Pvt. Ltd.">
      <span className="brand-icon">
        <img src="/meta-minds-pvt-ltd.png" alt="" />
      </span>
      <span className="brand-copy">
        <span className="brand-name">MetaMinds</span>
        <span className="brand-legal">Pvt. Ltd.</span>
      </span>
    </div>
  );
}

function AuthAside() {
  return (
    <aside className="auth-aside" aria-label="MetaMinds employee community overview">
      <div className="aside-graphic" aria-hidden="true"><span /><span /><span /></div>
      <div className="aside-header">
        <div className="aside-brand-chip"><img src="/meta-minds-pvt-ltd.png" alt="" /><span>MetaMinds</span></div>
      </div>
      <div className="aside-illustration">
        <div className="illustration-panel" aria-hidden="true">
          <div className="floating-card card-top">
            <span className="card-label">Team engagement</span>
            <strong>94%</strong>
            <small>+8% this quarter</small>
          </div>
          <div className="floating-card card-left">
            <span className="card-label">Employee growth</span>
            <strong>+12%</strong>
            <small>New hires</small>
          </div>
          <div className="floating-card card-right">
            <span className="card-label">Attendance</span>
            <strong>86%</strong>
            <small>Live overview</small>
          </div>
          <div className="team-scene">
            <div className="team-avatars">
              <span className="avatar one">AM</span>
              <span className="avatar two">RN</span>
              <span className="avatar three">SK</span>
            </div>
            <div className="scene-board">
              <span className="board-pill">Connected teams</span>
              <div className="board-bars"><i /><i /><i /><i /></div>
            </div>
          </div>
        </div>
        <p className="illustration-note">Illustrative workspace preview · sample figures</p>
      </div>
      <div className="aside-copy">
        <span className="aside-kicker">PEOPLE & CULTURE PLATFORM</span>
        <h2>Great work starts with <span>great people.</span></h2>
        <p>Your people. Your progress. Everything that helps your team do its best work, all in one place.</p>
        <div className="aside-caption"><ShieldCheck size={18} /> A space for your people to thrive.</div>
      </div>
      <div className="aside-footer"><span>MetaMinds Pvt. Ltd.</span><span>People portal</span></div>
    </aside>
  );
}

function OverviewHero({ user, today, label, description, action }: { user: User; today?: string; label: string; description: string; action?: ReactNode }) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = today
    ? new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${today}T12:00:00`))
    : "Today";
  return <section className="overview-hero">
    <div className="overview-hero-copy">
      <div className="hero-meta"><span className="hero-tag"><Activity size={14} /> {label}</span><span className="hero-date"><CalendarDays size={14} /> {dateLabel}</span></div>
      <h1>{greeting}, {user.name.split(" ")[0]}</h1>
      <p>{description}</p>
      {action && <div className="hero-action">{action}</div>}
    </div>
    <aside className="hero-account">
      <span className="hero-live"><i /> Live portal · Authenticated</span>
      <div className="hero-user"><UserAvatar user={user} className="hero-user-avatar" /><span><strong>{user.email}</strong><small>{user.position || user.role.replace("_", " ")}</small></span></div>
    </aside>
  </section>;
}

function Button({ children, variant = "primary", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" | "danger" }) {
  return <button className={["button", `button-${variant}`, className].filter(Boolean).join(" ")} {...props}>{children}</button>;
}

function EmptyState({ title, detail, icon = <FileText size={28} /> }: { title: string; detail: string; icon?: ReactNode }) {
  return <div className="empty-state"><span className="empty-icon">{icon}</span><strong>{title}</strong><p>{detail}</p></div>;
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase().replaceAll("_", " ");
  return <span className={`status-pill status-${normalized.replaceAll(" ", "-")}`}>{normalized}</span>;
}

const CAL_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];
const CAL_WEEKDAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function formatDateDisplay(isoDate?: string) {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function CustomDatePicker({
  value,
  onChange,
  placeholder = "Select date",
  required,
  minDate,
  maxDate,
  disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
  minDate?: string;
  maxDate?: string;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const initialDate = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  }, [value]);

  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split("-").map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }, [value]);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handlePointerDown);
    }
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  function handlePrevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  }

  function handleNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  }

  function selectDate(isoString: string) {
    onChange(isoString);
    setIsOpen(false);
  }

  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isDisabled: boolean;
    }> = [];

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevM = viewMonth === 0 ? 12 : viewMonth;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${prevY}-${String(prevM).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      days.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        isDisabled: Boolean((minDate && dateStr < minDate) || (maxDate && dateStr > maxDate)),
      });
    }

    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        isDisabled: Boolean((minDate && dateStr < minDate) || (maxDate && dateStr > maxDate)),
      });
    }

    const totalCells = days.length <= 35 ? 35 : 42;
    const remaining = totalCells - days.length;
    for (let n = 1; n <= remaining; n++) {
      const nextM = viewMonth === 11 ? 1 : viewMonth + 2;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = `${nextY}-${String(nextM).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
      days.push({
        dateStr,
        dayNum: n,
        isCurrentMonth: false,
        isDisabled: Boolean((minDate && dateStr < minDate) || (maxDate && dateStr > maxDate)),
      });
    }

    return days;
  }, [viewYear, viewMonth, minDate, maxDate]);

  return (
    <div className={`custom-datepicker ${disabled ? "datepicker-disabled" : ""}`} ref={containerRef}>
      <button
        type="button"
        className={`datepicker-trigger ${isOpen ? "datepicker-trigger-active" : ""} ${value ? "datepicker-has-value" : ""}`}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className="datepicker-trigger-icon">
          <CalendarDays size={16} />
        </span>
        <span className="datepicker-trigger-text">
          {value ? formatDateDisplay(value) : placeholder}
        </span>
        <span className="datepicker-trigger-arrow">
          <ChevronDown size={14} className={isOpen ? "arrow-rotate" : ""} />
        </span>
      </button>

      <input
        type="text"
        value={value}
        required={required}
        readOnly
        style={{ opacity: 0, position: "absolute", width: 1, height: 1, pointerEvents: "none" }}
        tabIndex={-1}
      />

      {isOpen && (
        <div className="cal-popover" role="dialog" aria-label="Choose date">
          <div className="cal-header">
            <span className="cal-month-title">
              {CAL_MONTH_NAMES[viewMonth]}, {viewYear}
            </span>
            <div className="cal-nav-group">
              <button
                type="button"
                className="cal-nav-btn"
                onClick={handlePrevMonth}
                aria-label="Previous month"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                className="cal-nav-btn"
                onClick={handleNextMonth}
                aria-label="Next month"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          <div className="cal-weekdays">
            {CAL_WEEKDAY_NAMES.map((d) => (
              <span key={d} className="cal-weekday-label">
                {d}
              </span>
            ))}
          </div>

          <div className="cal-days-grid">
            {calendarDays.map((item) => {
              const isSelected = item.dateStr === value;
              const isToday = item.dateStr === todayStr;
              return (
                <button
                  type="button"
                  key={item.dateStr}
                  className={[
                    "cal-day-cell",
                    item.isCurrentMonth ? "cal-day-current" : "cal-day-outside",
                    isSelected ? "cal-day-selected" : "",
                    isToday ? "cal-day-today" : "",
                    item.isDisabled ? "cal-day-disabled" : "",
                  ].filter(Boolean).join(" ")}
                  disabled={item.isDisabled}
                  onClick={() => selectDate(item.dateStr)}
                >
                  <span>{item.dayNum}</span>
                </button>
              );
            })}
          </div>

          <div className="cal-footer">
            <button
              type="button"
              className="cal-footer-btn cal-clear-btn"
              onClick={() => { onChange(""); setIsOpen(false); }}
            >
              Clear
            </button>
            <button
              type="button"
              className="cal-footer-btn cal-today-btn"
              onClick={() => selectDate(todayStr)}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type DemoAccountInfo = {
  role: "ceo";
  title: string;
  badge: string;
  email: string;
  password: string;
  description: string;
};

const DEFAULT_DEMO_ACCOUNTS: DemoAccountInfo[] = [
  {
    role: "ceo",
    title: "CEO Portal",
    badge: "EXECUTIVE",
    email: "demo.ceo@metaminds.local",
    password: "Demo@Password123",
    description: "Workforce stats, approvals & audit log",
  },
];

function Login({ onLogin, onDemoLogin, onRegister, onForgot }: { onLogin: (identifier: string, password: string) => Promise<void>; onDemoLogin: (role: "ceo") => Promise<void>; onRegister: () => void; onForgot: () => void }) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [demoBusyRole, setDemoBusyRole] = useState<"ceo" | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || demoBusyRole) return;
    setBusy(true);
    setError("");
    if (/^MM-APP-/i.test(identifier.trim())) {
      setError("That is an application reference, not a sign-in ID. Use your work email or the employee ID in your approval email (MM-YYYY-NNNN). Sign-in is available after approval.");
      setBusy(false);
      return;
    }
    try {
      await onLogin(identifier, password);
    } catch {
      setError("We couldn’t sign you in. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleDemoDirectLogin(role: "ceo") {
    if (busy || demoBusyRole) return;
    setDemoBusyRole(role);
    setError("");
    try {
      await onDemoLogin(role);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in with dummy account.");
    } finally {
      setDemoBusyRole(null);
    }
  }

  function handleAutofill(account: DemoAccountInfo) {
    setIdentifier(account.email);
    setPassword(account.password);
    setError("");
  }

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <BrandMark />
        <div className="auth-form-header">
          <p className="eyebrow">EMPLOYEE & LEADERSHIP PORTAL</p>
          <h1>Welcome back.</h1>
        </div>
        <p className="auth-lead">Sign in to your workspace or explore with dummy portal accounts.</p>

        <div className="dummy-login-box">
          <div className="dummy-login-header">
            <span className="dummy-login-tag"><Sparkles size={13} /> DUMMY PORTAL LOGIN</span>
            <span className="dummy-pwd-badge">Password: <code>Demo@Password123</code></span>
          </div>
          <div className="dummy-cards-grid">
            {DEFAULT_DEMO_ACCOUNTS.map((acc) => {
              const isLoading = demoBusyRole === acc.role;
              return (
                <div key={acc.role} className="dummy-card dummy-card-ceo">
                  <div className="dummy-card-top">
                    <span className="dummy-role-icon icon-ceo">
                      <ShieldCheck size={18} />
                    </span>
                    <span className="dummy-card-title">{acc.title}</span>
                    <span className="dummy-pill pill-ceo">{acc.badge}</span>
                  </div>
                  <p className="dummy-card-desc">{acc.description}</p>
                  <div className="dummy-card-meta">
                    <button
                      type="button"
                      className="dummy-meta-pill"
                      title="Click to autofill into form"
                      onClick={() => handleAutofill(acc)}
                    >
                      <span>{acc.email}</span>
                      <small>FILL</small>
                    </button>
                  </div>
                  <button
                    type="button"
                    className="dummy-action-btn btn-ceo"
                    disabled={busy || Boolean(demoBusyRole)}
                    onClick={() => void handleDemoDirectLogin(acc.role)}
                  >
                    {isLoading ? "Signing in…" : "Login as CEO"}
                    {!isLoading && <ArrowUpRight size={14} />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="auth-divider"><span>OR SIGN IN MANUALLY</span></div>

        <form onSubmit={submit} className="form-stack login-form" aria-busy={busy || Boolean(demoBusyRole)}>
          <label className="auth-field">
            <span>Work email or employee ID</span>
            <input autoComplete="username" type="text" required value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="name@metaminds.com, MM-0042, or ceo" />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <div className="password-field">
              <input autoComplete="current-password" type={showPassword ? "text" : "password"} required value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password" />
              <button className="password-toggle" aria-label={showPassword ? "Hide password" : "Show password"} aria-pressed={showPassword} type="button" onClick={() => setShowPassword((current) => !current)}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </label>
          <div className="auth-row">
            <span className="auth-helper"><Sparkles size={14} /> Secure workspace access</span>
            <button className="text-button forgot-link" type="button" onClick={onForgot}>Forgot password?</button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
          <Button type="submit" className="login-submit" disabled={busy || Boolean(demoBusyRole)}>{busy ? "Signing in…" : "Sign in"}<ArrowUpRight size={16} /></Button>
          <span className="sr-only" role="status" aria-live="polite">{busy || demoBusyRole ? "Signing in, please wait." : ""}</span>
        </form>
        <div className="auth-divider"><span>New to MetaMinds?</span></div>
        <Button variant="secondary" className="apply-button" onClick={onRegister}>Apply to join the team</Button>
        <p className="auth-footnote">Access is provisioned only after authorized approval.</p>
      </section>
      <AuthAside />
    </main>
  );
}

function DocumentUploadBox({
  label,
  helper,
  value,
  onChange,
  required = false,
  icon = <FileText size={18} />,
}: {
  label: string;
  helper: string;
  value?: string | null;
  onChange: (dataUrl: string) => void;
  required?: boolean;
  icon?: ReactNode;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file?: File) {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert("File size exceeds 5MB limit. Please upload a smaller file.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      onChange(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className={`doc-box ${value ? "doc-box-active" : ""} ${dragOver ? "doc-box-dragover" : ""}`}>
      <div className="doc-box-header">
        <span className="doc-box-title-wrap">
          <span className="doc-icon-chip">{icon}</span>
          <span className="doc-title">{label} {required && <b className="required-star">*</b>}</span>
        </span>
        {value ? (
          <span className="doc-status-ready"><Check size={13} /> Attached</span>
        ) : (
          <span className="doc-status-pending">Required</span>
        )}
      </div>
      <p className="doc-box-helper">{helper}</p>

      {value ? (
        <div className="doc-preview-card">
          {value.startsWith("data:image/") ? (
            <img src={value} alt={label} className="doc-preview-thumb" />
          ) : (
            <div className="doc-pdf-fallback"><FileText size={28} /><span>PDF Document</span></div>
          )}
          <div className="doc-preview-meta">
            <span className="doc-preview-success">Document loaded & ready for verification</span>
            <div className="doc-preview-buttons">
              <button type="button" className="text-button" onClick={() => fileInputRef.current?.click()}>
                Replace file
              </button>
              <button type="button" className="text-button text-danger" onClick={() => onChange("")}>
                Remove
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div
          className="doc-dropzone"
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files?.[0];
            if (file) handleFile(file);
          }}
        >
          <Upload size={18} />
          <span>Click or drag image / PDF (JPG, PNG, PDF max 5MB)</span>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        accept="image/*,application/pdf"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
    </div>
  );
}

function Register({ onBack, onSubmitted }: { onBack: () => void; onSubmitted: (reference: string, emailQueued: boolean) => void }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    phone: "",
    photoUrl: "",
    email: "",
    employmentType: "employee",
    position: "",
    department: "",
    workMode: "hybrid",
    proposedJoiningDate: "",
    noticePeriod: "immediate",
    discussedSalary: "",
    education: "",
    education10thDoc: "",
    educationInterDoc: "",
    educationHigherDoc: "",
    panFront: "",
    panBack: "",
    aadharFront: "",
    aadharBack: "",
    password: "",
    confirmPassword: "",
    privacyAcknowledged: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const passwordStrength = useMemo(() => {
    const pwd = form.password;
    const hasMinLength = pwd.length >= 12;
    const hasCapital = /[A-Z]/.test(pwd);
    const hasNumber = /[0-9]/.test(pwd);
    const hasSpecial = /[^A-Za-z0-9]/.test(pwd);

    let passedCount = 0;
    if (hasMinLength) passedCount++;
    if (hasCapital) passedCount++;
    if (hasNumber) passedCount++;
    if (hasSpecial) passedCount++;

    let label = "Enter password";
    let color = "#94a3b8";
    let level = 0;

    if (pwd.length > 0) {
      if (passedCount <= 1) {
        label = "Weak";
        color = "#ef4444";
        level = 1;
      } else if (passedCount === 2) {
        label = "Fair";
        color = "#f59e0b";
        level = 2;
      } else if (passedCount === 3) {
        label = "Good";
        color = "#3b82f6";
        level = 3;
      } else {
        label = "Strong password";
        color = "#10b981";
        level = 4;
      }
    }

    return {
      hasMinLength,
      hasCapital,
      hasNumber,
      hasSpecial,
      passedCount,
      label,
      color,
      level,
    };
  }, [form.password]);

  const [emailCode, setEmailCode] = useState("");
  const [emailSent, setEmailSent] = useState(false);
  const [emailVerified, setEmailVerified] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailConfigured, setEmailConfigured] = useState<boolean | null>(null);
  const [emailConfigurationMessage, setEmailConfigurationMessage] = useState("");

  useEffect(() => {
    api<{ emailConfigured: boolean; emailConfigurationMessage: string }>("/api/health")
      .then(({ emailConfigured: configured, emailConfigurationMessage: message }) => {
        setEmailConfigured(configured);
        setEmailConfigurationMessage(message);
      })
      .catch((caught) => {
        setEmailConfigured(false);
        setError(caught instanceof Error ? caught.message : "Contact verification services could not be checked.");
      });
  }, []);

  function update(key: keyof typeof form, value: string | boolean) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  const [photoDragOver, setPhotoDragOver] = useState(false);

  function handlePhotoFile(file: File) {
    if (!file.type.startsWith("image/")) {
      setError("Please choose a valid image file (JPG, PNG, or WebP).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setError("Profile image must be less than 2MB.");
      return;
    }
    setError("");
    const reader = new FileReader();
    reader.onload = () => update("photoUrl", reader.result as string);
    reader.readAsDataURL(file);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (step === 1) {
        if (!form.firstName.trim() || !form.lastName.trim()) {
          throw new Error("Please enter your legal first name and last name.");
        }
        if (!form.phone.trim()) {
          throw new Error("Please enter your mobile phone number.");
        }
        await api("/api/applications/verification/start", {
          method: "POST",
          body: JSON.stringify({ firstName: form.firstName, lastName: form.lastName }),
        });
        setStatusMessage("");
        setStep(2);
        return;
      }
      if (step === 2) {
        if (!emailVerified) {
          throw new Error("Verify your email address before continuing.");
        }
        setStatusMessage("");
        setStep(3);
        return;
      }
      if (step === 3) {
        if (!form.position.trim()) throw new Error("Please specify your requested position / role.");
        if (!form.department.trim()) throw new Error("Please specify your department or practice area.");
        if (!form.proposedJoiningDate) throw new Error("Please select your proposed joining date.");
        if (!form.discussedSalary.trim()) throw new Error("Please provide your discussed salary.");
        if (form.password.length < 12) throw new Error("Password must be at least 12 characters.");
        if (!/[A-Z]/.test(form.password)) throw new Error("Password must include at least one capital letter (A-Z).");
        if (!/[0-9]/.test(form.password)) throw new Error("Password must include at least one number (0-9).");
        if (!/[^A-Za-z0-9]/.test(form.password)) throw new Error("Password must include at least one special character (!@#$%^&*...).");
        if (form.password !== form.confirmPassword) throw new Error("The passwords do not match.");
        setStatusMessage("");
        setStep(4);
        return;
      }
      // Step 4: Final submission with KYC & documents
      if (!form.education10thDoc) {
        throw new Error("Please upload your 10th standard marksheet / certificate.");
      }
      if (!form.educationInterDoc) {
        throw new Error("Please upload your Intermediate / 12th / Diploma certificate.");
      }
      if (!form.educationHigherDoc) {
        throw new Error("Please upload your higher qualification / degree certificate.");
      }
      if (!form.panFront || !form.panBack) {
        throw new Error("Please upload both front and back sides of your PAN card.");
      }
      if (!form.aadharFront || !form.aadharBack) {
        throw new Error("Please upload both front and back sides of your Aadhaar card.");
      }
      if (!form.privacyAcknowledged) {
        throw new Error("Please certify the accuracy of your details and KYC documents.");
      }
      const result = await api<{ reference: string; confirmationEmailQueued: boolean }>("/api/applications", {
        method: "POST",
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          employmentType: form.employmentType,
          position: form.position,
          department: form.department,
          proposedJoiningDate: form.proposedJoiningDate,
          discussedSalary: form.discussedSalary,
          education: form.education,
          education10thDoc: form.education10thDoc || undefined,
          educationInterDoc: form.educationInterDoc || undefined,
          educationHigherDoc: form.educationHigherDoc || undefined,
          panFront: form.panFront || undefined,
          panBack: form.panBack || undefined,
          aadharFront: form.aadharFront || undefined,
          aadharBack: form.aadharBack || undefined,
          privacyAcknowledged: form.privacyAcknowledged,
          password: form.password,
          photoUrl: form.photoUrl || undefined,
        }),
      });
      onSubmitted(result.reference, result.confirmationEmailQueued);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to submit your application.");
    } finally {
      setBusy(false);
    }
  }

  async function sendOtp() {
    if (emailConfigured === false) {
      setError(emailConfigurationMessage || "Email verification is unavailable until the company administrator configures SMTP.");
      return;
    }
    setError("");
    setStatusMessage("");
    setBusy(true);
    try {
      const result = await api<{ destination: string; expiresInMinutes: number }>(
        "/api/applications/verification/email/send",
        { method: "POST", body: JSON.stringify({ email: form.email }) },
      );
      setEmailSent(true);
      setEmailVerified(false);
      setEmailCode("");
      setStatusMessage(`A verification email was sent to ${result.destination}. The code expires in ${result.expiresInMinutes} minutes.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send the email verification code.");
    } finally {
      setBusy(false);
    }
  }

  async function verifyOtp() {
    setError("");
    setStatusMessage("");
    setBusy(true);
    try {
      const result = await api<{ verified: boolean }>("/api/applications/verification/email/verify", {
        method: "POST",
        body: JSON.stringify({ code: emailCode }),
      });
      setEmailVerified(result.verified);
      setStatusMessage("Email address verified successfully.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to verify the email code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="application-shell">
      <div className="application-top"><BrandMark /><button className="text-button" onClick={onBack}>Back to sign in</button></div>
      <section className="application-card">
        <div className="application-heading">
          <span className="round-icon"><BriefcaseBusiness size={20} /></span>
          <div>
            <p className="eyebrow">METAMINDS PVT. LTD. · EMPLOYEE ONBOARDING</p>
            <h1>Employee Registration & KYC</h1>
            <p>Provide your personal details, role preferences, and verification documents. Applications are reviewed directly by the CEO.</p>
          </div>
        </div>

        <div className="step-indicator" role="list" aria-label={`Application progress: step ${step} of 4`}>
          <div className={`step-item ${step === 1 ? "step-active" : "step-complete"}`} role="listitem">
            <span className="step-number">{step > 1 ? <Check size={15} /> : "1"}</span>
            <span className="step-copy"><small>STEP 01</small><strong>Personal Profile</strong></span>
          </div>
          <i className={step >= 2 ? "step-connector-active" : ""} aria-hidden="true" />
          <div className={`step-item ${step === 2 ? "step-active" : step > 2 ? "step-complete" : ""}`} role="listitem">
            <span className="step-number">{step > 2 ? <Check size={15} /> : "2"}</span>
            <span className="step-copy"><small>STEP 02</small><strong>Email Verification</strong></span>
          </div>
          <i className={step >= 3 ? "step-connector-active" : ""} aria-hidden="true" />
          <div className={`step-item ${step === 3 ? "step-active" : step > 3 ? "step-complete" : ""}`} role="listitem">
            <span className="step-number">{step > 3 ? <Check size={15} /> : "3"}</span>
            <span className="step-copy"><small>STEP 03</small><strong>Role & Salary</strong></span>
          </div>
          <i className={step >= 4 ? "step-connector-active" : ""} aria-hidden="true" />
          <div className={`step-item ${step === 4 ? "step-active" : ""}`} role="listitem">
            <span className="step-number">4</span>
            <span className="step-copy"><small>STEP 04</small><strong>KYC & Documents</strong></span>
          </div>
        </div>

        <form onSubmit={submit} className="form-grid">
          {step === 1 && (
            <>
              <label>
                <span>Legal First Name <b>*</b></span>
                <input required minLength={1} maxLength={60} autoComplete="given-name" value={form.firstName} onChange={(event) => update("firstName", event.target.value)} placeholder="e.g. Rahul" />
              </label>
              <label>
                <span>Legal Last Name <b>*</b></span>
                <input required minLength={1} maxLength={60} autoComplete="family-name" value={form.lastName} onChange={(event) => update("lastName", event.target.value)} placeholder="e.g. Sharma" />
              </label>
              <label className="full-width">
                <span>Contact Phone / Mobile Number <b>*</b></span>
                <input required type="tel" minLength={10} maxLength={20} autoComplete="tel" value={form.phone} onChange={(event) => update("phone", event.target.value)} placeholder="e.g. +91 98765 43210" />
                <small className="field-help">Your primary mobile number for employment communications and WhatsApp notices.</small>
              </label>
              <div
                className={`photo-card-box full-width ${photoDragOver ? "photo-card-dragover" : ""} ${form.photoUrl ? "photo-card-filled" : ""}`}
                onDragOver={(e) => { e.preventDefault(); setPhotoDragOver(true); }}
                onDragLeave={() => setPhotoDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setPhotoDragOver(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) handlePhotoFile(file);
                }}
              >
                <div className="photo-card-head">
                  <span className="photo-field-label">Profile Photograph (Headshot)</span>
                  <p className="photo-field-desc">Upload a clean passport-style headshot for your official ID card and team directory.</p>
                </div>

                <div className="photo-card-body">
                  <div
                    className="photo-avatar-wrap"
                    onClick={() => document.getElementById("reg-photo-upload")?.click()}
                    title="Click to upload or change headshot"
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") document.getElementById("reg-photo-upload")?.click(); }}
                  >
                    {form.photoUrl ? (
                      <img src={form.photoUrl} alt="Applicant headshot preview" className="photo-avatar-img" />
                    ) : (
                      <div className="photo-avatar-placeholder">
                        <UserRound size={36} className="photo-avatar-icon" />
                      </div>
                    )}
                    <span className="photo-avatar-badge" aria-hidden="true">
                      <Camera size={13} />
                    </span>
                  </div>

                  <div className="photo-meta-col">
                    <input
                      type="file"
                      id="reg-photo-upload"
                      accept="image/png, image/jpeg, image/jpg, image/webp"
                      style={{ display: "none" }}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) handlePhotoFile(file);
                      }}
                    />
                    <div className="photo-action-buttons">
                      <Button
                        type="button"
                        variant="secondary"
                        className="photo-upload-btn"
                        onClick={() => document.getElementById("reg-photo-upload")?.click()}
                      >
                        <Upload size={14} />
                        {form.photoUrl ? "Change photograph" : "Upload photograph"}
                      </Button>
                      {form.photoUrl && (
                        <Button
                          type="button"
                          variant="quiet"
                          className="photo-remove-btn"
                          onClick={() => update("photoUrl", "")}
                        >
                          <X size={14} /> Remove
                        </Button>
                      )}
                    </div>
                    <div className="photo-guidelines">
                      <span>JPG, PNG or WebP</span>
                      <span aria-hidden="true">•</span>
                      <span>Max 2 MB</span>
                      <span aria-hidden="true">•</span>
                      <span>Passport headshot recommended</span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="privacy-note full-width"><ShieldCheck size={19} /><span>Legal name and mobile contact are verified before account provisioning. Next, we will verify your work email address.</span></div>
            </>
          )}

          {step === 2 && (
            <div className="verification-grid full-width">
              {emailConfigured === false && <div className="notice notice-warning full-width"><ShieldCheck size={17} /><span>Email verification is unavailable. {emailConfigurationMessage || "The company administrator must configure SMTP before a code can be sent."}</span></div>}
              <section className={`verification-card ${emailVerified ? "verification-success" : ""}`}>
                <div className="verification-heading"><span className="verification-icon"><Mail size={19} /></span><span><strong>Email Address Verification</strong><small>We will send a six-character verification code to your inbox.</small></span>{emailVerified && <span className="verification-badge"><Check size={14} /> Verified</span>}</div>
                <label><span>Personal / Work Email <b>*</b></span><input required maxLength={254} type="email" autoComplete="email" value={form.email} onChange={(event) => { update("email", event.target.value); setEmailVerified(false); setEmailSent(false); setEmailCode(""); }} placeholder="you@example.com" /></label>
                <Button type="button" variant="secondary" disabled={busy || emailConfigured === false || !form.email.trim()} onClick={() => void sendOtp()}>{emailSent ? "Resend verification code" : "Send verification code"}</Button>
                {emailSent && !emailVerified && <div className="otp-entry"><label><span>Email verification code</span><input aria-label="Email verification code" required minLength={6} maxLength={6} autoComplete="one-time-code" value={emailCode} onChange={(event) => setEmailCode(event.target.value.toUpperCase())} placeholder="6-character code" /></label><Button type="button" disabled={busy || emailCode.length !== 6} onClick={() => void verifyOtp()}>Verify email</Button></div>}
              </section>
              <div className="privacy-note"><ShieldCheck size={19} /><span>Email confirmation guarantees you receive your approved employee ID and credential notices.</span></div>
            </div>
          )}

          {step === 3 && (
            <>
              <label>
                <span>Employment Category <b>*</b></span>
                <select value={form.employmentType} onChange={(event) => update("employmentType", event.target.value)}>
                  <option value="employee">Full-Time Employee</option>
                  <option value="intern">Internship</option>
                </select>
              </label>
              <label>
                <span>Requested Position / Designation <b>*</b></span>
                <input required maxLength={120} value={form.position} onChange={(event) => update("position", event.target.value)} placeholder="e.g. Senior Frontend Engineer" />
              </label>
              <label>
                <span>Department or Practice Area <b>*</b></span>
                <input required maxLength={100} value={form.department} onChange={(event) => update("department", event.target.value)} placeholder="e.g. Engineering, Product Design, Operations" />
              </label>
              <label>
                <span>Preferred Work Mode</span>
                <select value={form.workMode || "hybrid"} onChange={(event) => update("workMode", event.target.value)}>
                  <option value="hybrid">Hybrid (Office & Remote)</option>
                  <option value="onsite">On-site (Hyderabad HQ)</option>
                  <option value="remote">Remote (India)</option>
                </select>
              </label>
              <label>
                <span>Proposed Joining Date <b>*</b></span>
                <CustomDatePicker
                  value={form.proposedJoiningDate}
                  onChange={(val) => update("proposedJoiningDate", val)}
                  placeholder="Select proposed joining date"
                  required
                />
              </label>
              <label>
                <span>Notice Period / Availability <b>*</b></span>
                <select value={form.noticePeriod || "immediate"} onChange={(event) => update("noticePeriod", event.target.value)}>
                  <option value="immediate">Immediate Joiner (Ready to join)</option>
                  <option value="15_days">15 Days Notice Period</option>
                  <option value="30_days">30 Days Notice Period</option>
                  <option value="45_days">45 Days Notice Period</option>
                  <option value="60_days">60 Days Notice Period</option>
                  <option value="serving_notice">Currently Serving Notice Period</option>
                </select>
              </label>
              <label className="full-width">
                <span>Discussed Monthly Salary (₹ INR) <b>*</b></span>
                <input required maxLength={50} value={form.discussedSalary} onChange={(event) => update("discussedSalary", event.target.value)} placeholder="e.g. ₹60,000 / month or 60000" />
                <small className="field-help">Monthly compensation agreed during interview. Upon CEO approval, this automatically provisions your salary structure (50% Basic, 30% HRA, 20% Special) in the live Payroll register.</small>
              </label>

              <label className="password-input-col">
                <span>Create Portal Password <b>*</b></span>
                <div className="password-field">
                  <input
                    required
                    minLength={12}
                    maxLength={256}
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={form.password}
                    onChange={(event) => update("password", event.target.value)}
                    placeholder="Min 12 characters"
                  />
                  <button
                    className="password-toggle"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>
              <label className="password-input-col">
                <span>Confirm Portal Password <b>*</b></span>
                <div className="password-field">
                  <input
                    required
                    minLength={12}
                    maxLength={256}
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={form.confirmPassword}
                    onChange={(event) => update("confirmPassword", event.target.value)}
                    placeholder="Re-enter password"
                  />
                  <button
                    className="password-toggle"
                    aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </label>

              <div className="full-width password-strength-box">
                <div className="strength-top-row">
                  <span className="strength-caption">Password Strength:</span>
                  <strong className="strength-badge" style={{ color: passwordStrength.color }}>
                    {form.password ? passwordStrength.label : "Enter password"}
                  </strong>
                </div>
                <div className="strength-bars-track" aria-hidden="true">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`strength-bar-pill ${passwordStrength.level >= step ? "pill-filled" : ""}`}
                      style={{ backgroundColor: passwordStrength.level >= step ? passwordStrength.color : "#e2e8f0" }}
                    />
                  ))}
                </div>
                <div className="password-rules-row">
                  <span className={`rule-tag ${passwordStrength.hasSpecial ? "rule-passed" : ""}`}>
                    <Check size={12} /> One Special Character (!@#$%^&*...)
                  </span>
                  <span className={`rule-tag ${passwordStrength.hasCapital ? "rule-passed" : ""}`}>
                    <Check size={12} /> One Capital Letter (A-Z)
                  </span>
                  <span className={`rule-tag ${passwordStrength.hasNumber ? "rule-passed" : ""}`}>
                    <Check size={12} /> Numbers (0-9)
                  </span>
                  <span className={`rule-tag ${passwordStrength.hasMinLength ? "rule-passed" : ""}`}>
                    <Check size={12} /> Min. 12 Characters
                  </span>
                  {form.confirmPassword && (
                    <span className={`rule-tag ${form.password === form.confirmPassword ? "rule-passed" : "rule-failed"}`}>
                      <Check size={12} /> Passwords Match
                    </span>
                  )}
                </div>
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <div className="full-width kyc-notice-box">
                <ShieldCheck size={20} />
                <div>
                  <strong>Mandatory KYC & Educational Verification</strong>
                  <p>In accordance with MetaMinds company policy, all joining members must submit their 10th marksheet, intermediate certificate, higher degree, PAN card, and Aadhaar card for authorized CEO review.</p>
                </div>
              </div>

              <label className="full-width">
                <span>Highest Educational Qualification Summary</span>
                <textarea rows={2} maxLength={500} value={form.education} onChange={(event) => update("education", event.target.value)} placeholder="e.g. B.Tech in Computer Science from Anna University (CGPA: 8.9, 2020-2024)" />
              </label>

              <div className="full-width doc-grid">
                <DocumentUploadBox
                  label="10th Standard Certificate / Marksheet"
                  helper="Secondary school completion marksheet showing date of birth and scores."
                  value={form.education10thDoc}
                  onChange={(val) => update("education10thDoc", val)}
                  required
                  icon={<GraduationCap size={18} />}
                />
                <DocumentUploadBox
                  label="Intermediate / 12th / Diploma Certificate"
                  helper="Higher secondary (10+2) or polytechnic diploma certificate."
                  value={form.educationInterDoc}
                  onChange={(val) => update("educationInterDoc", val)}
                  required
                  icon={<GraduationCap size={18} />}
                />
                <DocumentUploadBox
                  label="Higher Qualification / Degree Certificate"
                  helper="Bachelor's, Master's, or highest completed degree certificate."
                  value={form.educationHigherDoc}
                  onChange={(val) => update("educationHigherDoc", val)}
                  required
                  icon={<GraduationCap size={18} />}
                />
                <DocumentUploadBox
                  label="PAN Card (Front Side)"
                  helper="Clear image of PAN card front showing Name, Photo, and PAN Number."
                  value={form.panFront}
                  onChange={(val) => update("panFront", val)}
                  required
                  icon={<CreditCard size={18} />}
                />
                <DocumentUploadBox
                  label="PAN Card (Back Side)"
                  helper="Clear image of PAN card back side."
                  value={form.panBack}
                  onChange={(val) => update("panBack", val)}
                  required
                  icon={<CreditCard size={18} />}
                />
                <DocumentUploadBox
                  label="Aadhaar Card (Front Side)"
                  helper="Aadhaar card front side showing photo and 12-digit UID."
                  value={form.aadharFront}
                  onChange={(val) => update("aadharFront", val)}
                  required
                  icon={<ShieldCheck size={18} />}
                />
                <DocumentUploadBox
                  label="Aadhaar Card (Back Side)"
                  helper="Aadhaar card back side showing official residential address."
                  value={form.aadharBack}
                  onChange={(val) => update("aadharBack", val)}
                  required
                  icon={<ShieldCheck size={18} />}
                />
              </div>

              <label className="consent-row full-width">
                <input required type="checkbox" checked={form.privacyAcknowledged} onChange={(event) => update("privacyAcknowledged", event.target.checked)} />
                <span>I certify that all details, salary agreements, and uploaded KYC documents (10th, Inter, Degree, PAN & Aadhaar) are authentic, accurate, and submitted for authorized employment review. I understand my account becomes active only upon CEO approval. <b>*</b></span>
              </label>
            </>
          )}

          {error && <p className="form-error full-width" role="alert">{error}</p>}
          {statusMessage && <p className="form-status full-width" role="status">{statusMessage}</p>}
          <div className="form-actions full-width">
            {step > 1 && (
              <Button variant="secondary" type="button" disabled={busy} onClick={() => { setError(""); setStatusMessage(""); setStep(step - 1); }}>
                Back
              </Button>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? (step === 4 ? "Submitting application…" : "Please wait…") : step < 4 ? "Continue to Next Step" : "Submit Application for CEO Approval"}
              <ArrowUpRight size={16} />
            </Button>
          </div>
        </form>
      </section>
      <p className="auth-footnote">Employee accounts remain pending until approved by the CEO. Once approved, you receive an automated confirmation email with your employee ID.</p>
    </main>
  );
}

function Activate({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api("/api/auth/activate", { method: "POST", body: JSON.stringify({ token, password }) });
      window.history.replaceState({}, "", window.location.pathname);
      onDone();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Activation could not be completed.");
    } finally {
      setBusy(false);
    }
  }
  return <main className="auth-shell"><section className="auth-card"><BrandMark /><p className="eyebrow">ACCOUNT SETUP</p><h1>Activate your account</h1><p className="auth-lead">Create a strong password to finish setting up your MetaMinds Pvt. Ltd. account.</p><form className="form-stack" onSubmit={submit}><label>New password<input required minLength={12} maxLength={256} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /><small>Use at least 12 characters.</small></label><label>Confirm password<input required minLength={12} maxLength={256} type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<Button disabled={busy}>{busy ? "Activating…" : "Set password"}<Check size={16} /></Button></form></section>    <AuthAside /></main>;}

function PasswordReset({ token, onDone, onBack }: { token?: string; onDone: () => void; onBack: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [emailStatus, setEmailStatus] = useState<"checking" | "configured" | "not-configured" | "unavailable">("checking");
  useEffect(() => {
    if (token) return;
    let active = true;
    api<{ emailConfigured: boolean }>("/api/health")
      .then((status) => {
        if (active) setEmailStatus(status.emailConfigured ? "configured" : "not-configured");
      })
      .catch(() => {
        if (active) setEmailStatus("unavailable");
      });
    return () => { active = false; };
  }, [token]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!token) {
      const normalizedEmail = email.trim();
      if (!normalizedEmail) {
        setError("Work email is required.");
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
        setError("Enter a valid work email address.");
        return;
      }
      setEmail(normalizedEmail);
    }
    if (token && password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      if (token) {
        const result = await api<{ message: string }>("/api/auth/password-reset", { method: "POST", body: JSON.stringify({ token, password }) });
        window.history.replaceState({}, "", window.location.pathname);
        setMessage(result.message);
        setPassword("");
        setConfirm("");
      } else {
        const result = await api<{ message: string }>("/api/auth/password-reset/request", { method: "POST", body: JSON.stringify({ email }) });
        setMessage(result.message);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Password reset could not be completed.");
    } finally {
      setBusy(false);
    }
  }
  return <main className="auth-shell"><section className="auth-card"><BrandMark /><p className="eyebrow">ACCOUNT RECOVERY</p><h1>{token ? "Choose a new password" : "Reset your password"}</h1><p className="auth-lead">{token ? "Use a strong password you have not used before." : "Enter the work email on your approved account. A one-time reset link is sent by email; employee IDs and application references cannot be used here."}</p>{!token && emailStatus === "not-configured" && <div className="notice notice-warning"><ShieldCheck size={17} /><span>Email delivery is not configured, so password reset links cannot be sent right now. Contact your administrator for help.</span></div>}{!token && emailStatus === "unavailable" && <div className="notice notice-warning"><ShieldCheck size={17} /><span>Email delivery setup could not be checked. You can still submit a request, but contact your administrator if no reset email arrives.</span></div>}{message ? <><div className="notice notice-info"><ShieldCheck size={17} /><span>{message} Check your inbox and spam folder for the one-time link. If no message arrives, check the address and contact your administrator; for your security, we cannot confirm whether an account exists.</span></div>{emailStatus === "not-configured" && <div className="notice notice-warning"><ShieldCheck size={17} /><span>No email could be sent until an administrator configures email delivery.</span></div>}</> : <form className="form-stack" noValidate onSubmit={submit}>{token ? <><label>New password<input required minLength={12} maxLength={256} type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /><small>Use at least 12 characters.</small></label><label>Confirm password<input required minLength={12} maxLength={256} type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} /></label></> : <label>Email<input required maxLength={254} type="email" autoComplete="email" aria-invalid={Boolean(error)} aria-describedby={error ? "reset-email-error" : undefined} value={email} onChange={(event) => { setEmail(event.target.value); setError(""); }} /></label>}{error && <p id={!token ? "reset-email-error" : undefined} className="form-error" role="alert">{error}</p>}<Button disabled={busy}>{busy ? "Please wait…" : token ? "Update password" : "Send reset link"}<ArrowUpRight size={16} /></Button></form>}<button className="text-button reset-back" onClick={() => { if (token) window.history.replaceState({}, "", window.location.pathname); (message ? onDone : onBack)(); }}>{message ? "Return to sign in" : "Back to sign in"}</button></section>  <AuthAside /></main>;}

function Sidebar({ user, section, onNavigate, onLogout, onHelp, onAccount, open, onClose }: { user: User; section: Section; onNavigate: (section: Section) => void; onLogout: () => void; onHelp: () => void; onAccount: () => void; open: boolean; onClose: () => void }) {
  const items: Array<{ id: Section; label: string; icon: ReactNode; roles: User["role"][] }> = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={21} />, roles: ["ceo", "team_lead", "employee"] },
    { id: "applications", label: "Applications", icon: <FileCheck2 size={21} />, roles: ["ceo"] },
    { id: "employees", label: user.role === "ceo" ? "People directory" : "My team", icon: <Users size={21} />, roles: ["ceo", "team_lead", "employee"] },
    { id: "attendance", label: "Attendance", icon: <Clock3 size={21} />, roles: ["ceo", "team_lead", "employee"] },
    { id: "leave", label: "Leave", icon: <CalendarDays size={21} />, roles: ["ceo", "team_lead", "employee"] },
    { id: "payroll", label: "Payroll", icon: <FileText size={21} />, roles: ["ceo"] },
  ];
  return <><button className={`mobile-scrim ${open ? "scrim-visible" : ""}`} aria-label="Close navigation" onClick={onClose} /><aside className={`sidebar ${open ? "sidebar-open" : ""}`}><div className="sidebar-top"><BrandMark /><button className="icon-button mobile-close" onClick={onClose} aria-label="Close navigation"><X size={20} /></button></div><nav className="side-nav" aria-label="Main navigation"><span className="nav-caption">WORKSPACE</span>{items.filter((item) => item.roles.includes(user.role)).map((item) => <button key={item.id} className={`nav-item ${section === item.id ? "nav-active" : ""}`} onClick={() => { onNavigate(item.id); onClose(); }}>{item.icon}<span>{item.label}</span></button>)}</nav>{user.role === "ceo" && <nav className="side-nav side-bottom" aria-label="Administration"><span className="nav-caption">ADMINISTRATION</span><button className={`nav-item ${section === "audit" ? "nav-active" : ""}`} onClick={() => onNavigate("audit")}><ShieldCheck size={21} /><span>Audit log</span></button></nav>}<div className="sidebar-footer"><button className={`sidebar-action ${section === "settings" ? "sidebar-action-active" : ""}`} onClick={() => { if (user.role === "ceo") onNavigate("settings"); else onAccount(); onClose(); }}><Settings size={20} /><span>Settings</span></button><button className="sidebar-action" onClick={() => { onHelp(); onClose(); }}><CircleHelp size={20} /><span>Help Center</span></button><button className="sidebar-action sidebar-logout" onClick={onLogout}><LogOut size={20} /><span>Log Out</span></button></div></aside></>;
}

function Topbar({ user, title, onMenu, onNotifications, onNavigate, onAccount, onLogout }: { user: User; title: string; onMenu: () => void; onNotifications: () => void; onMessages?: () => void; onNavigate: (section: Section) => void; onAccount: () => void; onLogout: () => void }) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const destinations: Array<{ label: string; section: Section; roles: User["role"][] }> = [
    { label: "Overview", section: "overview", roles: ["ceo", "team_lead", "employee"] },
    { label: user.role === "ceo" ? "People directory" : "My team", section: "employees", roles: ["ceo", "team_lead", "employee"] },
    { label: "Attendance", section: "attendance", roles: ["ceo", "team_lead", "employee"] },
    { label: "Leave", section: "leave", roles: ["ceo", "team_lead", "employee"] },
    { label: "Applications", section: "applications", roles: ["ceo"] },
    { label: "Payroll", section: "payroll", roles: ["ceo"] },
    { label: "Company settings", section: "settings", roles: ["ceo"] },
    { label: "Audit log", section: "audit", roles: ["ceo"] },
  ];
  const results = destinations.filter((item) => item.roles.includes(user.role) && (!query.trim() || item.label.toLowerCase().includes(query.trim().toLowerCase())));
  function openDestination(section: Section) {
    onNavigate(section);
    setSearchOpen(false);
    setQuery("");
  }
  return <header className="topbar"><div className="topbar-left"><button className="icon-button menu-toggle" onClick={onMenu} aria-label="Open navigation"><Menu size={19} /></button><span className="topbar-title">{title}</span></div><div className="topbar-actions"><div ref={searchRef} className={`topbar-search-wrap ${searchOpen ? "search-active" : ""}`}><button className="icon-button mobile-search-toggle" aria-label="Search workspace" onClick={() => setSearchOpen((open) => !open)}><Search size={17} /></button><label className="search-box"><Search size={15} /><input aria-label="Search workspace pages" placeholder="Search workspace" value={query} onFocus={() => setSearchOpen(true)} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }} onKeyDown={(event) => { if (event.key === "Escape") setSearchOpen(false); if (event.key === "Enter" && results[0]) openDestination(results[0].section); }} /></label>{searchOpen && <div className="search-results" role="listbox" aria-label="Workspace pages">{results.length ? results.map((item) => <button key={item.section} role="option" aria-selected="false" onMouseDown={(event) => event.preventDefault()} onClick={() => openDestination(item.section)}>{item.label}<ArrowUpRight size={14} /></button>) : <span>No matching workspace pages</span>}</div>}</div><button className="icon-button" onClick={onNotifications} aria-label="Notifications"><Bell size={18} /></button><span className="topbar-separator" /><div ref={profileRef} className="profile-menu-wrap"><button className="profile-trigger" aria-expanded={profileOpen} onClick={() => setProfileOpen((open) => !open)}><UserAvatar user={user} className="topbar-avatar" /><ChevronDown size={14} /></button>{profileOpen && <div className="profile-menu"><div className="profile-menu-identity"><strong>{user.name}</strong><small>{user.email}</small></div><button onClick={() => { onAccount(); setProfileOpen(false); }}><UserRound size={15} /> My account</button><button className="profile-logout" onClick={() => { onLogout(); setProfileOpen(false); }}><LogOut size={15} /> Log out</button></div>}</div></div></header>;
}

function StatCard({ label, value, icon, detail, tone }: { label: string; value: string | number; icon: ReactNode; detail: string; tone: string }) {
  return <article className="stat-card"><div className="stat-top"><span>{label}</span><span className={`stat-icon ${tone}`}>{icon}</span></div><strong>{value}</strong><p>{detail}</p></article>;
}

function Overview({ user, notify, onNavigate }: { user: User; notify: (message: string, kind?: "success" | "error") => void; onNavigate: (section: Section) => void }) {
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [chartPeriod, setChartPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
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
    const interval = setInterval(() => { void reload(); }, 30000);
    return () => clearInterval(interval);
  }, [reload]);

  async function attendanceAction(action: "check-in" | "check-out") {
    setBusy(true);
    try {
      await api(`/api/attendance/${action}`, { method: "POST", body: JSON.stringify({}) });
      notify(action === "check-in" ? "Check-in recorded using server time." : "Check-out recorded.");
      await reload();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Attendance could not be updated.", "error");
    } finally {
      setBusy(false);
    }
  }

  const employeeAttendance = data?.attendance && !Array.isArray(data.attendance) ? data.attendance : null;
  const isWorking = Boolean(employeeAttendance?.checkIn && !employeeAttendance?.checkOut);

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
      const diff = Math.max(0, Math.floor((Date.now() - new Date(employeeAttendance.checkIn!).getTime()) / 60000));
      setLiveElapsedMinutes(diff);
    };
    updateElapsed();
    const interval = setInterval(updateElapsed, 5000); // Live ticker every 5 seconds
    return () => clearInterval(interval);
  }, [employeeAttendance?.checkIn, employeeAttendance?.checkOut, employeeAttendance?.workedMinutes]);

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
    const today = data?.today ?? new Date().toISOString().slice(0, 10);
    const hasAttendance = report.length > 0;
    const hasWorkHours = trend.length > 0;
    const trendByDate = new Map(trend.map((item) => [item.date, item.averageMinutes]));

    // Calendar working days excluding Sundays
    const calendarDays = Array.from({ length: 365 }, (_, index) => {
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - (364 - index));
      const dayKey = date.toISOString().slice(0, 10);
      let mins = trendByDate.get(dayKey) ?? null;
      if (dayKey === today && isWorking) {
        mins = liveElapsedMinutes;
      }
      return { key: dayKey, date, averageMinutes: mins };
    }).filter((row) => row.date.getUTCDay() !== 0);

    const workChartRows = chartPeriod === "daily"
      ? calendarDays.slice(-6).map((row) => {
          const hours = row.key === today && isWorking
            ? Math.round((liveElapsedMinutes / 60) * 10) / 10
            : row.averageMinutes === null ? 0 : Math.round((row.averageMinutes / 60) * 10) / 10;
          return {
            label: new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(row.date),
            hours,
          };
        })
      : chartPeriod === "weekly"
        ? Array.from({ length: 6 }, (_, index) => {
            const end = new Date(`${today}T00:00:00Z`);
            end.setUTCDate(end.getUTCDate() - (5 - index) * 7);
            const start = new Date(end);
            start.setUTCDate(start.getUTCDate() - 6);
            const rows = calendarDays.filter((row) => row.date >= start && row.date <= end && row.averageMinutes !== null);
            const average = rows.length ? rows.reduce((sum, row) => sum + (row.averageMinutes ?? 0), 0) / rows.length : 0;
            return {
              label: new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(start),
              hours: Math.round((average / 60) * 10) / 10,
            };
          })
        : Array.from({ length: 12 }, (_, index) => {
            const month = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
            month.setUTCMonth(month.getUTCMonth() - (11 - index));
            const nextMonth = new Date(month);
            nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);
            const rows = calendarDays.filter((row) => row.date >= month && row.date < nextMonth && row.averageMinutes !== null);
            const average = rows.length ? rows.reduce((sum, row) => sum + (row.averageMinutes ?? 0), 0) / rows.length : 0;
            return {
              label: new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(month),
              hours: Math.round((average / 60) * 10) / 10,
            };
          });

    const sampleHours = [6.8, 7.4, 6.2, 7.1, 8, 5.9, 7.6, 6.4, 7.8, 6.9, 7.2, 6.5];
    const chartRows = hasWorkHours ? workChartRows : workChartRows.map((row, index) => ({
      ...row,
      hours: sampleHours[index % sampleHours.length],
    }));

    // Real-time calculation for Attendance Report bars
    const visibleReport = report.slice(-6).map((item) => {
      const isToday = item.date === today;
      let pct = item.attendancePercent;
      if (isToday && isWorking) {
        pct = Math.min(100, Math.round((liveElapsedMinutes / 480) * 100));
      }
      return {
        ...item,
        label: new Intl.DateTimeFormat("en", { weekday: "narrow", timeZone: "UTC" }).format(new Date(`${item.date}T00:00:00Z`)),
        fullDate: formatDate(item.date),
        attendancePercent: pct,
        remaining: Math.max(0, 100 - pct),
        sample: false,
        isToday,
      };
    });

    const attendanceSamples = [78, 92, 45, 70, 51, 88];
    const attendanceRows = hasAttendance ? visibleReport : calendarDays.slice(-6).map((day, index) => {
      const isToday = day.key === today;
      let pct = isToday && isWorking
        ? Math.min(100, Math.round((liveElapsedMinutes / 480) * 100))
        : attendanceSamples[index];
      return {
        date: day.key,
        label: new Intl.DateTimeFormat("en", { weekday: "narrow", timeZone: "UTC" }).format(day.date),
        fullDate: formatDate(day.key),
        present: 0,
        expected: 0,
        approvedLeave: 0,
        reviewRequired: 0,
        attendancePercent: pct,
        remaining: 100 - pct,
        sample: true,
        isToday,
      };
    });

    const attendanceCardData = attendanceRows.map((row) => ({
      id: row.date || row.label,
      day: row.label,
      fullDate: row.fullDate,
      attendancePercent: row.attendancePercent,
      sample: row.sample,
      isToday: row.isToday,
    }));

    return (
      <div className="overview-grid overview-charts-grid">
        <WorkHoursLollipopChart
          period={chartPeriod}
          onPeriodChange={onPeriodChange}
          liveData={hasWorkHours}
          data={hasWorkHours ? chartRows : undefined}
        />

        <AttendanceReportCard data={attendanceCardData} />
      </div>
    );
  }

  if (user.role === "ceo") {
    return <div className="page-content">
      <OverviewHero user={user} today={data?.today} label="EXECUTIVE OVERVIEW" description="Your central view of people, attendance, and onboarding at MetaMinds Pvt. Ltd." action={<Button variant="secondary" onClick={() => onNavigate("applications")}><FileCheck2 size={16} /> Review applications</Button>} />
      {!data?.emailConfigured && <div className="notice notice-warning"><ShieldCheck size={18} /><span><strong>Email updates are unavailable.</strong> Approvals and employee ID assignment still work, but email verification, password recovery, and applicant notifications need SMTP. <button className="inline-link" onClick={() => onNavigate("settings")}>Review settings</button></span></div>}
      <div className="stats-grid">
        <StatCard label="Active people" value={data?.employees ?? 0} detail={`${data?.interns ?? 0} active interns`} icon={<Users size={20} />} tone="tone-blue" />
        <StatCard label="Present today" value={data?.present ?? 0} detail="Recorded check-ins" icon={<Activity size={20} />} tone="tone-green" />
        <StatCard label="Pending applications" value={data?.pendingApplications ?? 0} detail="Awaiting CEO review" icon={<FileCheck2 size={20} />} tone="tone-purple" />
        <StatCard label="Leave requests" value={data?.pendingLeaves ?? 0} detail="Pending approval" icon={<CalendarDays size={20} />} tone="tone-amber" />
      </div>
      <div className="overview-grid lower-grid">
        <section className="panel"><div className="panel-heading"><div><h2>Today’s attendance</h2><p>Most recent check-ins</p></div><button className="text-button" onClick={() => onNavigate("attendance")}>View attendance <ArrowUpRight size={15} /></button></div><AttendanceTable rows={Array.isArray(data?.attendance) ? data.attendance : []} timezone={data?.settings?.timezone} /></section>
        <section className="panel"><div className="panel-heading"><div><h2>Recent applications</h2><p>Onboarding activity</p></div><button className="text-button" onClick={() => onNavigate("applications")}>View all <ArrowUpRight size={15} /></button></div>{data?.recentApplications?.length ? <div className="recent-list">{data.recentApplications.map((item) => <div className="recent-row" key={item.reference}><span className="recent-avatar">{item.name.slice(0, 1).toUpperCase()}</span><span className="recent-meta"><strong>{item.name}</strong><small>{item.employmentType} · {item.reference}</small></span><StatusPill status={item.status} /></div>)}</div> : <EmptyState title="No applications yet" detail="New applications will appear here after submission." />}</section>
      </div>
      <section className="panel overview-departments"><div className="panel-heading"><div><h2>People by department</h2><p>Active employee records</p></div><span className="panel-icon"><Users size={18} /></span></div>{data?.departmentDistribution?.length ? <div className="department-list">{data.departmentDistribution.map((item) => <div className="department-row" key={item.name}><span className="department-dot" /><span>{item.name}</span><strong>{item.count}</strong></div>)}</div> : <EmptyState title="No department data" detail="Department counts will appear after approved onboarding." />}</section>
      {Boolean(data?.attendanceExceptions) && <div className="notice notice-warning"><Clock3 size={18} /><span><strong>{data?.attendanceExceptions} attendance exception(s) need review.</strong> Potential unpaid absences are flagged for CEO review only; no deduction is calculated or applied automatically.</span><button className="inline-link" onClick={() => onNavigate("attendance")}>Open attendance</button></div>}
    </div>;
  }
  if (user.role === "team_lead") {
    const teamRows = Array.isArray(data?.attendance) ? data.attendance : [];
    const teamTrend = data?.attendanceTrend ?? [];
    const hasTeamHours = teamTrend.some((item) => item.averageMinutes !== null && item.averageMinutes > 0);
    const chartRows = (hasTeamHours ? teamTrend : Array.from({ length: 7 }, (_, index) => {
      const date = new Date(`${data?.today ?? new Date().toISOString().slice(0, 10)}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - (6 - index));
      return { date: date.toISOString().slice(0, 10), averageMinutes: [408, 444, 372, 486, 426, 354, 456][index] };
    })).map((item) => ({
      day: new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" }).format(new Date(`${item.date}T00:00:00Z`)),
      hours: item.averageMinutes === null ? 0 : Math.round(item.averageMinutes / 60 * 10) / 10,
    }));
    return <div className="page-content">
      <OverviewHero user={user} today={data?.today} label="TEAM LEAD OVERVIEW" description="A focused view of your team’s attendance, schedules, and leave requests." action={<Button variant="secondary" onClick={() => onNavigate("leave")}><CalendarDays size={16} /> Review leave</Button>} />
      <div className="stats-grid stats-three">
        <StatCard label="Team members" value={data?.teamMembers ?? 0} detail="Active assigned accounts" icon={<Users size={20} />} tone="tone-blue" />
        <StatCard label="Present today" value={data?.present ?? 0} detail="Server-recorded check-ins" icon={<Activity size={20} />} tone="tone-green" />
        <StatCard label="Pending leave" value={data?.pendingLeaves ?? 0} detail="Requests for your team" icon={<CalendarDays size={20} />} tone="tone-purple" />
      </div>
      <div className="overview-grid">
        <section className="panel chart-panel"><div className="panel-heading"><div><h2>Team work-hours trend</h2><p>Average recorded hours per day · last 7 days</p></div><span className={`panel-badge ${hasTeamHours ? "" : "sample-badge"}`}>{hasTeamHours ? "Live data" : "Sample data"}</span></div><div className="chart-wrap"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartRows} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}><CartesianGrid vertical={false} stroke="#edf0f3" /><XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 13, fontWeight: 600 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 13, fontWeight: 600 }} /><Tooltip /><Bar dataKey="hours" name="Average hours" fill="#f28b32" radius={[6, 6, 0, 0]} maxBarSize={44} /></BarChart></ResponsiveContainer></div></section>
        <section className="panel"><div className="panel-heading"><div><h2>Attendance exceptions</h2><p>Cases requiring manager review</p></div><span className="panel-icon"><Clock3 size={18} /></span></div>{data?.exceptions?.length ? <div className="recent-list">{data.exceptions.map((item) => <div className="recent-row" key={`${item.name}-${item.date}`}><span className="recent-avatar recent-avatar-purple"><Clock3 size={18} /></span><span className="recent-meta"><strong>{item.name}</strong><small>{formatDate(item.date)} · deadline {formatTime(item.deadlineAt, data.settings.timezone)}</small></span><StatusPill status={item.status} /></div>)}</div> : <EmptyState title="No open exceptions" detail="Attendance exceptions for your assigned team will appear here." />}</section>
      </div>
      <section className="panel"><div className="panel-heading"><div><h2>Team attendance today</h2><p>Only your assigned team is visible</p></div><button className="text-button" onClick={() => onNavigate("attendance")}>View history <ArrowUpRight size={15} /></button></div><AttendanceTable rows={teamRows} timezone={data?.settings?.timezone} /></section>
      {Boolean(data?.attendanceExceptions) && <div className="notice notice-warning"><Clock3 size={18} /><span><strong>{data?.attendanceExceptions} exception(s) need follow-up.</strong> Any salary treatment requires CEO authorization and is never automatic.</span></div>}
    </div>;
  }
  const todayAttendance = employeeAttendance;
  const currentWorkedMins = isWorking ? liveElapsedMinutes : (todayAttendance?.workedMinutes ?? null);
  return <div className="page-content">
    <OverviewHero user={user} today={data?.today} label="EMPLOYEE OVERVIEW" description={`Your personal workday, attendance, and leave workspace${user.position ? ` · ${user.position}` : ""}.`} />
    {user.employmentType === "intern" && <div className="notice notice-info"><BriefcaseBusiness size={17} /><span>You are viewing the employee experience for an <strong>intern</strong>. Employment category is separate from system access.</span></div>}
    <div className="employee-grid">
      <section className="panel today-panel"><div className="panel-heading"><div><h2>Today at work</h2><p>{data?.settings?.timezone || "Company timezone"} · 8 hours/day standard</p></div><span className={`attendance-indicator ${todayAttendance?.checkOut ? "indicator-complete" : todayAttendance ? "indicator-active" : "indicator-idle"}`} /></div><div className="time-row"><div><small>CHECK IN</small><strong>{formatTime(todayAttendance?.check_in ?? todayAttendance?.checkIn, data?.settings?.timezone)}</strong></div><div className="time-divider" /><div><small>CHECK OUT</small><strong>{formatTime(todayAttendance?.check_out ?? todayAttendance?.checkOut, data?.settings?.timezone)}</strong></div><div className="time-divider" /><div><small>WORKED</small><strong>{durationLabel(currentWorkedMins)}</strong></div></div><div className="attendance-actions"><Button disabled={busy || Boolean(todayAttendance)} onClick={() => void attendanceAction("check-in")}><Clock3 size={16} /> Check in</Button><Button variant="secondary" disabled={busy || !todayAttendance || Boolean(todayAttendance?.check_out)} onClick={() => void attendanceAction("check-out")}><ArrowDownToLine size={16} /> Check out</Button></div></section>
      <section className="panel profile-panel"><UserAvatar user={user} className="profile-avatar" /><p className="eyebrow">YOUR PROFILE</p><h2>{user.name}</h2><p>{user.position || "Position not assigned"}</p><div className="profile-divider" /><div className="profile-detail"><span>Employee ID</span><strong>{user.employeeId || "Pending"}</strong></div><div className="profile-detail"><span>Employment type</span><strong>{user.employmentType || "—"}</strong></div><div className="profile-detail"><span>Department</span><strong>{user.department || "Unassigned"}</strong></div></section>
    </div>
    <OverviewCharts data={data} chartPeriod={chartPeriod} onPeriodChange={setChartPeriod} />
    <div className="overview-grid lower-grid"><section className="panel"><div className="panel-heading"><div><h2>Recent attendance</h2><p>Your latest recorded workdays</p></div><button className="text-button" onClick={() => onNavigate("attendance")}>View history <ArrowUpRight size={14} /></button></div>{data?.recentAttendance?.length ? <AttendanceTable rows={data.recentAttendance} own timezone={data?.settings?.timezone} /> : <EmptyState title="No attendance records yet" detail="Your check-ins will appear here." />}</section><section className="panel"><div className="panel-heading"><div><h2>Leave requests</h2><p>{data?.pendingLeaves ?? 0} awaiting review</p></div><button className="text-button" onClick={() => onNavigate("leave")}>Manage leave <ArrowUpRight size={14} /></button></div>{data?.leaves?.length ? <div className="recent-list">{data.leaves.slice(0, 4).map((leave, index) => <div className="recent-row" key={`${leave.startDate}-${index}`}><span className="recent-avatar recent-avatar-purple"><CalendarDays size={15} /></span><span className="recent-meta"><strong>{leave.leaveType}</strong><small>{formatDate(leave.startDate)} – {formatDate(leave.endDate)}</small></span><StatusPill status={leave.status} /></div>)}</div> : <EmptyState title="Nothing on the calendar" detail="Leave requests and their approval status will show here." />}</section></div>
  </div>;
}

function AttendanceTable({ rows, own = false, timezone }: { rows: Attendance[]; own?: boolean; timezone?: string }) {
  if (!rows.length) return <EmptyState title="No records for this period" detail="Attendance appears once a check-in has been recorded." icon={<Clock3 size={22} />} />;
  return <div className="table-scroll"><table><thead><tr><th>{own ? "Date" : "Employee"}</th>{!own && <th>Employee ID</th>}<th>Check in</th><th>Check out</th><th>Hours</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.date}-${index}`}><td>{own ? formatDate(row.date) : row.name}</td>{!own && <td className="muted-cell">{row.employeeId}</td>}<td>{formatTime(row.checkIn, timezone)}</td><td>{formatTime(row.checkOut, timezone)}</td><td><span className="hours-value">{durationLabel(row.workedMinutes)}</span></td></tr>)}</tbody></table></div>;
}

function ApplicationsPage({ notify }: { notify: (message: string, kind?: "success" | "error") => void }) {
  const [rows, setRows] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [selected, setSelected] = useState<Application | null>(null);
  const [inspectingDoc, setInspectingDoc] = useState<{ title: string; url: string } | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api<Application[]>(`/api/applications?status=${filter}`));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not load applications.", "error");
    } finally {
      setLoading(false);
    }
  }, [filter, notify]);

  useEffect(() => { void load(); }, [load]);

  async function decide(decision: "approve" | "reject") {
    if (!selected) return;
    setBusy(true);
    try {
      if (decision === "approve") {
        const result = await api<{ employeeId: string; emailQueued: boolean; activationUrl?: string }>(
          `/api/applications/${selected.id}/approve`,
          { method: "POST", body: JSON.stringify({}) }
        );
        setSelected({ ...selected, status: "approved", employeeId: result.employeeId, activationUrl: result.activationUrl });
        notify(result.emailQueued
          ? `Application approved. Employee ID: ${result.employeeId}. Salary structure initialized & approval email queued.`
          : `Application approved. Employee ID: ${result.employeeId}. Salary structure initialized. SMTP is unavailable; applicant was not emailed.`);
      } else {
        const result = await api<{ emailQueued: boolean }>(
          `/api/applications/${selected.id}/reject`,
          { method: "POST", body: JSON.stringify({ reason }) }
        );
        setSelected({ ...selected, status: "rejected", rejectionReason: reason });
        notify(result.emailQueued ? "Application rejected. Notification email queued." : "Application rejected. SMTP is unavailable, so no notification email was sent.");
      }
      setReason("");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to update application.", "error");
    } finally {
      setBusy(false);
    }
  }

  async function copyActivationLink() {
    if (!selected?.activationUrl) return;
    try {
      await navigator.clipboard.writeText(selected.activationUrl);
      notify("One-time activation link copied. Share it directly with the applicant.");
    } catch {
      notify("Clipboard access was blocked. Copy the activation link manually.", "error");
    }
  }

  const kycDocs = selected ? [
    { title: "10th Standard Marksheet / Certificate", url: selected.education10thDoc, icon: <GraduationCap size={16} /> },
    { title: "Intermediate / 12th / Diploma Certificate", url: selected.educationInterDoc, icon: <GraduationCap size={16} /> },
    { title: "Degree / Higher Qualification Certificate", url: selected.educationHigherDoc, icon: <GraduationCap size={16} /> },
    { title: "PAN Card (Front Side)", url: selected.panFront, icon: <CreditCard size={16} /> },
    { title: "PAN Card (Back Side)", url: selected.panBack, icon: <CreditCard size={16} /> },
    { title: "Aadhaar Card (Front Side)", url: selected.aadharFront, icon: <ShieldCheck size={16} /> },
    { title: "Aadhaar Card (Back Side)", url: selected.aadharBack, icon: <ShieldCheck size={16} /> },
  ] : [];

  return (
    <div className="page-content">
      <PageHeader
        title="Employee Applications & KYC"
        subtitle="Review onboarding submissions, verify KYC & educational records, and approve employee credentials."
        action={<span className="count-chip">{rows.length} {filter}</span>}
      />
      <div className="filter-bar">
        <div className="segmented">
          {["pending", "approved", "rejected"].map((status) => (
            <button className={filter === status ? "segment-active" : ""} onClick={() => setFilter(status)} key={status}>
              {status[0].toUpperCase() + status.slice(1)}
            </button>
          ))}
        </div>
        <div className="filter-note">
          <ShieldCheck size={16} /> Only the CEO can review and approve employee onboarding
        </div>
      </div>

      <section className="panel table-panel">
        {loading ? (
          <LoadingState />
        ) : rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Applying for</th>
                  <th>Requested role</th>
                  <th>Discussed salary</th>
                  <th>Phone number</th>
                  <th>Joining date</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td>
                      <button className="table-person" onClick={() => setSelected(row)}>
                        <UserAvatar user={{ name: row.name, photoUrl: row.photoUrl }} className="tiny-avatar" />
                        <span>
                          <strong>{row.name}</strong>
                          <small>{row.email}</small>
                        </span>
                      </button>
                    </td>
                    <td><span className="category-tag">{row.employmentType === "intern" ? "Internship" : "Employee"}</span></td>
                    <td>
                      <strong>{row.position}</strong>
                      <small className="table-sub">{row.department || "General Department"}</small>
                    </td>
                    <td>
                      <span className="salary-pill-chip">
                        {row.discussedSalary ? (row.discussedSalary.startsWith("₹") ? row.discussedSalary : `₹${row.discussedSalary}`) : "—"}
                      </span>
                    </td>
                    <td>{row.phone || "—"}</td>
                    <td>{formatDate(row.proposedJoiningDate)}</td>
                    <td>{formatDate(row.createdAt)}</td>
                    <td><StatusPill status={row.status} /></td>
                    <td>
                      <button className="icon-button table-open" onClick={() => setSelected(row)} aria-label={`Open application for ${row.name}`}>
                        <ArrowUpRight size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title={`No ${filter} applications`}
            detail="New applications submitted through the registration portal will appear here for CEO review."
            icon={<FileCheck2 size={22} />}
          />
        )}
      </section>

      {selected && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}>
          <section className="modal-card modal-card-wide" role="dialog" aria-modal="true" aria-labelledby="application-modal-title">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">APPLICATION REF · {selected.reference}</p>
                <h2 id="application-modal-title">{selected.name}</h2>
                <p>{selected.position} · {selected.employmentType === "intern" ? "Internship" : "Full-Time Employee"}</p>
              </div>
              <button className="icon-button" onClick={() => setSelected(null)} aria-label="Close">
                <X size={19} />
              </button>
            </div>

            {selected.photoUrl && (
              <div className="modal-photo-preview">
                <img src={selected.photoUrl} alt={selected.name} className="modal-applicant-img" />
              </div>
            )}

            <div className="modal-details">
              <div>
                <small>Contact Email</small>
                <strong>{selected.email}</strong>
              </div>
              <div>
                <small>Phone / Mobile</small>
                <strong>{selected.phone || "Not specified"}</strong>
              </div>
              <div>
                <small>Department</small>
                <strong>{selected.department || "General"}</strong>
              </div>
              <div>
                <small>Proposed Joining Date</small>
                <strong>{formatDate(selected.proposedJoiningDate)}</strong>
              </div>
              {selected.employeeId && (
                <div>
                  <small>Assigned Employee ID</small>
                  <strong className="text-primary">{selected.employeeId}</strong>
                </div>
              )}
              <div className="modal-detail-wide">
                <small>Educational Background</small>
                <p>{selected.education || "No summary text provided."}</p>
              </div>
            </div>

            <div className="salary-overview-box modal-detail-wide">
              <div className="salary-overview-head">
                <Sparkles size={18} className="text-primary" />
                <div>
                  <strong>Agreed Monthly Compensation: {selected.discussedSalary || "Not specified"}</strong>
                  <p>Upon CEO approval, a formal salary structure is automatically generated in the live Payroll register (50% Basic, 30% HRA, 20% Special Allowance) for this employee.</p>
                </div>
              </div>
            </div>

            {/* KYC & Document Gallery */}
            <div className="kyc-section modal-detail-wide">
              <div className="kyc-section-header">
                <h3>Uploaded KYC & Educational Certificates</h3>
                <span className="kyc-badge">{kycDocs.filter(d => Boolean(d.url)).length} / 7 Documents Uploaded</span>
              </div>

              <div className="kyc-docs-grid">
                {kycDocs.map((doc, idx) => (
                  <div key={idx} className={`kyc-doc-card ${doc.url ? "kyc-doc-ready" : "kyc-doc-empty"}`}>
                    <div className="kyc-doc-top">
                      <span className="kyc-doc-icon">{doc.icon}</span>
                      <strong className="kyc-doc-name">{doc.title}</strong>
                      {doc.url ? (
                        <span className="doc-chip-ready"><Check size={12} /> Ready</span>
                      ) : (
                        <span className="doc-chip-missing">Missing</span>
                      )}
                    </div>
                    {doc.url ? (
                      <div className="kyc-doc-action-row">
                        {doc.url.startsWith("data:image/") ? (
                          <img src={doc.url} alt={doc.title} className="kyc-doc-thumb" />
                        ) : (
                          <div className="kyc-doc-pdf-chip"><FileText size={20} /><span>PDF File</span></div>
                        )}
                        <Button
                          type="button"
                          variant="secondary"
                          className="kyc-inspect-btn"
                          onClick={() => setInspectingDoc({ title: doc.title, url: doc.url! })}
                        >
                          <ZoomIn size={14} /> View Document
                        </Button>
                      </div>
                    ) : (
                      <p className="kyc-doc-none">No file uploaded for this requirement.</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {selected.activationUrl && (
              <div className="notice notice-warning">
                <ShieldCheck size={17} />
                <span>Email is unavailable. Copy this one-time activation link and share it with the applicant using a secure channel. It expires in 24 hours.</span>
                <Button variant="secondary" onClick={() => void copyActivationLink()}>
                  <Copy size={15} /> Copy activation link
                </Button>
              </div>
            )}

            {selected.status === "pending" && (
              <div className="modal-footer">
                <label className="full-width">
                  <span>If rejecting, record a reason</span>
                  <textarea rows={2} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Provide feedback to the applicant..." />
                </label>
                <Button variant="danger" disabled={busy || reason.trim().length < 3} onClick={() => void decide("reject")}>
                  Reject Application
                </Button>
                <Button disabled={busy} onClick={() => void decide("approve")}>
                  <Check size={16} /> Approve & Provision Employee ID
                </Button>
              </div>
            )}

            {selected.status !== "pending" && selected.rejectionReason && (
              <div className="notice notice-warning">CEO review rejection note: {selected.rejectionReason}</div>
            )}
          </section>
        </div>
      )}

      {/* Full Document Inspector Modal */}
      {inspectingDoc && (
        <div
          className="modal-backdrop inspector-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) setInspectingDoc(null); }}
        >
          <div className="doc-inspector-card" role="dialog" aria-modal="true">
            <div className="doc-inspector-header">
              <div>
                <p className="eyebrow">KYC DOCUMENT VIEWER</p>
                <h3>{inspectingDoc.title}</h3>
                <p>{selected?.name} · MetaMinds Verification</p>
              </div>
              <button className="icon-button" onClick={() => setInspectingDoc(null)} aria-label="Close document viewer">
                <X size={20} />
              </button>
            </div>
            <div className="doc-inspector-content">
              {inspectingDoc.url.startsWith("data:image/") ? (
                <img src={inspectingDoc.url} alt={inspectingDoc.title} className="doc-inspector-img" />
              ) : (
                <iframe src={inspectingDoc.url} title={inspectingDoc.title} className="doc-inspector-frame" />
              )}
            </div>
            <div className="doc-inspector-footer">
              <a
                href={inspectingDoc.url}
                download={`${selected?.name || "Applicant"}_${inspectingDoc.title.replace(/[^a-zA-Z0-9]/g, "_")}`}
                className="button button-secondary"
              >
                Download Document
              </a>
              <Button onClick={() => setInspectingDoc(null)}>Close Viewer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DirectoryPage({ user, notify }: { user: User; notify: (message: string, kind?: "success" | "error") => void }) {
  const [rows, setRows] = useState<Array<{ id: number; name: string; employeeId: string; employmentType: string; position: string; department: string | null; team: string | null; active: number; photoUrl?: string | null }>>([]);
  const [teams, setTeams] = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [teamName, setTeamName] = useState("");
  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [role, setRole] = useState("employee");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [people, teamData] = await Promise.all([api<typeof rows>("/api/employees"), api<typeof teams>("/api/teams")]);
      setRows(people);
      setTeams(teamData);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not load people.", "error"); }
    finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);
  const filtered = rows.filter((row) => `${row.name} ${row.employeeId} ${row.position} ${row.department ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  async function createTeam(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/teams", { method: "POST", body: JSON.stringify({ name: teamName }) });
      setTeamName("");
      notify("Team created.");
      await load();
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to create team.", "error"); }
  }
  async function assign(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/teams/assign", { method: "POST", body: JSON.stringify({ teamId: Number(selectedTeam), employeeId: Number(selectedEmployee), role }) });
      notify("Team membership and access role updated.");
      await load();
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to assign team member.", "error"); }
  }
  return <div className="page-content"><PageHeader title={user.role === "ceo" ? "People directory" : "My team"} subtitle="Approved employee records only. Employment category and access role are managed separately." action={<span className="count-chip">{rows.length} {rows.length === 1 ? "person" : "people"}</span>} /><div className="directory-toolbar"><label className="search-box directory-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search by name, ID, or department" /></label></div>{user.role === "ceo" && <div className="team-admin-grid"><form className="panel compact-form" onSubmit={createTeam}><div className="panel-heading"><div><h2>Create a team</h2><p>Optional workspace grouping</p></div><Users size={18} /></div><div className="inline-form"><input required minLength={2} value={teamName} onChange={(event) => setTeamName(event.target.value)} placeholder="Team name" /><Button type="submit">Create team</Button></div></form><form className="panel compact-form" onSubmit={assign}><div className="panel-heading"><div><h2>Assign access</h2><p>CEO-controlled team and role assignment</p></div><ShieldCheck size={18} /></div><div className="assign-grid"><select required value={selectedTeam} onChange={(event) => setSelectedTeam(event.target.value)}><option value="">Choose team</option>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select><select required value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)}><option value="">Choose person</option>{rows.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select><select value={role} onChange={(event) => setRole(event.target.value)}><option value="employee">Employee access</option><option value="team_lead">Team Lead access</option></select><Button type="submit" disabled={!teams.length || !rows.length}>Assign</Button></div></form></div>}<section className="panel table-panel">{loading ? <LoadingState /> : filtered.length ? <div className="table-scroll"><table><thead><tr><th>Name</th><th>Employee ID</th><th>Employment type</th><th>Position</th><th>Department</th><th>Team</th><th>Account</th></tr></thead><tbody>{filtered.map((person) => <tr key={person.id}><td><span className="table-person"><UserAvatar user={{ name: person.name, photoUrl: person.photoUrl }} className="tiny-avatar" /><span><strong>{person.name}</strong></span></span></td><td className="muted-cell">{person.employeeId}</td><td className="capitalize">{person.employmentType}</td><td>{person.position}</td><td>{person.department || "—"}</td><td>{person.team || "—"}</td><td><StatusPill status={person.active ? "active" : "activation pending"} /></td></tr>)}</tbody></table></div> : <EmptyState title="No matching employee records" detail="Applications create employee records only after authorized approval." icon={<Users size={22} />} />}</section></div>;
}

function AttendancePage({ user, notify }: { user: User; notify: (message: string, kind?: "success" | "error") => void }) {
  const [rows, setRows] = useState<Attendance[]>([]);
  const [month, setMonth] = useState("");
  const [expectedMinutes, setExpectedMinutes] = useState<number | null>(null);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const policy = await api<{ expectedWorkingMinutes: number | null; timezone: string; today: string }>("/api/policy");
      const selectedMonth = month || policy.today.slice(0, 7);
      if (!month) setMonth(selectedMonth);
      const records = await api<Attendance[]>(`/api/attendance?month=${selectedMonth}`);
      setRows(records);
      setExpectedMinutes(policy.expectedWorkingMinutes);
      setTimezone(policy.timezone);
    }
    catch (error) { notify(error instanceof Error ? error.message : "Could not load attendance.", "error"); }
    finally { setLoading(false); }
  }, [month, notify]);
  useEffect(() => { void load(); }, [load]);
  const totalMinutes = rows.reduce((sum, row) => sum + (row.workedMinutes ?? 0), 0);
  const expectedLabel = expectedMinutes ? `${(expectedMinutes / 60).toLocaleString("en-IN")}h` : "Not configured";
  return <div className="page-content">
    <PageHeader title="Attendance" subtitle="Server-recorded work hours and attendance exceptions. Future days, weekly offs, and company holidays are not counted as absences." action={<label className="date-chip month-picker"><CalendarDays size={15} /><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>} />
    <div className="stats-grid stats-three">
      <StatCard label="Recorded days" value={rows.length} detail="For selected month" icon={<CalendarDays size={20} />} tone="tone-blue" />
      <StatCard label="Recorded hours" value={`${Math.floor(totalMinutes / 60)}h ${totalMinutes % 60}m`} detail="Checked-out days only" icon={<Clock3 size={20} />} tone="tone-green" />
      <StatCard label="Expected hours" value={expectedLabel} detail={expectedMinutes ? "Configured paid hours per day" : "Confirm paid hours and breaks"} icon={<CircleHelp size={20} />} tone="tone-amber" />
    </div>
    <div className="legend-row"><span><i className="legend-dot dot-green" />Complete</span><span><i className="legend-dot dot-blue" />Partial</span><span><i className="legend-dot dot-amber" />Exception</span><span><i className="legend-dot dot-purple" />Approved leave</span><span><i className="legend-dot dot-red" />Unpaid absence review</span><span><i className="legend-dot dot-gray" />Holiday / weekly off</span></div>
    <section className="panel table-panel">
      {loading ? <LoadingState /> : rows.length ? <div className="table-scroll"><table><thead><tr>{user.role !== "employee" && <th>Employee</th>}<th>Date</th><th>Check in</th><th>Check out</th><th>Hours</th><th>Completion</th><th>Exception</th></tr></thead><tbody>{rows.map((row, index) => {
        const percentage = expectedMinutes && row.workedMinutes !== null
          ? Math.min(100, Math.round((row.workedMinutes / expectedMinutes) * 100))
          : null;
        const status = percentage === null ? null : percentage >= 100 ? "complete" : "partial";
        return <tr key={`${row.date}-${index}`}>{user.role !== "employee" && <td>{row.name}<small className="table-sub">{row.employeeId}</small></td>}<td>{formatDate(row.date)}</td><td>{formatTime(row.checkIn, timezone)}</td><td>{formatTime(row.checkOut, timezone)}</td><td>{durationLabel(row.workedMinutes)}</td><td>{row.workedMinutes === null ? <span className="muted-cell">In progress</span> : status ? <div className="completion-cell"><StatusPill status={status} /><small>{percentage}% · {durationLabel(row.workedMinutes)}</small>{expectedMinutes && row.workedMinutes > expectedMinutes && <small className="overtime-note">Overtime +{durationLabel(row.workedMinutes - expectedMinutes)}</small>}</div> : <span className="muted-cell">Policy not configured</span>}</td><td>{row.exceptionStatus ? <StatusPill status={row.exceptionStatus} /> : "—"}</td></tr>;
      })}</tbody></table></div> : <EmptyState title="No attendance records" detail="Check-in records will be shown for this month. Company holidays and weekly offs are not marked absent." icon={<Clock3 size={22} />} />}
    </section>
    <div className="notice notice-info"><ShieldCheck size={17} /><span>Work duration is calculated by the server. Approved breaks and overtime still require confirmed company policy. Overtime is not included in the displayed completion percentage.</span></div>
  </div>;
}

const INDIAN_HOLIDAYS_SET = new Set([
  "2025-01-26", "2025-03-14", "2025-03-31", "2025-04-14", "2025-04-18", "2025-05-01",
  "2025-06-07", "2025-08-15", "2025-09-05", "2025-10-02", "2025-10-20", "2025-11-05",
  "2025-12-25", "2026-01-26", "2026-03-04", "2026-03-21", "2026-04-03", "2026-04-14",
  "2026-05-01", "2026-05-31", "2026-08-15", "2026-09-04", "2026-10-02", "2026-10-20",
  "2026-11-08", "2026-11-24", "2026-12-25", "2027-01-26", "2027-03-23", "2027-08-15",
  "2027-10-02", "2027-12-25"
]);

function calculateWorkingDaysClient(start: string, end: string): number {
  if (!start || !end || start > end) return 0;
  let count = 0;
  const cur = new Date(`${start}T12:00:00Z`);
  const stop = new Date(`${end}T12:00:00Z`);
  while (cur <= stop) {
    const dayOfWeek = cur.getUTCDay();
    const dayOfMonth = cur.getUTCDate();
    const dateStr = cur.toISOString().slice(0, 10);
    const isSunday = dayOfWeek === 0;
    const isSecondSat = dayOfWeek === 6 && dayOfMonth >= 8 && dayOfMonth <= 14;
    const isHoliday = INDIAN_HOLIDAYS_SET.has(dateStr);
    if (!isSunday && !isSecondSat && !isHoliday) {
      count++;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

function LeavePage({ user, notify }: { user: User; notify: (message: string, kind?: "success" | "error") => void }) {
  const [rows, setRows] = useState<Leave[]>([]);
  const [types, setTypes] = useState<Array<{ id: number; name: string; paid: number }>>([]);
  const [leaveBalance, setLeaveBalance] = useState<{ entitled: number; used: number; remaining: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ leaveTypeId: "", startDate: "", endDate: "", reason: "" });
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [leaveTypeName, setLeaveTypeName] = useState("");
  const [leaveTypePaid, setLeaveTypePaid] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [leaveRows, leaveTypes, balanceData] = await Promise.all([
        api<Leave[]>("/api/leave"),
        api<typeof types>("/api/leave-types"),
        api<{ entitled: number; used: number; remaining: number }>("/api/leave/balance").catch(() => null),
      ]);
      setRows(leaveRows);
      setTypes(leaveTypes);
      setLeaveBalance(balanceData);
      if (!form.leaveTypeId && leaveTypes[0]) setForm((current) => ({ ...current, leaveTypeId: String(leaveTypes[0].id) }));
    } catch (error) { notify(error instanceof Error ? error.message : "Could not load leave requests.", "error"); }
    finally { setLoading(false); }
  }, [notify]);

  useEffect(() => { void load(); }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/leave", { method: "POST", body: JSON.stringify(form) });
      notify("Leave request submitted for review.");
      setForm((current) => ({ ...current, startDate: "", endDate: "", reason: "" }));
      await load();
    } catch (error) { notify(error instanceof Error ? error.message : "Leave request could not be submitted.", "error"); }
  }

  async function decide(id: number, decision: "approve" | "reject", payTreatment?: "full_paid" | "half_pay") {
    try {
      await api(`/api/leave/${id}/${decision}`, {
        method: "POST",
        body: JSON.stringify(decision === "reject" ? { reason: rejectReason } : { payTreatment })
      });
      notify(`Leave request ${decision === "approve" ? `approved (${payTreatment === "half_pay" ? "50% Half Pay" : "100% Paid"})` : "rejected"}.`);
      setRejectId(null);
      setRejectReason("");
      await load();
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to update leave request.", "error"); }
  }

  async function addLeaveType(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/leave-types", { method: "POST", body: JSON.stringify({ name: leaveTypeName, paid: leaveTypePaid }) });
      setLeaveTypeName("");
      notify("Leave type added.");
      await load();
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to add leave type.", "error"); }
  }

  const canReview = user.role === "ceo" || user.role === "team_lead";
  const requestedWorkingDays = (form.startDate && form.endDate) ? calculateWorkingDaysClient(form.startDate, form.endDate) : 0;
  const remainingQuota = leaveBalance?.remaining ?? 25;
  const isExcessRequest = requestedWorkingDays > remainingQuota;
  const excessDaysCount = Math.max(0, requestedWorkingDays - remainingQuota);

  return <div className="page-content">
    <PageHeader
      title="Leave management"
      subtitle="Pending leave is not approved leave. Company policy: 25 annual paid leaves, Monday–Saturday working days (2nd Saturday & Indian holidays off)."
      action={user.role === "employee" ? <span className="count-chip">{rows.filter((row) => row.status === "pending").length} pending</span> : undefined}
    />

    {user.role === "employee" && (
      <div className="leave-quota-banner">
        <div className="quota-metric-card">
          <span className="quota-metric-label">Annual Paid Leaves</span>
          <strong className="quota-metric-val">25</strong>
          <span className="quota-metric-sub">Company standard quota</span>
        </div>
        <div className="quota-metric-card">
          <span className="quota-metric-label">Paid Leaves Used</span>
          <strong className="quota-metric-val">{leaveBalance?.used ?? 0}</strong>
          <span className="quota-metric-sub">Approved this year</span>
        </div>
        <div className="quota-metric-card highlight-metric">
          <span className="quota-metric-label">Remaining Balance</span>
          <strong className="quota-metric-val">{leaveBalance?.remaining ?? 25}</strong>
          <span className="quota-metric-sub">{leaveBalance?.remaining ? "Available without CEO review" : "Exhausted (Needs CEO approval)"}</span>
        </div>
        <div className="quota-policy-card">
          <div className="quota-policy-header">
            <ShieldCheck size={16} />
            <strong>Company Work & Leave Rules</strong>
          </div>
          <p>• <strong>8 hours/day</strong> standard workday · Mon–Sat working days</p>
          <p>• <strong>2nd Saturday</strong> of each month & Indian Gazetted Holidays are off</p>
          <p>• <strong>25 Paid Leaves</strong> quota. Additional leaves require CEO approval (50% Half Pay by default; CEO considers 100% Paid Leave for important/critical reasons)</p>
        </div>
      </div>
    )}

    {user.role === "ceo" && (
      <form className="panel leave-type-form" onSubmit={addLeaveType}>
        <div>
          <h2>Company leave types</h2>
          <p>Configure leave categories for employee request selection.</p>
        </div>
        <input required maxLength={80} minLength={2} placeholder="e.g. Annual leave" value={leaveTypeName} onChange={(event) => setLeaveTypeName(event.target.value)} />
        <label className="checkbox-inline">
          <input type="checkbox" checked={leaveTypePaid} onChange={(event) => setLeaveTypePaid(event.target.checked)} /> Paid leave
        </label>
        <Button type="submit">Add leave type</Button>
      </form>
    )}

    {user.role === "employee" && (
      <section className="panel leave-apply-panel">
        <div className="panel-heading">
          <div>
            <h2>Request time off</h2>
            <p>Working days automatically exclude Sundays, 2nd Saturdays, and Indian Public Holidays.</p>
          </div>
          <CalendarDays size={18} />
        </div>
        {types.length ? (
          <form className="leave-form" onSubmit={submit}>
            <label>
              Leave type
              <select required value={form.leaveTypeId} onChange={(event) => setForm({ ...form, leaveTypeId: event.target.value })}>
                <option value="">Select a type</option>
                {types.map((type) => <option value={type.id} key={type.id}>{type.name}{type.paid ? " · paid" : ""}</option>)}
              </select>
            </label>
            <label>
              Start date
              <CustomDatePicker
                value={form.startDate}
                onChange={(val) => setForm({ ...form, startDate: val })}
                placeholder="Select start date"
                required
              />
            </label>
            <label>
              End date
              <CustomDatePicker
                value={form.endDate}
                onChange={(val) => setForm({ ...form, endDate: val })}
                placeholder="Select end date"
                required
                minDate={form.startDate || undefined}
              />
            </label>

            {requestedWorkingDays > 0 && (
              <div className="working-days-preview">
                📅 <strong>{requestedWorkingDays} working day(s)</strong> (excludes Sundays, 2nd Saturdays & Indian gazetted holidays)
              </div>
            )}

            {isExcessRequest && (
              <div className="notice notice-warning excess-leave-alert">
                <ShieldCheck size={18} />
                <div>
                  <strong>Excess Leave Notice: CEO Approval Required</strong>
                  <p>
                    This request of <strong>{requestedWorkingDays} working day(s)</strong> exceeds your remaining quota of <strong>{remainingQuota} day(s)</strong> by <strong>{excessDaysCount} day(s)</strong>.
                    It will be routed directly to the CEO asking for <strong>Half Payment (50% pay)</strong> by default. If your reason is considered reasonable and important, the CEO may approve it as <strong>100% Paid Leave</strong>.
                  </p>
                </div>
              </div>
            )}

            <label className="full-width">
              Reason
              <textarea required minLength={3} maxLength={1000} rows={3} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} />
            </label>
            <div className="full-width form-actions">
              <Button type="submit"><CalendarDays size={16} /> Submit request</Button>
            </div>
          </form>
        ) : (
          <div className="notice notice-warning">
            <CircleHelp size={17} />
            <span>Leave types have not been configured. Your administrator must confirm and add the company leave policy first.</span>
          </div>
        )}
      </section>
    )}

    {loading ? <LoadingState /> : rows.length ? (
      <section className="panel table-panel">
        <div className="panel-heading panel-heading-padded">
          <div>
            <h2>Request history</h2>
            <p>{rows.length} request(s) · Company rule: 25 paid leave quota, excess requires CEO approval</p>
          </div>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {user.role !== "employee" && <th>Employee</th>}
                <th>Leave type</th>
                <th>Dates</th>
                <th>Working days</th>
                <th>Reason</th>
                <th>Pay treatment</th>
                <th>Status</th>
                {canReview && <th>Review</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  {user.role !== "employee" && <td>{row.name}<small className="table-sub">{row.employeeId}</small></td>}
                  <td>{row.leaveType}</td>
                  <td>{formatDate(row.startDate)} – {formatDate(row.endDate)}</td>
                  <td>
                    <strong>{row.workingDays ?? (row.startDate && row.endDate ? calculateWorkingDaysClient(row.startDate, row.endDate) : "—")}</strong> <small className="table-sub">day(s)</small>
                  </td>
                  <td className="reason-cell">{row.reason}</td>
                  <td>
                    {row.status === "approved" ? (
                      row.payTreatment === "half_pay" ? (
                        <span className="treatment-badge badge-half">50% Half Pay</span>
                      ) : (
                        <span className="treatment-badge badge-full">100% Paid</span>
                      )
                    ) : row.requiresCeoApproval ? (
                      <span className="treatment-badge badge-ceo">Needs CEO Approval</span>
                    ) : (
                      <span className="muted-cell">Standard</span>
                    )}
                  </td>
                  <td><StatusPill status={row.status} /></td>
                  {canReview && (
                    <td>
                      {row.status === "pending" && (
                        user.role === "ceo" ? (
                          row.requiresCeoApproval || (row.excessDays && row.excessDays > 0) ? (
                            <div className="ceo-review-stack">
                              <Button
                                variant="primary"
                                onClick={() => void decide(row.id, "approve", "full_paid")}
                                title="Approve 100% Paid Leave (CEO considered reason reasonable and important)"
                              >
                                <Check size={14} /> 100% Paid Leave
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() => void decide(row.id, "approve", "half_pay")}
                                title="Approve 50% Half Pay (Standard policy for excess leave)"
                              >
                                <Check size={14} /> 50% Half Pay
                              </Button>
                              <Button
                                variant="danger"
                                onClick={() => { setRejectId(row.id); setRejectReason(""); }}
                              >
                                <X size={14} /> Reject
                              </Button>
                            </div>
                          ) : (
                            <div className="row-actions">
                              <Button variant="quiet" onClick={() => void decide(row.id, "approve", "full_paid")}><Check size={14} /> Approve</Button>
                              <Button variant="quiet" onClick={() => { setRejectId(row.id); setRejectReason(""); }}><X size={14} /> Reject</Button>
                            </div>
                          )
                        ) : (
                          row.requiresCeoApproval ? (
                            <span className="badge-warning-text">Escalated to CEO (Exceeds 25-day limit)</span>
                          ) : (
                            <div className="row-actions">
                              <Button variant="quiet" onClick={() => void decide(row.id, "approve", "full_paid")}><Check size={14} /> Approve</Button>
                              <Button variant="quiet" onClick={() => { setRejectId(row.id); setRejectReason(""); }}><X size={14} /> Reject</Button>
                            </div>
                          )
                        )
                      )}
                      {rejectId === row.id && (
                        <form className="reject-inline" onSubmit={(event) => { event.preventDefault(); void decide(row.id, "reject"); }}>
                          <input required minLength={3} maxLength={500} placeholder="Reason for rejection" value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
                          <Button variant="danger">Confirm</Button>
                        </form>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    ) : (
      <EmptyState title="No leave requests" detail="Submitted requests and their decision history will appear here." icon={<CalendarDays size={22} />} />
    )}
  </div>;
}

function PayrollPage({ notify }: { notify: (message: string, kind?: "success" | "error") => void }) {
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<{
    period: string;
    workingDays: number;
    totalGross: number;
    totalNet: number;
    totalDeductions: number;
    run: {
      id: number;
      period: string;
      status: "draft" | "disbursed";
      run_date: string;
      approved_at: string | null;
      total_gross: number;
      total_net: number;
    } | null;
    items: Array<{
      id: number;
      employeeId: string;
      name: string;
      position: string;
      department: string;
      photoUrl?: string | null;
      workingDays: number;
      attendedDays: number;
      paidLeaveDays: number;
      halfPayLeaveDays: number;
      unpaidAbsenceDays: number;
      payableDays: number;
      grossSalary: number;
      basic: number;
      hra: number;
      specialAllowance: number;
      leaveDeduction: number;
      pf: number;
      pt: number;
      tds: number;
      totalDeductions: number;
      netSalary: number;
      status: "draft" | "disbursed";
    }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selectedPayslip, setSelectedPayslip] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api<any>(`/api/payroll?period=${period}`);
      setData(res);
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to load payroll.", "error");
    } finally {
      setLoading(false);
    }
  }, [period, notify]);

  useEffect(() => {
    void load();
  }, [load]);

  async function disburse() {
    if (!window.confirm(`Are you sure you want to finalize and disburse payroll for ${period}? This action records disbursement and sends notifications.`)) {
      return;
    }
    setBusy(true);
    try {
      await api("/api/payroll/runs/disburse", {
        method: "POST",
        body: JSON.stringify({ period }),
      });
      notify(`Payroll disbursed successfully for ${period}.`);
      await load();
    } catch (err) {
      notify(err instanceof Error ? err.message : "Failed to disburse payroll.", "error");
    } finally {
      setBusy(false);
    }
  }

  const isDisbursed = data?.run?.status === "disbursed";

  return (
    <div className="page-content">
      <PageHeader
        title="Payroll & Compensation"
        subtitle="Manage employee salary structures, attendance deductions, statutory contributions, and disbursements."
        action={
          <div className="payroll-header-actions">
            <label className="date-chip month-picker">
              <CalendarDays size={15} />
              <input
                type="month"
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
              />
            </label>
            <Button
              disabled={busy || !data?.items.length || isDisbursed}
              onClick={disburse}
            >
              <FileCheck2 size={16} />
              {isDisbursed ? "Disbursed" : "Finalize & Disburse"}
            </Button>
          </div>
        }
      />

      <div className="stats-grid">
        <StatCard
          label="Total Gross Payroll"
          value={`₹${(data?.totalGross ?? 0).toLocaleString("en-IN")}`}
          detail={`${data?.workingDays ?? 0} working days in period`}
          icon={<FileText size={20} />}
          tone="tone-blue"
        />
        <StatCard
          label="Net Disbursals"
          value={`₹${(data?.totalNet ?? 0).toLocaleString("en-IN")}`}
          detail={isDisbursed ? `Disbursed on ${formatDate(data?.run?.run_date)}` : "Pending CEO payout"}
          icon={<Check size={20} />}
          tone="tone-green"
        />
        <StatCard
          label="Total Deductions"
          value={`₹${(data?.totalDeductions ?? 0).toLocaleString("en-IN")}`}
          detail="PF + PT + TDS + Unpaid leaves"
          icon={<ShieldCheck size={20} />}
          tone="tone-purple"
        />
        <StatCard
          label="Employees on Payroll"
          value={data?.items.length ?? 0}
          detail={isDisbursed ? "Status: Disbursed" : "Status: Draft calculation"}
          icon={<Users size={20} />}
          tone="tone-amber"
        />
      </div>

      <section className="panel table-panel">
        <div className="panel-heading">
          <div>
            <h2>Monthly Payroll Register · {period}</h2>
            <p>Calculated per company policy (8h/day, 25 annual paid leaves, statutory PF/PT/TDS).</p>
          </div>
          <span className={`status-badge ${isDisbursed ? "badge-paid" : "badge-draft"}`}>
            {isDisbursed ? "Disbursed" : "Draft Calculation"}
          </span>
        </div>

        {loading ? (
          <LoadingState />
        ) : data?.items.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Employee</th>
                  <th>Position & Dept</th>
                  <th>Attendance / Leaves</th>
                  <th>Payable Days</th>
                  <th>Gross Salary</th>
                  <th>Deductions</th>
                  <th>Net Take-Home</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((emp) => (
                  <tr key={emp.id}>
                    <td>
                      <span className="table-person">
                        <UserAvatar user={{ name: emp.name, photoUrl: emp.photoUrl }} className="tiny-avatar" />
                        <span>
                          <strong>{emp.name}</strong>
                          <small>{emp.employeeId}</small>
                        </span>
                      </span>
                    </td>
                    <td>
                      <div>{emp.position}</div>
                      <small className="table-sub">{emp.department || "General"}</small>
                    </td>
                    <td>
                      <div className="payroll-days-badge">
                        <span>{emp.attendedDays} worked</span>
                        {emp.paidLeaveDays > 0 && <small className="text-success"> +{emp.paidLeaveDays} paid lv</small>}
                        {emp.halfPayLeaveDays > 0 && <small className="text-warning"> +{emp.halfPayLeaveDays} half-pay</small>}
                        {emp.unpaidAbsenceDays > 0 && <small className="text-danger"> -{emp.unpaidAbsenceDays} unpaid</small>}
                      </div>
                    </td>
                    <td>
                      <strong>{emp.payableDays}</strong> / {emp.workingDays}
                    </td>
                    <td>
                      <strong>₹{emp.grossSalary.toLocaleString("en-IN")}</strong>
                    </td>
                    <td className="text-danger">
                      -₹{emp.totalDeductions.toLocaleString("en-IN")}
                    </td>
                    <td>
                      <strong className="text-success font-semibold">₹{emp.netSalary.toLocaleString("en-IN")}</strong>
                    </td>
                    <td>
                      <span className={`status-badge ${isDisbursed ? "badge-paid" : "badge-draft"}`}>
                        {isDisbursed ? "Paid" : "Draft"}
                      </span>
                    </td>
                    <td>
                      <button
                        className="button button-quiet button-sm"
                        onClick={() => setSelectedPayslip(emp)}
                      >
                        <FileText size={14} /> View Payslip
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No employees eligible for payroll"
            detail="Approved employee records will appear here for payroll processing."
            icon={<FileText size={24} />}
          />
        )}
      </section>

      {/* Payslip Modal */}
      {selectedPayslip && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelectedPayslip(null);
          }}
        >
          <div className="payslip-modal-card" role="dialog" aria-modal="true">
            <div className="payslip-modal-header">
              <div className="payslip-brand">
                <BrandMark />
                <span className="payslip-title">CONFIDENTIAL SALARY PAYSLIP</span>
              </div>
              <button
                className="icon-button"
                onClick={() => setSelectedPayslip(null)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="payslip-summary-grid">
              <div>
                <small>EMPLOYEE NAME</small>
                <strong>{selectedPayslip.name}</strong>
              </div>
              <div>
                <small>EMPLOYEE ID</small>
                <strong>{selectedPayslip.employeeId}</strong>
              </div>
              <div>
                <small>DESIGNATION</small>
                <strong>{selectedPayslip.position}</strong>
              </div>
              <div>
                <small>DEPARTMENT</small>
                <strong>{selectedPayslip.department || "General"}</strong>
              </div>
              <div>
                <small>PAY PERIOD</small>
                <strong>{period}</strong>
              </div>
              <div>
                <small>PAYABLE / WORKING DAYS</small>
                <strong>{selectedPayslip.payableDays} / {selectedPayslip.workingDays} Days</strong>
              </div>
            </div>

            <div className="payslip-breakdown-columns">
              <div className="payslip-table-box">
                <h4>EARNINGS</h4>
                <div className="payslip-row">
                  <span>Basic Salary (50%)</span>
                  <strong>₹{selectedPayslip.basic.toLocaleString("en-IN")}</strong>
                </div>
                <div className="payslip-row">
                  <span>House Rent Allowance (HRA 30%)</span>
                  <strong>₹{selectedPayslip.hra.toLocaleString("en-IN")}</strong>
                </div>
                <div className="payslip-row">
                  <span>Special Allowance (20%)</span>
                  <strong>₹{selectedPayslip.specialAllowance.toLocaleString("en-IN")}</strong>
                </div>
                <div className="payslip-divider" />
                <div className="payslip-row payslip-subtotal">
                  <strong>Total Gross Earnings</strong>
                  <strong>₹{selectedPayslip.grossSalary.toLocaleString("en-IN")}</strong>
                </div>
              </div>

              <div className="payslip-table-box">
                <h4>DEDUCTIONS</h4>
                <div className="payslip-row">
                  <span>Provident Fund (PF 12%)</span>
                  <strong>₹{selectedPayslip.pf.toLocaleString("en-IN")}</strong>
                </div>
                <div className="payslip-row">
                  <span>Professional Tax (PT)</span>
                  <strong>₹{selectedPayslip.pt.toLocaleString("en-IN")}</strong>
                </div>
                <div className="payslip-row">
                  <span>Tax Deducted at Source (TDS)</span>
                  <strong>₹{selectedPayslip.tds.toLocaleString("en-IN")}</strong>
                </div>
                {selectedPayslip.leaveDeduction > 0 && (
                  <div className="payslip-row text-danger">
                    <span>Unpaid Absence / Half-Pay Leave</span>
                    <strong>₹{selectedPayslip.leaveDeduction.toLocaleString("en-IN")}</strong>
                  </div>
                )}
                <div className="payslip-divider" />
                <div className="payslip-row payslip-subtotal text-danger">
                  <strong>Total Deductions</strong>
                  <strong>₹{selectedPayslip.totalDeductions.toLocaleString("en-IN")}</strong>
                </div>
              </div>
            </div>

            <div className="payslip-net-banner">
              <div>
                <small>NET TAKE-HOME SALARY</small>
                <div className="payslip-net-amount">
                  ₹{selectedPayslip.netSalary.toLocaleString("en-IN")}
                </div>
              </div>
              <span className={`status-badge ${isDisbursed ? "badge-paid" : "badge-draft"}`}>
                {isDisbursed ? "Disbursed / Paid" : "Draft Calculation"}
              </span>
            </div>

            <div className="payslip-modal-actions">
              <Button variant="secondary" onClick={() => setSelectedPayslip(null)}>
                Close
              </Button>
              <Button onClick={() => window.print()}>
                <Copy size={15} /> Print / Save PDF
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SettingsPage({ notify }: { notify: (message: string, kind?: "success" | "error") => void }) {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [ceoNotificationConfigured, setCeoNotificationConfigured] = useState(false);
  const [pendingEmails, setPendingEmails] = useState(0);
  const [failedEmails, setFailedEmails] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try {
      const result = await api<{ settings: Record<string, string>; emailConfigured: boolean; ceoNotificationConfigured: boolean; pendingEmails: number; failedEmails: number }>("/api/settings");
      setSettings(result.settings);
      setEmailConfigured(result.emailConfigured);
      setCeoNotificationConfigured(result.ceoNotificationConfigured);
      setPendingEmails(result.pendingEmails);
      setFailedEmails(result.failedEmails);
    } catch (error) { notify(error instanceof Error ? error.message : "Could not load settings.", "error"); }
    finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);
  function change(key: string, value: string) {
    setSettings((current) => ({ ...current, [key]: value }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await api("/api/settings", { method: "POST", body: JSON.stringify({
        timezone: settings.timezone,
        scheduled_start: settings.scheduled_start,
        scheduled_end: settings.scheduled_end,
        expected_working_minutes: settings.expected_working_minutes,
        absence_warning_hours: settings.absence_warning_hours,
      }) });
      notify("Company settings saved.");
      await load();
    } catch (error) { notify(error instanceof Error ? error.message : "Could not save company settings.", "error"); }
    finally { setBusy(false); }
  }
  if (loading) return <LoadingState />;
  return (
    <div className="page-content">
      <PageHeader title="Company settings" subtitle="Configure approved attendance policies and review service readiness." />
      <form className="settings-layout" onSubmit={save}>
        <section className="panel settings-panel">
          <div className="panel-heading"><div><h2>Attendance policy</h2><p>Attendance uses server timestamps and the configured company timezone.</p></div><Clock3 size={18} /></div>
          <div className="settings-grid">
            <label>Company timezone<input required value={settings.timezone || ""} onChange={(event) => change("timezone", event.target.value)} placeholder="Asia/Kolkata" /><small>Use an IANA timezone name.</small></label>
            <label>Scheduled start<input required type="time" value={settings.scheduled_start || ""} onChange={(event) => change("scheduled_start", event.target.value)} /></label>
            <label>Scheduled end<input required type="time" value={settings.scheduled_end || ""} onChange={(event) => change("scheduled_end", event.target.value)} /></label>
            <label>Expected workday hours<input type="number" min="0" max="24" step="0.25" value={settings.expected_working_minutes ? Number(settings.expected_working_minutes) / 60 : ""} onChange={(event) => change("expected_working_minutes", event.target.value ? String(Math.round(Number(event.target.value) * 60)) : "")} placeholder="8 hours" /><small>Current confirmed schedule: 10 AM–6 PM, Monday–Saturday.</small></label>
            <label>Manager review threshold<input required type="number" min="1" max="24" value={settings.absence_warning_hours || "3"} onChange={(event) => change("absence_warning_hours", event.target.value)} /><small>Employees receive hourly reminders from shift start; unresolved cases are flagged after this many hours. No automatic salary deduction.</small></label>
          </div>
        </section>
        <section className="panel settings-panel">
          <div className="panel-heading"><div><h2>Employee ID format</h2><p>Assigned once, after approval, using the approval year and a shared sequence.</p></div><Fingerprint size={18} /></div>
          <div className="format-preview"><small>Generated format</small><strong>MM-YYYY-0001</strong><small>Example: MM-2026-0001</small></div>
        </section>
        <section className="panel settings-panel">
          <div className="panel-heading"><div><h2>Email delivery</h2><p>Secrets stay in the server environment and are never exposed to the browser.</p></div><Bell size={18} /></div>
          <div className="config-status">
            <div><span className={`status-dot ${emailConfigured ? "dot-enabled" : ""}`} /><strong>{emailConfigured ? "SMTP configured" : "SMTP not configured"}</strong><small>{emailConfigured ? `${pendingEmails} queued · ${failedEmails} failed` : "Configure SMTP_HOST, SMTP_FROM, and matching SMTP credentials to send email verification codes and application confirmations."}</small></div>
            <div><span className={`status-dot ${ceoNotificationConfigured ? "dot-enabled" : ""}`} /><strong>{ceoNotificationConfigured ? "CEO email configured" : "CEO email not configured"}</strong><small>Set CEO_NOTIFICATION_EMAIL to receive new application email alerts.</small></div>
          </div>
          <p className="settings-footnote">Email verification codes and application messages use the configured server-side SMTP service. A queued message is not guaranteed to reach the inbox.</p>
        </section>
        <div className="settings-submit"><span>Working hours and attendance reminders follow the configured company policy.</span><Button disabled={busy}>{busy ? "Saving…" : "Save settings"}</Button></div>
      </form>
    </div>
  );
}

function AuditPage({ notify }: { notify: (message: string, kind?: "success" | "error") => void }) {
  const [rows, setRows] = useState<Array<{ action: string; entityType: string; entityId: string; createdAt: string; actor: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    api<typeof rows>("/api/audit").then(setRows).catch((error) => notify(error instanceof Error ? error.message : "Could not load audit history.", "error")).finally(() => setLoading(false));
  }, [notify]);
  return <div className="page-content"><PageHeader title="Audit log" subtitle="A recent history of sensitive account and workflow changes." /><section className="panel table-panel">{loading ? <LoadingState /> : rows.length ? <div className="table-scroll"><table><thead><tr><th>Action</th><th>Entity</th><th>Record</th><th>Actor</th><th>Time</th></tr></thead><tbody>{rows.map((row, index) => <tr key={`${row.action}-${index}`}><td><span className="audit-action">{row.action}</span></td><td>{row.entityType}</td><td>{row.entityId}</td><td>{row.actor || "System"}</td><td>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.createdAt))}</td></tr>)}</tbody></table></div> : <EmptyState title="No audit events yet" detail="Sensitive operations will be recorded here." />}</section></div>;
}

function NotificationsPanel({ onClose, notify }: { onClose: () => void; notify: (message: string, kind?: "success" | "error") => void }) {
  const [items, setItems] = useState<Array<{ id: number; title: string; message: string; readAt: string | null; createdAt: string }>>([]);
  useEffect(() => { api<typeof items>("/api/notifications").then(setItems).catch((error) => notify(error instanceof Error ? error.message : "Could not load notifications.", "error")); }, [notify]);
  async function markRead(id: number) {
    try {
      await api("/api/notifications/read", { method: "POST", body: JSON.stringify({ id }) });
      setItems((current) => current.map((item) => item.id === id ? { ...item, readAt: new Date().toISOString() } : item));
    } catch (error) { notify(error instanceof Error ? error.message : "Unable to mark notification read.", "error"); }
  }
  return <div className="notification-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="notification-panel" aria-label="Notifications"><div className="notification-heading"><div><h2>Notifications</h2><p>Updates for your account</p></div><button className="icon-button" onClick={onClose} aria-label="Close notifications"><X size={18} /></button></div>{items.length ? <div className="notification-list">{items.map((item) => <button key={item.id} className={`notification-item ${item.readAt ? "" : "notification-unread"}`} onClick={() => void markRead(item.id)}><span className="notification-dot" /><span><strong>{item.title}</strong><small>{item.message}</small><time>{new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.createdAt))}</time></span></button>)}</div> : <EmptyState title="You're all caught up" detail="New portal updates will appear here." icon={<Bell size={21} />} />}</aside></div>;
}

function WorkspacePanel({ title, description, onClose, children }: { title: string; description: string; onClose: () => void; children: ReactNode }) {
  return <div className="notification-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="notification-panel workspace-panel" aria-label={title}><div className="notification-heading"><div><h2>{title}</h2><p>{description}</p></div><button className="icon-button" onClick={onClose} aria-label={`Close ${title}`}><X size={18} /></button></div><div className="workspace-panel-content">{children}</div></aside></div>;
}

function AccountPanel({ user, onClose }: { user: User; onClose: () => void }) {
  return <WorkspacePanel title="My account" description="Your MetaMinds workspace profile" onClose={onClose}><div className="account-profile"><UserAvatar user={user} className="topbar-avatar" /><div><strong>{user.name}</strong><small>{user.role.replace("_", " ")}</small></div></div><dl className="account-details"><div><dt>Email</dt><dd>{user.email}</dd></div><div><dt>Employee ID</dt><dd>{user.employeeId ?? "Assigned after approval"}</dd></div><div><dt>Position</dt><dd>{user.position || "Not specified"}</dd></div><div><dt>Department</dt><dd>{user.department || "Not specified"}</dd></div></dl><p className="workspace-panel-note">For profile or access changes, contact your workspace administrator.</p></WorkspacePanel>;
}

function HelpPanel({ onClose }: { onClose: () => void }) {
  return <WorkspacePanel title="Help Center" description="Quick guidance for your people workspace" onClose={onClose}><div className="help-topic"><strong>Attendance</strong><p>Use the Attendance page to review check-ins and check-outs recorded by the portal.</p></div><div className="help-topic"><strong>Leave requests</strong><p>Submit a request from Leave and follow its status there. Team leads can review requests assigned to their team.</p></div><div className="help-topic"><strong>Account access</strong><p>Use Forgot password on the sign-in screen if email delivery is configured. Otherwise, ask your workspace administrator for help.</p></div><p className="workspace-panel-note">For urgent access or data corrections, contact your MetaMinds workspace administrator.</p></WorkspacePanel>;
}

function EmailStatusPanel({ onClose, notify }: { onClose: () => void; notify: (message: string, kind?: "success" | "error") => void }) {
  const [status, setStatus] = useState<{ emailConfigured: boolean } | null>(null);
  useEffect(() => { api<{ emailConfigured: boolean }>("/api/health").then(setStatus).catch((error) => notify(error instanceof Error ? error.message : "Could not load delivery status.", "error")); }, [notify]);
  return <WorkspacePanel title="Messages" description="Email verification and notification delivery" onClose={onClose}>{status ? <><div className="delivery-status-row"><span>Email service</span><strong className={status.emailConfigured ? "delivery-ready" : "delivery-unavailable"}>{status.emailConfigured ? "Configured" : "Not configured"}</strong></div><p className="workspace-panel-note">{status.emailConfigured ? "Email messages are submitted to the configured mail service; queueing does not guarantee inbox delivery." : "Email verification is unavailable until an administrator configures SMTP in the server environment. The portal does not expose or store mail credentials in this page."}</p></> : <LoadingState />}</WorkspacePanel>;
}

function LoadingState() {
  return <div className="loading-state" aria-label="Loading"><span /><span /><span /></div>;
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [publicPage, setPublicPage] = useState<"login" | "register">("login");
  const [applicationReference, setApplicationReference] = useState("");
  const [applicationEmailQueued, setApplicationEmailQueued] = useState(false);
  const [referenceCopyMessage, setReferenceCopyMessage] = useState("");
  const [activationComplete, setActivationComplete] = useState(false);
  const [resetMode, setResetMode] = useState(false);
  const [resetComplete, setResetComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<{ text: string; kind: "success" | "error" } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [messagesOpen, setMessagesOpen] = useState(false);
  const activationToken = useMemo(() => new URLSearchParams(window.location.search).get("activate") || "", []);
  const resetToken = useMemo(() => new URLSearchParams(window.location.search).get("reset") || "", []);
  const notify = useCallback((message: string, kind: "success" | "error" = "success") => {
    setToast({ text: message, kind });
    window.setTimeout(() => setToast(null), 4200);
  }, []);
  useEffect(() => {
    if (!referenceCopyMessage) return;
    const timer = window.setTimeout(() => setReferenceCopyMessage(""), 2800);
    return () => window.clearTimeout(timer);
  }, [referenceCopyMessage]);
  async function copyApplicationReference() {
    try {
      await navigator.clipboard.writeText(applicationReference);
      setReferenceCopyMessage("Reference copied to clipboard.");
    } catch {
      setReferenceCopyMessage("Copy was blocked. Select the reference number and copy it.");
    }
  }
  useEffect(() => {
    api<{ user: User | null; csrfToken: string }>("/api/auth/me").then((result) => {
      setUser(result.user);
      setLoading(false);
    }).catch((caught) => {
      setError(caught instanceof Error ? caught.message : "Portal could not be reached.");
      setLoading(false);
    });
  }, []);
  async function demoLogin(role: "ceo") {
    try {
      const result = await api<{ user: User; csrfToken: string }>("/api/auth/demo-login", { method: "POST", body: JSON.stringify({ role }) });
      setUser(result.user);
      setSection("overview");
      notify("Signed in as CEO (Executive Portal)");
    } catch {
      const identifier = "demo.ceo@metaminds.local";
      const result = await api<{ user: User; csrfToken: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ identifier, password: "Demo@Password123" }),
      });
      setUser(result.user);
      setSection("overview");
      notify("Signed in as CEO (Executive Portal)");
    }
  }
  async function login(identifier: string, password: string) {
    const result = await api<{ user: User; csrfToken: string }>("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier, password }) });
    setUser(result.user);
    setSection("overview");
  }
  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
      setUser(null);
      setPublicPage("login");
      const session = await api<{ csrfToken: string }>("/api/auth/me");
      if (!session.csrfToken) throw new Error("A new sign-in session could not be prepared. Refresh the page and try again.");
      notify("You have signed out.");
    } catch (caught) { notify(caught instanceof Error ? caught.message : "Unable to sign out.", "error"); }
  }
  if (loading) return <div className="launch-loading"><BrandMark /><LoadingState /></div>;
  if (activationToken && !activationComplete) return <Activate token={activationToken} onDone={() => setActivationComplete(true)} />;
  if (resetToken && !resetComplete) return <PasswordReset token={resetToken} onDone={() => { setResetComplete(true); void api<{ user: User | null }>("/api/auth/me").then((result) => setUser(result.user)); }} onBack={() => { setResetComplete(true); void api<{ user: User | null }>("/api/auth/me").then((result) => setUser(result.user)); }} />;
  if (applicationReference) return <main className="success-shell"><section className="success-card"><span className="success-icon"><Check size={27} /></span><p className="eyebrow">APPLICATION SUBMITTED</p><h1>Your details are with our team.</h1><p>Your application is pending review by the MetaMinds recruitment team. This confirmation is not an employment offer or a request to submit identity documents. We will email you after a decision is made.</p><div className="reference-box"><small>YOUR APPLICATION REFERENCE</small><strong>{applicationReference}</strong><Button variant="secondary" onClick={() => void copyApplicationReference()}><Copy size={15} /> Copy reference</Button>{referenceCopyMessage && <span className={`copy-feedback ${referenceCopyMessage.startsWith("Copy was") ? "copy-feedback-error" : ""}`} role="status">{referenceCopyMessage}</span>}</div><div className="submission-email-note"><Mail size={18} /><span>{applicationEmailQueued ? "A confirmation email with your application details has been queued to your verified email address. Please check your inbox and spam folder." : "We could not queue a confirmation email. Please keep your reference number and contact MetaMinds Pvt. Ltd. through its official channels."}</span></div><p className="success-note">Keep your reference number for future enquiries. Your account remains inactive until your application is approved.</p><Button variant="secondary" onClick={() => { setApplicationReference(""); setReferenceCopyMessage(""); setPublicPage("login"); }}>Return to sign in</Button></section></main>;
  if (!user) return publicPage === "register" ? <Register onBack={() => setPublicPage("login")} onSubmitted={(reference, emailQueued) => { setApplicationReference(reference); setApplicationEmailQueued(emailQueued); }} /> : resetMode ? <PasswordReset onDone={() => setResetMode(false)} onBack={() => setResetMode(false)} /> : <><Login onLogin={login} onDemoLogin={demoLogin} onRegister={() => setPublicPage("register")} onForgot={() => setResetMode(true)} />{error && <div className="toast toast-error" role="alert">{error}</div>}</>;
  return <div className="app-shell"><Sidebar user={user} section={section} onNavigate={setSection} onLogout={() => void logout()} onHelp={() => setHelpOpen(true)} onAccount={() => setAccountOpen(true)} open={menuOpen} onClose={() => setMenuOpen(false)} /><main className="main-area"><Topbar user={user} title={sectionTitles[section]} onMenu={() => setMenuOpen(true)} onNotifications={() => setNotificationsOpen(true)} onNavigate={setSection} onAccount={() => setAccountOpen(true)} onLogout={() => void logout()} />{section === "overview" && <Overview user={user} notify={notify} onNavigate={setSection} />}{section === "applications" && user.role === "ceo" && <ApplicationsPage notify={notify} />}{section === "employees" && <DirectoryPage user={user} notify={notify} />}{section === "attendance" && <AttendancePage user={user} notify={notify} />}{section === "leave" && <LeavePage user={user} notify={notify} />}{section === "payroll" && user.role === "ceo" && <PayrollPage notify={notify} />}{section === "settings" && user.role === "ceo" && <SettingsPage notify={notify} />}{section === "audit" && user.role === "ceo" && <AuditPage notify={notify} />}</main>{notificationsOpen && <NotificationsPanel onClose={() => setNotificationsOpen(false)} notify={notify} />}{messagesOpen && <EmailStatusPanel onClose={() => setMessagesOpen(false)} notify={notify} />}{helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}{accountOpen && <AccountPanel user={user} onClose={() => setAccountOpen(false)} />}{toast && <div className={`toast ${toast.kind === "error" ? "toast-error" : ""}`} role="status">{toast.kind === "error" ? <X size={17} /> : <Check size={17} />}{toast.text}</div>}</div>;
}
