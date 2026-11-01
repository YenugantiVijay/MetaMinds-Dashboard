import { useState, useEffect, type FormEvent } from "react";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { api } from "../../services/api";
import { BrandMark, Button } from "../../components/ui";
import { AuthAside, AuthShellBackgroundIcons } from "../../components/layout";

export interface PasswordResetProps {
  token?: string;
  onDone: () => void;
  onBack: () => void;
}

export function PasswordReset({ token, onDone, onBack }: PasswordResetProps) {
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

  return (
    <main className="auth-shell">
      <AuthShellBackgroundIcons />
      <div className="auth-container">
        <AuthAside />
        <section className="auth-card">
          <div className="card-ambient-glow" aria-hidden="true" />
          <div className="auth-card-inner">
            <BrandMark />
            <p className="eyebrow">ACCOUNT RECOVERY</p>
            <h1>{token ? "Choose a new password" : "Reset your password"}</h1>
            <p className="auth-lead">
              {token
                ? "Use a strong password you have not used before."
                : "Enter the work email on your approved account. A one-time reset link is sent by email; employee IDs and application references cannot be used here."}
            </p>
            {!token && emailStatus === "not-configured" && (
              <div className="notice notice-warning">
                <ShieldCheck size={17} />
                <span>Email delivery is not configured, so password reset links cannot be sent right now. Contact your administrator for help.</span>
              </div>
            )}
            {!token && emailStatus === "unavailable" && (
              <div className="notice notice-warning">
                <ShieldCheck size={17} />
                <span>Email delivery setup could not be checked. You can still submit a request, but contact your administrator if no reset email arrives.</span>
              </div>
            )}
            {message ? (
              <>
                <div className="notice notice-info">
                  <ShieldCheck size={17} />
                  <span>
                    {message} Check your inbox and spam folder for the one-time link. If no message arrives, check the address and contact your administrator; for your security, we cannot confirm whether an account exists.
                  </span>
                </div>
                {emailStatus === "not-configured" && (
                  <div className="notice notice-warning">
                    <ShieldCheck size={17} />
                    <span>No email could be sent until an administrator configures email delivery.</span>
                  </div>
                )}
              </>
            ) : (
              <form className="form-stack" noValidate onSubmit={submit}>
                {token ? (
                  <>
                    <label>
                      New password
                      <input
                        required
                        minLength={12}
                        maxLength={256}
                        type="password"
                        autoComplete="new-password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                      />
                      <small>Use at least 12 characters.</small>
                    </label>
                    <label>
                      Confirm password
                      <input
                        required
                        minLength={12}
                        maxLength={256}
                        type="password"
                        autoComplete="new-password"
                        value={confirm}
                        onChange={(event) => setConfirm(event.target.value)}
                      />
                    </label>
                  </>
                ) : (
                  <label>
                    Email
                    <input
                      required
                      maxLength={254}
                      type="email"
                      autoComplete="email"
                      aria-invalid={Boolean(error)}
                      aria-describedby={error ? "reset-email-error" : undefined}
                      value={email}
                      onChange={(event) => {
                        setEmail(event.target.value);
                        setError("");
                      }}
                    />
                  </label>
                )}
                {error && (
                  <p id={!token ? "reset-email-error" : undefined} className="form-error" role="alert">
                    {error}
                  </p>
                )}
                <Button disabled={busy}>
                  {busy ? "Please wait…" : token ? "Update password" : "Send reset link"}
                  <ArrowUpRight size={16} />
                </Button>
              </form>
            )}
            <button
              className="text-button reset-back"
              onClick={() => {
                if (token) window.history.replaceState({}, "", window.location.pathname);
                (message ? onDone : onBack)();
              }}
            >
              {message ? "Return to sign in" : "Back to sign in"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
