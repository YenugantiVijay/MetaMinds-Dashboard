import { useState, useEffect, type FormEvent } from "react";
import { Shield, Eye, EyeOff, ArrowUpRight } from "lucide-react";
import { BrandMark } from "../../components/ui/BrandMark";
import { AuthAside, AuthShellBackgroundIcons } from "../../components/layout";

export interface LoginProps {
  onLogin: (identifier: string, password: string) => Promise<void>;
  onDemoLogin?: (role: "ceo") => Promise<void>;
  onRegister: () => void;
  onForgot: () => void;
  initialIdentifier?: string;
}

export function Login({ onLogin, onRegister, onForgot, initialIdentifier }: LoginProps) {
  const [identifier, setIdentifier] = useState(initialIdentifier || "");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [capsLockWarning, setCapsLockWarning] = useState(false);
  const [userInteractedIdentifier, setUserInteractedIdentifier] = useState(false);
  const [userInteractedPassword, setUserInteractedPassword] = useState(false);

  // Set initial identifier or clear browser autofill of job position
  useEffect(() => {
    if (initialIdentifier) {
      setIdentifier(initialIdentifier);
    } else {
      setIdentifier("");
    }
    setPassword("");
    const t1 = setTimeout(() => {
      setIdentifier((prev) => {
        if (initialIdentifier && prev === initialIdentifier) return prev;
        return (prev.toLowerCase().includes("developer") || prev.toLowerCase().includes("engineer") || prev.toLowerCase().includes("designer") ? "" : prev);
      });
    }, 150);
    const t2 = setTimeout(() => {
      setIdentifier((prev) => {
        if (initialIdentifier && prev === initialIdentifier) return prev;
        return (prev.toLowerCase().includes("developer") || prev.toLowerCase().includes("engineer") || prev.toLowerCase().includes("designer") ? "" : prev);
      });
    }, 450);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [initialIdentifier]);

  const isApplicationRef = identifier.trim().toUpperCase().startsWith("MM-APP-");

  function handlePasswordKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.getModifierState("CapsLock")) {
      setCapsLockWarning(true);
    } else {
      setCapsLockWarning(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await onLogin(identifier, password);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t sign you in. Check your details and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-shell">
      <AuthShellBackgroundIcons />
      <div className="auth-container">
        <AuthAside />

        <section className="auth-card" aria-label="Sign in to MetaMinds">
          {/* Glow halo behind card */}
          <div className="card-ambient-glow" aria-hidden="true" />

          <div className="auth-card-inner">
            {/* Top Brand & Security Chip (Prominently Increased Sizing from Image 3) */}
            <div className="login-card-top">
              <BrandMark />
              <div className="sso-badge">
                <Shield size={12} className="sso-icon" />
                <span>SSO Ready</span>
              </div>
            </div>

            {/* Header Content (Directly from Image 3 Reference) */}
            <div className="auth-form-header">
              <span className="login-eyebrow">EMPLOYEE &amp; LEADERSHIP PORTAL</span>
              <h1 className="login-title">Welcome back</h1>
              <p className="login-subtitle">Sign in to your account with your work email or employee ID.</p>
            </div>

            <form onSubmit={submit} className="form-stack login-form" aria-busy={busy} autoComplete="off">
              {/* Invisible decoy inputs to absorb browser autofill */}
              <input
                type="text"
                name="autofill_decoy_user"
                tabIndex={-1}
                aria-hidden="true"
                style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0, top: -9999, left: -9999 }}
              />
              <input
                type="password"
                name="autofill_decoy_pass"
                tabIndex={-1}
                aria-hidden="true"
                style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0, top: -9999, left: -9999 }}
              />

              {/* Identifier Input Field (Empty by default, showing placeholder, autofill disabled) */}
              <div className="auth-field-group">
                <label htmlFor="login-identifier" className="auth-field-label">
                  <span>Work email or employee ID</span>
                </label>
                <div className="clean-input-wrap">
                  <input
                    id="login-identifier"
                    name="employee_portal_signin_id"
                    autoComplete="off"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    type="text"
                    required
                    readOnly={!userInteractedIdentifier}
                    onFocus={() => setUserInteractedIdentifier(true)}
                    onClick={() => setUserInteractedIdentifier(true)}
                    value={identifier}
                    onChange={(event) => {
                      const val = event.target.value;
                      if (!userInteractedIdentifier && (val.toLowerCase().includes("developer") || val.toLowerCase().includes("engineer") || val.toLowerCase().includes("designer") || val.toLowerCase().includes("frontend"))) {
                        setIdentifier("");
                        return;
                      }
                      setIdentifier(val);
                    }}
                    placeholder="e.g. MM-YYYY-NNNN or you@metaminds.local"
                    className="clean-auth-input"
                  />
                </div>
              </div>

              {/* Password Input Field with inline Forgot Password (Directly from Image 3) */}
              <div className="auth-field-group">
                <div className="auth-label-row">
                  <label htmlFor="login-password" className="auth-field-label">
                    <span>Password</span>
                  </label>
                  <button
                    type="button"
                    className="forgot-link-btn"
                    onClick={onForgot}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="clean-input-wrap password-wrap">
                  <input
                    id="login-password"
                    name="employee_portal_signin_pw"
                    autoComplete="current-password"
                    type={showPassword ? "text" : "password"}
                    required
                    readOnly={!userInteractedPassword}
                    onFocus={() => setUserInteractedPassword(true)}
                    onClick={() => setUserInteractedPassword(true)}
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyDown={handlePasswordKeyDown}
                    onKeyUp={handlePasswordKeyDown}
                    placeholder="••••••••••••"
                    className="clean-auth-input"
                  />
                  <button
                    type="button"
                    className="password-peek-btn"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    aria-pressed={showPassword}
                    onClick={() => setShowPassword((prev) => !prev)}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {capsLockWarning && (
                  <p className="field-hint-warning">
                    <span>⚠️ Caps Lock is active</span>
                  </p>
                )}
              </div>

              {/* Application Reference Warning Callout (Matching Image 2) */}
              {isApplicationRef && (
                <div className="form-info-callout" role="alert">
                  <span>That is an application reference, not a sign-in ID. Use your work email or the employee ID in your approval email (MM-YYYY-NNNN). Sign-in is available after approval.</span>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="form-error-banner" role="alert">
                  <span className="error-icon">!</span>
                  <span>{error}</span>
                </div>
              )}

              {/* Primary Sign In Button (Matching Image 2 with Company Colors) */}
              <button
                type="submit"
                className={`image2-submit-btn ${busy ? "is-loading" : ""}`}
                disabled={busy}
              >
                <span className="submit-btn-shimmer" aria-hidden="true" />
                <span className="submit-btn-content">
                  {busy ? (
                    <>
                      <span className="btn-spinner" aria-hidden="true" />
                      <span>Signing in…</span>
                    </>
                  ) : (
                    <>
                      <span>Sign in</span>
                      <ArrowUpRight size={15} className="btn-arrow" />
                    </>
                  )}
                </span>
              </button>
              <span className="native-checkbox-hidden" role="status" aria-live="polite">
                {busy ? "Signing in, please wait." : ""}
              </span>
            </form>

            {/* Divider (NEW TO METAMINDS? from Image 2) */}
            <div className="auth-modern-divider">
              <span className="divider-line" />
              <span className="divider-text">NEW TO METAMINDS?</span>
              <span className="divider-line" />
            </div>

            {/* Secondary Action: Apply to join the team (Matching Image 2, CEO button removed) */}
            <button
              type="button"
              className="image2-secondary-btn"
              onClick={onRegister}
            >
              <span>Apply to join the team</span>
            </button>

            {/* Footnote (Matching Image 2) */}
            <div className="auth-provision-footnote">
              <span>Access is provisioned only after authorized approval.</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
