import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  FileCheck2,
  ShieldCheck,
  Sparkles,
  X,
} from "lucide-react";
import type { Application, NotifyFn } from "../../types";
import { api, formatDate } from "../../services/api";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingState } from "../../components/ui/LoadingState";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { UserAvatar } from "../../components/ui/UserAvatar";

export interface ApplicationsPageProps {
  notify: NotifyFn;
}

export function ApplicationsPage({ notify }: ApplicationsPageProps) {
  const [rows, setRows] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [selected, setSelected] = useState<Application | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api<Application[]>(`/api/applications?status=${filter}`)
      .then((data) => {
        if (!cancelled) {
          setRows(data);
          setLoading(false);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          notify(error instanceof Error ? error.message : "Could not load applications.", "error");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [filter, notify]);

  const reload = useCallback(async () => {
    try {
      const data = await api<Application[]>(`/api/applications?status=${filter}`);
      setRows(data);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not load applications.", "error");
    }
  }, [filter, notify]);

  const filteredRows = useMemo(() => {
    return rows.filter((row) => (row.status || "").toLowerCase() === filter.toLowerCase());
  }, [rows, filter]);

  async function decide(decision: "approve" | "reject") {
    if (!selected) return;
    setBusy(true);
    try {
      if (decision === "approve") {
        const result = await api<{ employeeId: string; emailQueued: boolean; activationUrl?: string }>(
          `/api/applications/${selected.id}/approve`,
          { method: "POST", body: JSON.stringify({}) }
        );
        setSelected({
          ...selected,
          status: "approved",
          employeeId: result.employeeId,
          activationUrl: result.activationUrl,
        });
        notify(
          result.emailQueued
            ? `Application approved. Employee ID: ${result.employeeId}. Approval email queued.`
            : `Application approved. Employee ID: ${result.employeeId}. SMTP is unavailable; applicant was not emailed.`
        );
      } else {
        const result = await api<{ emailQueued: boolean }>(
          `/api/applications/${selected.id}/reject`,
          { method: "POST", body: JSON.stringify({ reason }) }
        );
        setSelected({ ...selected, status: "rejected", rejectionReason: reason });
        notify(
          result.emailQueued
            ? "Application rejected. Notification email queued."
            : "Application rejected. SMTP is unavailable, so no notification email was sent."
        );
      }
      setReason("");
      await reload();
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

  return (
    <div className="page-content">
      <PageHeader
        title="Employee Applications"
        subtitle="Review onboarding submissions and approve employee credentials. Identity documents are not collected in the public application."
        action={
          <span className="count-chip">
            {filteredRows.length} {filter}
          </span>
        }
      />
      <div className="filter-bar">
        <div className="segmented">
          {["pending", "approved", "rejected"].map((status) => (
            <button
              className={filter === status ? "segment-active" : ""}
              onClick={() => {
                setFilter(status);
                setSelected(null);
              }}
              key={status}
            >
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
        ) : filteredRows.length ? (
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
                {filteredRows.map((row) => (
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
                    <td>
                      <span className="category-tag">
                        {row.employmentType === "intern" ? "Internship" : "Employee"}
                      </span>
                    </td>
                    <td>
                      <strong>{row.position}</strong>
                      <small className="table-sub">{row.department || "General Department"}</small>
                    </td>
                    <td>
                      <span className="salary-pill-chip">
                        {row.discussedSalary
                          ? row.discussedSalary.startsWith("₹")
                            ? row.discussedSalary
                            : `₹${row.discussedSalary}`
                          : "—"}
                      </span>
                    </td>
                    <td>{row.phone || "—"}</td>
                    <td>{formatDate(row.proposedJoiningDate)}</td>
                    <td>{formatDate(row.createdAt)}</td>
                    <td>
                      <StatusPill status={row.status} />
                    </td>
                    <td>
                      <button
                        className="icon-button table-open"
                        onClick={() => setSelected(row)}
                        aria-label={`Open application for ${row.name}`}
                      >
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
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <section
            className="modal-card modal-card-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="application-modal-title"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">APPLICATION REF · {selected.reference}</p>
                <h2 id="application-modal-title">{selected.name}</h2>
                <p>
                  {selected.position} ·{" "}
                  {selected.employmentType === "intern" ? "Internship" : "Full-Time Employee"}
                </p>
              </div>
              <button className="icon-button" onClick={() => setSelected(null)} aria-label="Close">
                <X size={19} />
              </button>
            </div>

            {selected.photoUrl && (
              <div className="modal-photo-preview">
                <div className="modal-photo-card">
                  <img src={selected.photoUrl} alt={selected.name} className="modal-applicant-img" />
                </div>
                <div className="modal-photo-meta">
                  <span className="modal-photo-badge">Official Applicant Photograph</span>
                  <p className="modal-photo-desc">
                    Passport-style headshot submitted during onboarding for official identification and team
                    profile.
                  </p>
                </div>
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
                  <p>
                    This amount is recorded as interview context only. No salary structure is generated until
                    compensation terms and applicable policies are approved and configured.
                  </p>
                </div>
              </div>
            </div>

            {selected.activationUrl && (
              <div className="notice notice-warning">
                <ShieldCheck size={17} />
                <span>
                  Email is unavailable. Copy this one-time activation link and share it with the applicant using
                  a secure channel. It expires in 24 hours.
                </span>
                <Button variant="secondary" onClick={() => void copyActivationLink()}>
                  <Copy size={15} /> Copy activation link
                </Button>
              </div>
            )}

            {selected.status === "pending" && (
              <div className="modal-footer">
                <label className="full-width">
                  <span>If rejecting, record a reason</span>
                  <textarea
                    rows={2}
                    maxLength={500}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Provide feedback to the applicant..."
                  />
                </label>
                <Button
                  variant="danger"
                  disabled={busy || reason.trim().length < 3}
                  onClick={() => void decide("reject")}
                >
                  Reject Application
                </Button>
                <Button disabled={busy} onClick={() => void decide("approve")}>
                  <Check size={16} /> Approve &amp; Provision Employee ID
                </Button>
              </div>
            )}

            {selected.status !== "pending" && selected.rejectionReason && (
              <div className="notice notice-warning">CEO review rejection note: {selected.rejectionReason}</div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
