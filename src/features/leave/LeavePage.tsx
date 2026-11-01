import { useCallback, useEffect, useState, type FormEvent } from "react";
import { CalendarDays, Check, CircleHelp, ShieldCheck, X } from "lucide-react";
import type { Leave, NotifyFn, User } from "../../types";
import { api, formatDate } from "../../services/api";
import { Button } from "../../components/ui/Button";
import { CustomDatePicker } from "../../components/ui/CustomDatePicker";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingState } from "../../components/ui/LoadingState";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";

export function calculateWorkingDaysClient(
  start: string,
  end: string,
  holidays: ReadonlySet<string> = new Set()
): number {
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
    const isHoliday = holidays.has(dateStr);
    if (!isSunday && !isSecondSat && !isHoliday) {
      count++;
    }
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}

export interface LeavePageProps {
  user: User;
  notify: NotifyFn;
}

export function LeavePage({ user, notify }: LeavePageProps) {
  const [rows, setRows] = useState<Leave[]>([]);
  const [types, setTypes] = useState<Array<{ id: number; name: string; paid: number }>>([]);
  const [leaveBalance, setLeaveBalance] = useState<{ entitled: number; used: number; remaining: number } | null>(
    null
  );
  const [companyHolidays, setCompanyHolidays] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ leaveTypeId: "", startDate: "", endDate: "", reason: "" });
  const [rejectId, setRejectId] = useState<number | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [leaveTypeName, setLeaveTypeName] = useState("");
  const [leaveTypePaid, setLeaveTypePaid] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [leaveRows, leaveTypes, balanceData, holidayData] = await Promise.all([
        api<Leave[]>("/api/leave"),
        api<typeof types>("/api/leave-types"),
        api<{ entitled: number; used: number; remaining: number }>("/api/leave/balance").catch(() => null),
        api<Array<{ id: number; holidayDate: string; name: string }>>("/api/company-holidays"),
      ]);
      setRows(leaveRows);
      setTypes(leaveTypes);
      setLeaveBalance(balanceData);
      setCompanyHolidays(new Set(holidayData.map((holiday) => holiday.holidayDate)));
      if (leaveTypes[0]) {
        setForm((current) =>
          current.leaveTypeId
            ? current
            : {
                ...current,
                leaveTypeId: String(
                  (leaveTypes.find((type) => !type.paid || balanceData !== null) || leaveTypes[0]).id
                ),
              }
        );
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not load leave requests.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void load();
  }, [load]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/leave", { method: "POST", body: JSON.stringify(form) });
      notify("Leave request submitted for review.");
      setForm((current) => ({ ...current, startDate: "", endDate: "", reason: "" }));
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Leave request could not be submitted.", "error");
    }
  }

  async function decide(
    id: number,
    decision: "approve" | "reject",
    payTreatment?: "full_paid" | "half_pay" | "unpaid"
  ) {
    try {
      const result = await api<{ payTreatment?: "full_paid" | "half_pay" | "unpaid" }>(
        `/api/leave/${id}/${decision}`,
        {
          method: "POST",
          body: JSON.stringify(decision === "reject" ? { reason: rejectReason } : { payTreatment }),
        }
      );
      const treatmentLabel =
        result.payTreatment === "unpaid"
          ? "unpaid leave"
          : result.payTreatment === "half_pay"
          ? "50% half pay"
          : "paid leave";
      notify(decision === "approve" ? `Leave request approved as ${treatmentLabel}.` : "Leave request rejected.");
      setRejectId(null);
      setRejectReason("");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to update leave request.", "error");
    }
  }

  async function addLeaveType(event: FormEvent) {
    event.preventDefault();
    try {
      await api("/api/leave-types", {
        method: "POST",
        body: JSON.stringify({ name: leaveTypeName, paid: leaveTypePaid }),
      });
      setLeaveTypeName("");
      notify("Leave type added.");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to add leave type.", "error");
    }
  }

  const canReview = user.role === "ceo" || user.role === "team_lead";
  const requestedWorkingDays =
    form.startDate && form.endDate ? calculateWorkingDaysClient(form.startDate, form.endDate, companyHolidays) : 0;
  const selectedLeaveType = types.find((type) => String(type.id) === form.leaveTypeId);
  const remainingQuota = leaveBalance?.remaining ?? 0;
  const isExcessRequest =
    selectedLeaveType?.paid === 1 && leaveBalance !== null && requestedWorkingDays > remainingQuota;
  const paidLeavePolicyMissing = selectedLeaveType?.paid === 1 && leaveBalance === null;
  const excessDaysCount = Math.max(0, requestedWorkingDays - remainingQuota);

  return (
    <div className="page-content">
      <PageHeader
        title="Leave management"
        subtitle="Pending leave is not approved leave. Paid leave requires an approved company entitlement; Sundays, second Saturdays and configured holidays are excluded from working-day counts."
        action={
          user.role === "employee" ? (
            <span className="count-chip">{rows.filter((row) => row.status === "pending").length} pending</span>
          ) : undefined
        }
      />

      {user.role === "employee" &&
        (leaveBalance ? (
          <div className="leave-quota-banner">
            <div className="quota-metric-card">
              <span className="quota-metric-label">Annual Paid Leaves</span>
              <strong className="quota-metric-val">{leaveBalance.entitled}</strong>
              <span className="quota-metric-sub">Configured company entitlement</span>
            </div>
            <div className="quota-metric-card">
              <span className="quota-metric-label">Paid Leaves Used</span>
              <strong className="quota-metric-val">{leaveBalance.used}</strong>
              <span className="quota-metric-sub">Approved this year</span>
            </div>
            <div className="quota-metric-card highlight-metric">
              <span className="quota-metric-label">Remaining Balance</span>
              <strong className="quota-metric-val">{leaveBalance.remaining}</strong>
              <span className="quota-metric-sub">
                {leaveBalance.remaining > 0 ? "Within configured entitlement" : "CEO review may be required"}
              </span>
            </div>
            <div className="quota-policy-card">
              <div className="quota-policy-header">
                <ShieldCheck size={16} />
                <strong>Company Work &amp; Leave Rules</strong>
              </div>
              <p>• <strong>8 hours/day</strong> standard workday · Monday–Saturday schedule</p>
              <p>• <strong>Second Saturdays</strong> and configured company holidays are non-working days</p>
              <p>
                • Requests beyond the configured paid-leave entitlement require CEO review; pay treatment is
                decided during review
              </p>
            </div>
          </div>
        ) : (
          <div className="notice notice-warning">
            <CircleHelp size={17} />
            <span>
              Annual paid-leave entitlement has not been configured by the company. Paid leave requests are
              temporarily unavailable; unpaid leave requests remain available.
            </span>
          </div>
        ))}

      {user.role === "ceo" && (
        <form className="panel leave-type-form" onSubmit={addLeaveType}>
          <div>
            <h2>Company leave types</h2>
            <p>Configure leave categories for employee request selection.</p>
          </div>
          <input
            required
            maxLength={80}
            minLength={2}
            placeholder="e.g. Annual leave"
            value={leaveTypeName}
            onChange={(event) => setLeaveTypeName(event.target.value)}
          />
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={leaveTypePaid}
              onChange={(event) => setLeaveTypePaid(event.target.checked)}
            />{" "}
            Paid leave
          </label>
          <Button type="submit">Add leave type</Button>
        </form>
      )}

      {user.role === "employee" && (
        <section className="panel leave-apply-panel">
          <div className="panel-heading">
            <div>
              <h2>Request time off</h2>
              <p>Working days automatically exclude Sundays, second Saturdays and the company holiday calendar.</p>
            </div>
            <CalendarDays size={18} />
          </div>
          {types.length ? (
            <form className="leave-form" onSubmit={submit}>
              <label>
                Leave type
                <select
                  required
                  value={form.leaveTypeId}
                  onChange={(event) => setForm({ ...form, leaveTypeId: event.target.value })}
                >
                  <option value="">Select a type</option>
                  {types.map((type) => (
                    <option key={type.id} value={type.id} disabled={Boolean(type.paid && !leaveBalance)}>
                      {type.name}
                      {type.paid ? " · paid" : " · unpaid"}
                    </option>
                  ))}
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
                  📅 <strong>{requestedWorkingDays} working day(s)</strong> (excludes Sundays, 2nd Saturdays &amp;
                  configured company holidays)
                </div>
              )}

              {paidLeavePolicyMissing && (
                <div className="notice notice-warning">
                  <CircleHelp size={17} />
                  <span>
                    Paid leave cannot be submitted until the company configures its approved annual entitlement.
                    Select an unpaid leave type to continue.
                  </span>
                </div>
              )}
              {isExcessRequest && (
                <div className="notice notice-warning excess-leave-alert">
                  <ShieldCheck size={18} />
                  <div>
                    <strong>Additional paid leave requires CEO approval</strong>
                    <p>
                      This request of <strong>{requestedWorkingDays} working day(s)</strong> exceeds the
                      remaining configured entitlement of <strong>{remainingQuota} day(s)</strong> by{" "}
                      <strong>{excessDaysCount} day(s)</strong>. The CEO will decide the applicable pay
                      treatment during review.
                    </p>
                  </div>
                </div>
              )}

              <label className="full-width">
                Reason
                <textarea
                  required
                  minLength={3}
                  maxLength={1000}
                  rows={3}
                  value={form.reason}
                  onChange={(event) => setForm({ ...form, reason: event.target.value })}
                />
              </label>
              <div className="full-width form-actions">
                <Button type="submit" disabled={Boolean(paidLeavePolicyMissing)}>
                  <CalendarDays size={16} /> Submit request
                </Button>
              </div>
            </form>
          ) : (
            <div className="notice notice-warning">
              <CircleHelp size={17} />
              <span>
                Leave types have not been configured. Your administrator must confirm and add the company leave
                policy first.
              </span>
            </div>
          )}
        </section>
      )}

      {loading ? (
        <LoadingState />
      ) : rows.length ? (
        <section className="panel table-panel">
          <div className="panel-heading panel-heading-padded">
            <div>
              <h2>Request history</h2>
              <p>{rows.length} request(s) · Paid leave treatment follows the configured company policy</p>
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
                    {user.role !== "employee" && (
                      <td>
                        {row.name}
                        <small className="table-sub">{row.employeeId}</small>
                      </td>
                    )}
                    <td>{row.leaveType}</td>
                    <td>
                      {formatDate(row.startDate)} – {formatDate(row.endDate)}
                    </td>
                    <td>
                      <strong>
                        {row.workingDays ??
                          (row.startDate && row.endDate
                            ? calculateWorkingDaysClient(row.startDate, row.endDate, companyHolidays)
                            : "—")}
                      </strong>{" "}
                      <small className="table-sub">day(s)</small>
                    </td>
                    <td className="reason-cell">{row.reason}</td>
                    <td>
                      {row.status === "approved" ? (
                        row.payTreatment === "half_pay" ? (
                          <span className="treatment-badge badge-half">50% Half Pay</span>
                        ) : row.payTreatment === "unpaid" ? (
                          <span className="treatment-badge badge-ceo">Unpaid Leave</span>
                        ) : (
                          <span className="treatment-badge badge-full">100% Paid</span>
                        )
                      ) : row.requiresCeoApproval ? (
                        <span className="treatment-badge badge-ceo">Needs CEO Approval</span>
                      ) : (
                        <span className="muted-cell">Standard</span>
                      )}
                    </td>
                    <td>
                      <StatusPill status={row.status} />
                    </td>
                    {canReview && (
                      <td>
                        {row.status === "pending" &&
                          (user.role === "ceo" ? (
                            row.requiresCeoApproval || (row.excessDays && row.excessDays > 0) ? (
                              <div className="ceo-review-stack">
                                <Button
                                  variant="primary"
                                  onClick={() => void decide(row.id, "approve", "full_paid")}
                                  title="Approve 100% paid leave"
                                >
                                  <Check size={14} /> 100% Paid Leave
                                </Button>
                                <Button
                                  variant="secondary"
                                  onClick={() => void decide(row.id, "approve", "half_pay")}
                                  title="Approve at 50% half pay"
                                >
                                  <Check size={14} /> 50% Half Pay
                                </Button>
                                <Button
                                  variant="secondary"
                                  onClick={() => void decide(row.id, "approve", "unpaid")}
                                  title="Approve as unpaid leave"
                                >
                                  <Check size={14} /> Unpaid Leave
                                </Button>
                                <Button
                                  variant="danger"
                                  onClick={() => {
                                    setRejectId(row.id);
                                    setRejectReason("");
                                  }}
                                >
                                  <X size={14} /> Reject
                                </Button>
                              </div>
                            ) : (
                              <div className="row-actions">
                                <Button
                                  variant="quiet"
                                  onClick={() => void decide(row.id, "approve", "full_paid")}
                                >
                                  <Check size={14} /> Approve
                                </Button>
                                <Button
                                  variant="quiet"
                                  onClick={() => {
                                    setRejectId(row.id);
                                    setRejectReason("");
                                  }}
                                >
                                  <X size={14} /> Reject
                                </Button>
                              </div>
                            )
                          ) : row.requiresCeoApproval ? (
                            <span className="badge-warning-text">
                              Escalated to CEO (exceeds paid-leave entitlement)
                            </span>
                          ) : (
                            <div className="row-actions">
                              <Button
                                variant="quiet"
                                onClick={() => void decide(row.id, "approve", "full_paid")}
                              >
                                <Check size={14} /> Approve
                              </Button>
                              <Button
                                variant="quiet"
                                onClick={() => {
                                    setRejectId(row.id);
                                    setRejectReason("");
                                }}
                              >
                                <X size={14} /> Reject
                              </Button>
                            </div>
                          ))}
                        {rejectId === row.id && (
                          <form
                            className="reject-inline"
                            onSubmit={(event) => {
                              event.preventDefault();
                              void decide(row.id, "reject");
                            }}
                          >
                            <input
                              required
                              minLength={3}
                              maxLength={500}
                              placeholder="Reason for rejection"
                              value={rejectReason}
                              onChange={(event) => setRejectReason(event.target.value)}
                            />
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
        <EmptyState
          title="No leave requests"
          detail="Submitted requests and their decision history will appear here."
          icon={<CalendarDays size={22} />}
        />
      )}
    </div>
  );
}
