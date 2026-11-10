import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
  Check,
  Copy,
  CreditCard,
  FileCheck2,
  FileText,
  GraduationCap,
  IdCard,
  ShieldCheck,
  Sparkles,
  X,
  ZoomIn,
} from "lucide-react";
import type { Application, ApplicationDocumentType, NotifyFn } from "../../types";
import { api, formatDate } from "../../services/api";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingState } from "../../components/ui/LoadingState";
import { PageHeader } from "../../components/ui/PageHeader";
import { StatusPill } from "../../components/ui/StatusPill";
import { UserAvatar } from "../../components/ui/UserAvatar";

const DOC_LABELS: Array<{ key: ApplicationDocumentType; title: string; icon: ReactNode }> = [
  { key: "education10thDoc", title: "10th / SSC Certificate", icon: <GraduationCap size={15} /> },
  { key: "educationInterDoc", title: "Intermediate / 12th Certificate", icon: <GraduationCap size={15} /> },
  { key: "educationHigherDoc", title: "UG / Higher Education Certificate", icon: <GraduationCap size={15} /> },
  { key: "panFront", title: "PAN Card (Front)", icon: <CreditCard size={15} /> },
  { key: "panBack", title: "PAN Card (Back)", icon: <CreditCard size={15} /> },
  { key: "aadharFront", title: "Aadhaar Card (Front)", icon: <IdCard size={15} /> },
  { key: "aadharBack", title: "Aadhaar Card (Back)", icon: <IdCard size={15} /> },
];

type DecryptedDoc = {
  title: string;
  originalName: string;
  mimeType: string;
  dataUrl: string;
  previewUrl: string;
  isBlob: boolean;
};

function toPdfPreviewUrl(dataUrl: string): { previewUrl: string; isBlob: boolean } {
  try {
    const [, base64 = ""] = dataUrl.split(",");
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" });
    return { previewUrl: URL.createObjectURL(blob), isBlob: true };
  } catch {
    return { previewUrl: dataUrl, isBlob: false };
  }
}

export interface ApplicationsPageProps {
  notify: NotifyFn;
}

export function ApplicationsPage({ notify }: ApplicationsPageProps) {
  const [rows, setRows] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("pending");
  const [selected, setSelected] = useState<Application | null>(null);
  const [inspectingDoc, setInspectingDoc] = useState<DecryptedDoc | null>(null);
  const [loadingDocType, setLoadingDocType] = useState<ApplicationDocumentType | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const closeInspector = useCallback(() => {
    setInspectingDoc((current) => {
      if (current?.isBlob) URL.revokeObjectURL(current.previewUrl);
      return null;
    });
  }, []);

  useEffect(() => () => {
    if (inspectingDoc?.isBlob) URL.revokeObjectURL(inspectingDoc.previewUrl);
  }, [inspectingDoc]);

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

  async function viewDocument(docType: ApplicationDocumentType, title: string) {
    if (!selected) return;
    setLoadingDocType(docType);
    try {
      const result = await api<{
        originalName: string;
        mimeType: string;
        dataUrl: string;
      }>(`/api/applications/${selected.id}/documents/${docType}`);
      const preview = result.mimeType === "application/pdf"
        ? toPdfPreviewUrl(result.dataUrl)
        : { previewUrl: result.dataUrl, isBlob: false };
      setInspectingDoc((current) => {
        if (current?.isBlob) URL.revokeObjectURL(current.previewUrl);
        return {
          title,
          originalName: result.originalName,
          mimeType: result.mimeType,
          dataUrl: result.dataUrl,
          ...preview,
        };
      });
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to decrypt the document.", "error");
    } finally {
      setLoadingDocType(null);
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
            if (event.target === event.currentTarget) {
              closeInspector();
              setSelected(null);
            }
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
              <button className="icon-button" onClick={() => { closeInspector(); setSelected(null); }} aria-label="Close">
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

            <div className="kyc-section modal-detail-wide">
              <div className="kyc-section-header">
                <h3>Encrypted Educational &amp; KYC Certificates</h3>
                <span className="kyc-badge">
                  {DOC_LABELS.filter((item) => selected.documents?.some((d) => d.docType === item.key)).length} / 7 Attached
                </span>
              </div>
              <div className="kyc-docs-grid">
                {DOC_LABELS.map((item) => {
                  const meta = selected.documents?.find((d) => d.docType === item.key);
                  return (
                    <div key={item.key} className={`kyc-doc-card ${meta ? "kyc-doc-ready" : "kyc-doc-empty"}`}>
                      <div className="kyc-doc-top">
                        <span className="kyc-doc-icon" aria-hidden="true">{item.icon}</span>
                        <strong className="kyc-doc-name">{item.title}</strong>
                        {meta ? (
                          <span className="doc-chip-ready"><Check size={12} aria-hidden="true" /> Encrypted</span>
                        ) : (
                          <span className="doc-chip-missing">Missing</span>
                        )}
                      </div>
                      {meta ? (
                        <div className="kyc-doc-action-row">
                          <div className="kyc-doc-pdf-chip">
                            <FileText size={18} aria-hidden="true" />
                            <span>{Math.max(1, Math.ceil(meta.sizeBytes / 1024))} KB</span>
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: "12px", color: "#334155", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {meta.originalName}
                            </div>
                          </div>
                          <Button
                            type="button"
                            variant="secondary"
                            className="kyc-inspect-btn"
                            disabled={loadingDocType === item.key}
                            onClick={() => void viewDocument(item.key, item.title)}
                          >
                            <ZoomIn size={14} aria-hidden="true" />
                            {loadingDocType === item.key ? "Decrypting…" : "View"}
                          </Button>
                        </div>
                      ) : (
                        <p className="kyc-doc-none">No file submitted for this requirement.</p>
                      )}
                    </div>
                  );
                })}
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

      {inspectingDoc && (
        <div
          className="modal-backdrop inspector-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeInspector();
          }}
        >
          <div className="doc-inspector-card" role="dialog" aria-modal="true" aria-labelledby="doc-inspector-title">
            <div className="doc-inspector-header">
              <div>
                <p className="eyebrow">ENCRYPTED KYC DOCUMENT VIEWER</p>
                <h3 id="doc-inspector-title">{inspectingDoc.title}</h3>
                <p>{selected?.name} · {inspectingDoc.originalName}</p>
              </div>
              <button className="icon-button" onClick={closeInspector} aria-label="Close document viewer">
                <X size={20} />
              </button>
            </div>
            <div className="doc-inspector-content">
              {inspectingDoc.mimeType.startsWith("image/") ? (
                <img src={inspectingDoc.previewUrl} alt={inspectingDoc.title} className="doc-inspector-img" />
              ) : (
                <iframe src={inspectingDoc.previewUrl} title={inspectingDoc.title} className="doc-inspector-frame" />
              )}
            </div>
            <div className="doc-inspector-footer">
              <a
                href={inspectingDoc.dataUrl}
                download={inspectingDoc.originalName}
                className="button button-secondary"
              >
                Download Document
              </a>
              <Button onClick={closeInspector}>Close Viewer</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
