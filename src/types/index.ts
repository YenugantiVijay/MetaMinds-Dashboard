export type UserRole = "ceo" | "team_lead" | "employee";

export type EmploymentType = "employee" | "intern";

export type User = {
  id: number;
  email: string;
  role: UserRole;
  employeeId: string | null;
  name: string;
  employmentType: EmploymentType | null;
  position: string | null;
  department: string | null;
  photoUrl?: string | null;
};

export type Application = {
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
  status: string;
  rejectionReason?: string;
  createdAt: string;
  employeeId?: string | null;
  activationUrl?: string;
  photoUrl?: string | null;
};

export type CheckoutReason = "workday_complete" | "leaving_early" | "other";

export type DailyWorkReport = {
  id: number;
  employeeId: number;
  attendanceRecordId: number;
  workDate: string;
  workSummary: string;
  projectReference?: string | null;
  blockers?: string | null;
  submittedAt: string;
  updatedAt?: string | null;
  employeeName?: string;
  companyEmployeeId?: string;
  department?: string | null;
  workedMinutes?: number | null;
  checkoutReason?: CheckoutReason | null;
};

export type AttendanceSessionStatus = "active" | "on_break" | "completed";

export type Attendance = {
  id?: number;
  date: string;
  name?: string;
  employeeId?: string;
  checkIn: string;
  checkOut: string | null;
  workedMinutes: number | null;
  check_in?: string;
  check_out?: string | null;
  breakMinutes?: number;
  break_minutes?: number;
  status?: AttendanceSessionStatus;
  activeBreakStart?: string | null;
  checkoutReason?: CheckoutReason | null;
  checkout_reason?: CheckoutReason | null;
  checkoutNote?: string | null;
  checkout_note?: string | null;
  progress?: { percentage: number | null; complete: boolean; overtimeMinutes: number } | null;
  exceptionStatus?: string | null;
};

export type AttendanceDayPolicy = {
  date: string;
  isWorkingDay: boolean;
  reason: "working_day" | "sunday" | "second_saturday" | "company_holiday";
  holidayName?: string | null;
  message: string;
};

export type PayTreatment = "full_paid" | "half_pay" | "unpaid";

export type Leave = {
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
  payTreatment?: PayTreatment;
  requiresCeoApproval?: number;
  excessDays?: number;
  ceoDecisionNotes?: string;
  createdAt: string;
};

export type Dashboard = {
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
  attendanceTrend?: Array<{ date: string; present: number; averageMinutes: number | null; status?: string; checkIn?: string; checkOut?: string | null; breakMinutes?: number }>;
  attendanceReport?: Array<{ date: string; present: number; expected: number; approvedLeave: number; reviewRequired: number; attendancePercent: number | null; status?: string; workedMinutes?: number | null; holidayName?: string | null; breakMinutes?: number }>;
  departmentDistribution?: Array<{ name: string; count: number }>;
  recentApplications?: Array<{ reference: string; name: string; employmentType: string; status: string; createdAt: string }>;
  attendance?: Attendance | Attendance[] | null;
  attendanceDayPolicy?: AttendanceDayPolicy;
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

export type PolicyResponse = {
  timezone: string;
  today: string;
  attendanceDayPolicy?: AttendanceDayPolicy;
  expectedWorkingMinutes: number | null;
  scheduledStart: string;
  scheduledEnd: string;
  absenceWarningHours: number;
};

export type Section = "overview" | "applications" | "employees" | "attendance" | "leave" | "payroll" | "settings" | "audit";

export const sectionTitles: Record<Section, string> = {
  overview: "Overview",
  applications: "Applications",
  employees: "People directory",
  attendance: "Attendance",
  leave: "Leave management",
  payroll: "Payroll",
  settings: "Company settings",
  audit: "Audit log",
};

export type ApplicationSubmission = {
  reference: string;
  email: string;
  fullName: string;
  position: string;
  emailQueued: boolean;
};

export type Toast = {
  text: string;
  kind: "success" | "error";
};

export type NotifyFn = (message: string, kind?: "success" | "error") => void;
