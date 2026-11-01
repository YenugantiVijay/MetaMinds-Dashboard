import { useState, useEffect } from "react";
import { Check, Copy, Mail, X } from "lucide-react";
import { api } from "../../services/api";
import { Button } from "../../components/ui";

export interface ApplicationSubmittedScreenProps {
  submission: {
    reference: string;
    email: string;
    fullName: string;
    position: string;
    emailQueued: boolean;
  };
  onProceedToLogin: (employeeId?: string) => void;
}

export function ApplicationSubmittedScreen({
  submission,
  onProceedToLogin,
}: ApplicationSubmittedScreenProps) {
  const [status, setStatus] = useState<"pending" | "approved" | "rejected">("pending");
  const [approvedEmployeeId, setApprovedEmployeeId] = useState("");
  const [rejectionReason, setRejectionReason] = useState("");
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchStatus = async () => {
      try {
        const res = await api<{
          status: "pending" | "approved" | "rejected";
          employeeId: string | null;
          rejectionReason: string | null;
        }>(`/api/applications/status?reference=${encodeURIComponent(submission.reference)}`);
        if (!active) return;
        if (res.status === "approved" && res.employeeId) {
          setStatus("approved");
          setApprovedEmployeeId(res.employeeId);
        } else if (res.status === "rejected") {
          setStatus("rejected");
          setRejectionReason(res.rejectionReason || "Application could not be approved at this time.");
        }
      } catch {
        // network or polling errors are silently ignored
      }
    };

    void fetchStatus();
    const interval = setInterval(() => {
      if (status === "pending") {
        void fetchStatus();
      }
    }, 3500);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [submission.reference, status]);

  async function manualCheck() {
    setChecking(true);
    try {
      const res = await api<{
        status: "pending" | "approved" | "rejected";
        employeeId: string | null;
        rejectionReason: string | null;
      }>(`/api/applications/status?reference=${encodeURIComponent(submission.reference)}`);
      if (res.status === "approved" && res.employeeId) {
        setStatus("approved");
        setApprovedEmployeeId(res.employeeId);
      } else if (res.status === "rejected") {
        setStatus("rejected");
        setRejectionReason(res.rejectionReason || "Application could not be approved at this time.");
      }
    } catch {
      // ignore
    } finally {
      setTimeout(() => setChecking(false), 500);
    }
  }

  async function copyId() {
    if (!approvedEmployeeId) return;
    try {
      await navigator.clipboard.writeText(approvedEmployeeId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  }

  if (status === "approved") {
    return (
      <main className="success-shell">
        <section className="success-card">
          <span className="success-icon success-icon-approved">
            <Check size={28} />
          </span>
          <p className="eyebrow" style={{ color: "#059669" }}>ACCOUNT APPROVED BY CEO</p>
          <h1>Welcome to MetaMinds!</h1>
          <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: "10px 0 16px" }}>
            Your employee account has been reviewed and approved by the CEO! Your official Employee ID is displayed below and has also been sent directly to your registered email address (<strong>{submission.email}</strong>).
          </p>

          <div className="reference-box" style={{ background: "#f0fdf4", borderColor: "#86efac" }}>
            <small style={{ color: "#166534" }}>YOUR OFFICIAL EMPLOYEE ID</small>
            <strong style={{ color: "#15803d", fontSize: "22px", letterSpacing: "1.5px" }}>{approvedEmployeeId}</strong>
            <Button variant="secondary" onClick={() => void copyId()}>
              <Copy size={15} /> {copied ? "Copied to clipboard!" : "Copy Employee ID"}
            </Button>
          </div>

          <div className="submission-email-note" style={{ background: "#ecfdf5", borderColor: "#a7f3d0", color: "#065f46" }}>
            <Mail size={18} />
            <span>Your Employee ID has also been delivered to <strong>{submission.email}</strong>. Use this ID or your email along with your password to sign in.</span>
          </div>

          <Button
            variant="primary"
            style={{ width: "100%", marginTop: "18px", padding: "12px", fontSize: "14px", fontWeight: 700 }}
            onClick={() => onProceedToLogin(approvedEmployeeId)}
          >
            Proceed to Sign In
          </Button>
        </section>
      </main>
    );
  }

  if (status === "rejected") {
    return (
      <main className="success-shell">
        <section className="success-card">
          <span className="success-icon" style={{ background: "#fef2f2", color: "#dc2626" }}>
            <X size={28} />
          </span>
          <p className="eyebrow" style={{ color: "#dc2626" }}>ACCOUNT REGISTRATION UPDATE</p>
          <h1>Registration Not Approved</h1>
          <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: "10px 0 16px" }}>
            {rejectionReason || "Your application was reviewed and could not be approved at this time."}
          </p>
          <Button variant="secondary" style={{ width: "100%", marginTop: "16px" }} onClick={() => onProceedToLogin()}>
            Return to Sign In
          </Button>
        </section>
      </main>
    );
  }

  // Pending approval state
  return (
    <main className="success-shell">
      <section className="success-card">
        <span className="success-icon">
          <Check size={28} />
        </span>
        <p className="eyebrow">APPLICATION SUBMITTED · PENDING CEO APPROVAL</p>
        <h1>Employee Account Created Successfully!</h1>
        <p style={{ fontSize: "13px", color: "#475569", lineHeight: 1.6, margin: "10px 0 14px" }}>
          Your employee account for <strong>{submission.position || "your position"}</strong> has been created and submitted for executive review.
        </p>

        <div className="status-live-pill">
          <span className="pulse-dot" />
          <span>Awaiting CEO Approval</span>
        </div>

        <div className="status-info-box">
          <div className="status-info-row">
            <span>Position / Role</span>
            <strong>{submission.position}</strong>
          </div>
          <div className="status-info-row">
            <span>Registered Email</span>
            <strong>{submission.email}</strong>
          </div>
          <div className="status-info-row">
            <span>Official Employee ID</span>
            <em style={{ color: "#2563eb", fontWeight: 600, fontStyle: "normal" }}>The employee id will be sent to the email directly</em>
          </div>
        </div>

        <div className="submission-email-note">
          <Mail size={18} />
          <span>The employee id will be sent to the email directly once your account is approved by the CEO.</span>
        </div>

        <p className="success-note" style={{ margin: "14px 0 18px", color: "#64748b", fontSize: "12px", lineHeight: 1.5 }}>
          You do not need to refresh. As soon as the CEO approves your account, your Employee ID will be sent to your email and will appear right here automatically.
        </p>

        <div style={{ display: "flex", gap: "10px", justifyContent: "center" }}>
          <Button variant="secondary" onClick={() => void manualCheck()} disabled={checking}>
            {checking ? "Checking…" : "Check Approval Status"}
          </Button>
          <Button variant="secondary" onClick={() => onProceedToLogin()}>
            Return to Sign In
          </Button>
        </div>
      </section>
    </main>
  );
}
