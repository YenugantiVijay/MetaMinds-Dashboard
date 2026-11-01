import { useEffect, useState, type ReactNode } from "react";
import { Bell, X } from "lucide-react";
import type { NotifyFn, User } from "../../types";
import { api } from "../../services/api";
import { EmptyState } from "../ui/EmptyState";
import { LoadingState } from "../ui/LoadingState";
import { UserAvatar } from "../ui/UserAvatar";

export interface WorkspacePanelProps {
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
}

export function WorkspacePanel({ title, description, onClose, children }: WorkspacePanelProps) {
  return (
    <div
      className="notification-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="notification-panel workspace-panel" aria-label={title}>
        <div className="notification-heading">
          <div>
            <h2>{title}</h2>
            <p>{description}</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label={`Close ${title}`}>
            <X size={18} />
          </button>
        </div>
        <div className="workspace-panel-content">{children}</div>
      </aside>
    </div>
  );
}

export function NotificationsPanel({ onClose, notify }: { onClose: () => void; notify: NotifyFn }) {
  const [items, setItems] = useState<
    Array<{ id: number; title: string; message: string; readAt: string | null; createdAt: string }>
  >([]);

  useEffect(() => {
    api<typeof items>("/api/notifications")
      .then(setItems)
      .catch((error) => notify(error instanceof Error ? error.message : "Could not load notifications.", "error"));
  }, [notify]);

  async function markRead(id: number) {
    try {
      await api("/api/notifications/read", { method: "POST", body: JSON.stringify({ id }) });
      setItems((current) =>
        current.map((item) => (item.id === id ? { ...item, readAt: new Date().toISOString() } : item))
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to mark notification read.", "error");
    }
  }

  return (
    <div
      className="notification-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="notification-panel" aria-label="Notifications">
        <div className="notification-heading">
          <div>
            <h2>Notifications</h2>
            <p>Updates for your account</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close notifications">
            <X size={18} />
          </button>
        </div>
        {items.length ? (
          <div className="notification-list">
            {items.map((item) => (
              <button
                key={item.id}
                className={`notification-item ${item.readAt ? "" : "notification-unread"}`}
                onClick={() => void markRead(item.id)}
              >
                <span className="notification-dot" />
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.message}</small>
                  <time>
                    {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
                      new Date(item.createdAt)
                    )}
                  </time>
                </span>
              </button>
            ))}
          </div>
        ) : (
          <EmptyState
            title="You're all caught up"
            detail="New portal updates will appear here."
            icon={<Bell size={21} />}
          />
        )}
      </aside>
    </div>
  );
}

export function AccountPanel({ user, onClose }: { user: User; onClose: () => void }) {
  return (
    <WorkspacePanel title="My account" description="Your MetaMinds workspace profile" onClose={onClose}>
      <div className="account-profile">
        <UserAvatar user={user} className="topbar-avatar" />
        <div>
          <strong>{user.name}</strong>
          <small>{user.role.replace("_", " ")}</small>
        </div>
      </div>
      <dl className="account-details">
        <div>
          <dt>Email</dt>
          <dd>{user.email}</dd>
        </div>
        <div>
          <dt>Employee ID</dt>
          <dd>{user.employeeId ?? "Assigned after approval"}</dd>
        </div>
        <div>
          <dt>Position</dt>
          <dd>{user.position || "Not specified"}</dd>
        </div>
        <div>
          <dt>Department</dt>
          <dd>{user.department || "Not specified"}</dd>
        </div>
      </dl>
      <p className="workspace-panel-note">For profile or access changes, contact your workspace administrator.</p>
    </WorkspacePanel>
  );
}

export function HelpPanel({ onClose }: { onClose: () => void }) {
  return (
    <WorkspacePanel title="Help Center" description="Quick guidance for your people workspace" onClose={onClose}>
      <div className="help-topic">
        <strong>Attendance</strong>
        <p>Use the Attendance page to review check-ins and check-outs recorded by the portal.</p>
      </div>
      <div className="help-topic">
        <strong>Leave requests</strong>
        <p>Submit a request from Leave and follow its status there. Team leads can review requests assigned to their team.</p>
      </div>
      <div className="help-topic">
        <strong>Account access</strong>
        <p>Use Forgot password on the sign-in screen if email delivery is configured. Otherwise, ask your workspace administrator for help.</p>
      </div>
      <p className="workspace-panel-note">For urgent access or data corrections, contact your MetaMinds workspace administrator.</p>
    </WorkspacePanel>
  );
}

export function EmailStatusPanel({ onClose, notify }: { onClose: () => void; notify: NotifyFn }) {
  const [status, setStatus] = useState<{ emailConfigured: boolean } | null>(null);

  useEffect(() => {
    api<{ emailConfigured: boolean }>("/api/health")
      .then(setStatus)
      .catch((error) => notify(error instanceof Error ? error.message : "Could not load delivery status.", "error"));
  }, [notify]);

  return (
    <WorkspacePanel title="Messages" description="Email verification and notification delivery" onClose={onClose}>
      {status ? (
        <>
          <div className="delivery-status-row">
            <span>Email service</span>
            <strong className={status.emailConfigured ? "delivery-ready" : "delivery-unavailable"}>
              {status.emailConfigured ? "Configured" : "Not configured"}
            </strong>
          </div>
          <p className="workspace-panel-note">
            {status.emailConfigured
              ? "Email messages are submitted to the configured mail service; queueing does not guarantee inbox delivery."
              : "Email verification is unavailable until an administrator configures SMTP in the server environment. The portal does not expose or store mail credentials in this page."}
          </p>
        </>
      ) : (
        <LoadingState />
      )}
    </WorkspacePanel>
  );
}
