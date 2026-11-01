import { useState, useEffect, useMemo, type FormEvent } from "react";
import {
  BriefcaseBusiness,
  Check,
  UserRound,
  Camera,
  Upload,
  X,
  ShieldCheck,
  Mail,
  Eye,
  EyeOff,
  ArrowUpRight,
} from "lucide-react";
import { api } from "../../services/api";
import { BrandMark, Button } from "../../components/ui";

export interface RegisterProps {
  onBack: () => void;
  onSubmitted: (submission: {
    reference: string;
    email: string;
    fullName: string;
    position: string;
    emailQueued: boolean;
  }) => void;
}

export function Register({ onBack, onSubmitted }: RegisterProps) {
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
    discussedSalary: "",
    education: "",
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
        if (!form.position.trim()) throw new Error("Please specify your position / role.");
        if (!form.department.trim()) throw new Error("Please specify your department or practice area.");
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
      // Step 4: Submit without collecting identity documents.
      if (!form.privacyAcknowledged) {
        throw new Error("Please acknowledge the application privacy notice before submitting.");
      }
      const result = await api<{ reference: string; confirmationEmailQueued: boolean; fullName?: string; email?: string; position?: string }>("/api/applications", {
        method: "POST",
        body: JSON.stringify({
          firstName: form.firstName,
          lastName: form.lastName,
          phone: form.phone,
          employmentType: form.employmentType,
          position: form.position,
          department: form.department,
          proposedJoiningDate: form.proposedJoiningDate || new Date().toISOString().slice(0, 10),
          discussedSalary: form.discussedSalary,
          education: form.education,
          privacyAcknowledged: form.privacyAcknowledged,
          password: form.password,
          photoUrl: form.photoUrl || undefined,
        }),
      });
      onSubmitted({
        reference: result.reference,
        email: form.email,
        fullName: `${form.firstName} ${form.lastName}`.trim(),
        position: form.position,
        emailQueued: result.confirmationEmailQueued,
      });
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
            <h1>Employee Application</h1>
            <p>Provide your contact details, role preferences and application information. Applications are reviewed directly by the CEO.</p>
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
            <span className="step-copy"><small>STEP 04</small><strong>Review & Submit</strong></span>
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
                <span>Position / Designation <b>*</b></span>
                <input required maxLength={120} value={form.position} onChange={(event) => update("position", event.target.value)} placeholder="e.g. Senior Frontend Engineer" />
              </label>
              <label>
                <span>Department or Practice Area <b>*</b></span>
                <input required maxLength={100} value={form.department} onChange={(event) => update("department", event.target.value)} placeholder="e.g. Engineering, Product Design, Operations" />
              </label>
              <label className="full-width">
                <span>Preferred Work Mode</span>
                <select value={form.workMode || "hybrid"} onChange={(event) => update("workMode", event.target.value)}>
                  <option value="hybrid">Hybrid (Office & Remote)</option>
                  <option value="onsite">On-site (Hyderabad HQ)</option>
                  <option value="remote">Remote (India)</option>
                </select>
              </label>
              <label className="full-width">
                <span>Discussed Monthly Salary (₹ INR) <b>*</b></span>
                <input required maxLength={50} value={form.discussedSalary} onChange={(event) => update("discussedSalary", event.target.value)} placeholder="e.g. ₹60,000 / month or 60000" />
                <small className="field-help">Monthly compensation discussed during the interview for CEO review. This does not create a payroll structure or authorize payment.</small>
              </label>

              {/* Explicit hidden username field with applicant email so browsers never associate position with password */}
              <input
                type="text"
                name="username"
                autoComplete="username"
                value={form.email}
                readOnly
                tabIndex={-1}
                aria-hidden="true"
                style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 0, height: 0 }}
              />

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
              <div className="full-width notice notice-info">
                <ShieldCheck size={19} />
                <span>For privacy and data minimization, identity documents (including PAN and Aadhaar) are not collected in this public application. If documents are required later, the company must request them through an approved secure process with access and retention controls.</span>
              </div>
              <label className="full-width">
                <span>Highest Educational Qualification Summary</span>
                <textarea rows={3} maxLength={1000} value={form.education} onChange={(event) => update("education", event.target.value)} placeholder="e.g. B.Tech in Computer Science, institution and graduation year" />
              </label>
              <label className="consent-row full-width">
                <input required type="checkbox" checked={form.privacyAcknowledged} onChange={(event) => update("privacyAcknowledged", event.target.checked)} />
                <span>I confirm that the information in this application is accurate and acknowledge that it will be used to review my application and contact me about its outcome. <b>*</b></span>
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
