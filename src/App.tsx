import { useState, useEffect, useMemo, useCallback } from "react";
import { Check, X } from "lucide-react";

import type { User, Section } from "./types";
import { sectionTitles } from "./types";
import { api } from "./services/api";

import { BrandMark, LoadingState } from "./components/ui";
import {
  Sidebar,
  Topbar,
  NotificationsPanel,
  AccountPanel,
  HelpPanel,
  EmailStatusPanel,
} from "./components/layout";

import {
  Login,
  Register,
  Activate,
  PasswordReset,
  ApplicationSubmittedScreen,
} from "./features/auth";

import { Overview } from "./features/dashboard";
import { ApplicationsPage } from "./features/applications";
import { DirectoryPage } from "./features/employees";
import { AttendancePage } from "./features/attendance";
import { LeavePage } from "./features/leave";
import { PayrollPage } from "./features/payroll";
import { SettingsPage } from "./features/settings";
import { AuditPage } from "./features/audit";

export function App() {
  const [user, setUser] = useState<User | null>(null);
  const [section, setSection] = useState<Section>("overview");
  const [publicPage, setPublicPage] = useState<"login" | "register">("login");
  const [submission, setSubmission] = useState<{
    reference: string;
    email: string;
    fullName: string;
    position: string;
    emailQueued: boolean;
  } | null>(null);
  const [prefilledIdentifier, setPrefilledIdentifier] = useState("");
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

  const activationToken = useMemo(
    () => new URLSearchParams(window.location.search).get("activate") || "",
    [],
  );
  const resetToken = useMemo(
    () => new URLSearchParams(window.location.search).get("reset") || "",
    [],
  );

  const notify = useCallback((message: string, kind: "success" | "error" = "success") => {
    setToast({ text: message, kind });
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  useEffect(() => {
    api<{ user: User | null; csrfToken: string }>("/api/auth/me")
      .then((result) => {
        setUser(result.user);
        setLoading(false);
      })
      .catch((caught) => {
        setError(caught instanceof Error ? caught.message : "Portal could not be reached.");
        setLoading(false);
      });
  }, []);

  async function login(identifier: string, password: string) {
    const result = await api<{ user: User; csrfToken: string }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ identifier, password }),
    });
    setUser(result.user);
    setSection("overview");
  }

  async function logout() {
    try {
      await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) });
      setUser(null);
      setPublicPage("login");
      const session = await api<{ csrfToken: string }>("/api/auth/me");
      if (!session.csrfToken) {
        throw new Error(
          "A new sign-in session could not be prepared. Refresh the page and try again.",
        );
      }
      notify("You have signed out.");
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : "Unable to sign out.", "error");
    }
  }

  if (loading) {
    return (
      <div className="launch-loading">
        <BrandMark />
        <LoadingState />
      </div>
    );
  }

  if (activationToken && !activationComplete) {
    return <Activate token={activationToken} onDone={() => setActivationComplete(true)} />;
  }

  if (resetToken && !resetComplete) {
    return (
      <PasswordReset
        token={resetToken}
        onDone={() => {
          setResetComplete(true);
          void api<{ user: User | null }>("/api/auth/me").then((result) => setUser(result.user));
        }}
        onBack={() => {
          setResetComplete(true);
          void api<{ user: User | null }>("/api/auth/me").then((result) => setUser(result.user));
        }}
      />
    );
  }

  if (submission) {
    return (
      <ApplicationSubmittedScreen
        submission={submission}
        onProceedToLogin={(approvedId) => {
          if (approvedId) {
            setPrefilledIdentifier(approvedId);
          } else if (submission.email) {
            setPrefilledIdentifier(submission.email);
          }
          setSubmission(null);
          setPublicPage("login");
        }}
      />
    );
  }

  if (!user) {
    return publicPage === "register" ? (
      <Register onBack={() => setPublicPage("login")} onSubmitted={(sub) => setSubmission(sub)} />
    ) : resetMode ? (
      <PasswordReset onDone={() => setResetMode(false)} onBack={() => setResetMode(false)} />
    ) : (
      <>
        <Login
          onLogin={login}
          onRegister={() => setPublicPage("register")}
          onForgot={() => setResetMode(true)}
          initialIdentifier={prefilledIdentifier}
        />
        {error && (
          <div className="toast toast-error" role="alert">
            {error}
          </div>
        )}
      </>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        user={user}
        section={section}
        onNavigate={setSection}
        onLogout={() => void logout()}
        onHelp={() => setHelpOpen(true)}
        onAccount={() => setAccountOpen(true)}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
      />
      <main className="main-area">
        <Topbar
          user={user}
          title={sectionTitles[section]}
          onMenu={() => setMenuOpen(true)}
          onNotifications={() => setNotificationsOpen(true)}
          onNavigate={setSection}
          onAccount={() => setAccountOpen(true)}
          onLogout={() => void logout()}
        />
        {section === "overview" && <Overview user={user} notify={notify} onNavigate={setSection} />}
        {section === "applications" && user.role === "ceo" && (
          <ApplicationsPage notify={notify} />
        )}
        {section === "employees" && <DirectoryPage user={user} notify={notify} />}
        {section === "attendance" && <AttendancePage user={user} notify={notify} />}
        {section === "leave" && <LeavePage user={user} notify={notify} />}
        {section === "payroll" && user.role === "ceo" && <PayrollPage />}
        {section === "settings" && user.role === "ceo" && <SettingsPage notify={notify} />}
        {section === "audit" && user.role === "ceo" && <AuditPage notify={notify} />}
      </main>
      {notificationsOpen && (
        <NotificationsPanel onClose={() => setNotificationsOpen(false)} notify={notify} />
      )}
      {messagesOpen && <EmailStatusPanel onClose={() => setMessagesOpen(false)} notify={notify} />}
      {helpOpen && <HelpPanel onClose={() => setHelpOpen(false)} />}
      {accountOpen && <AccountPanel user={user} onClose={() => setAccountOpen(false)} />}
      {toast && (
        <div className={`toast ${toast.kind === "error" ? "toast-error" : ""}`} role="status">
          {toast.kind === "error" ? <X size={17} /> : <Check size={17} />}
          {toast.text}
        </div>
      )}
    </div>
  );
}

export default App;
