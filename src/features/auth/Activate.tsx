import { useState, type FormEvent } from "react";
import { Check } from "lucide-react";
import { api } from "../../services/api";
import { BrandMark, Button } from "../../components/ui";
import { AuthAside, AuthShellBackgroundIcons } from "../../components/layout";

export interface ActivateProps {
  token: string;
  onDone: () => void;
}

export function Activate({ token, onDone }: ActivateProps) {
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

  return (
    <main className="auth-shell">
      <AuthShellBackgroundIcons />
      <div className="auth-container">
        <AuthAside />
        <section className="auth-card">
          <div className="card-ambient-glow" aria-hidden="true" />
          <div className="auth-card-inner">
            <BrandMark />
            <p className="eyebrow">ACCOUNT SETUP</p>
            <h1>Activate your account</h1>
            <p className="auth-lead">Create a strong password to finish setting up your MetaMinds Pvt. Ltd. account.</p>
            <form className="form-stack" onSubmit={submit}>
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
              {error && <p className="form-error" role="alert">{error}</p>}
              <Button disabled={busy}>
                {busy ? "Activating…" : "Set password"}
                <Check size={16} />
              </Button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
