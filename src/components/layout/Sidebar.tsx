import type { ReactNode } from "react";
import {
  CalendarDays,
  CircleHelp,
  Clock3,
  FileCheck2,
  FileText,
  LayoutDashboard,
  LogOut,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import type { Section, User } from "../../types";
import { BrandMark } from "../ui/BrandMark";

export interface SidebarProps {
  user: User;
  section: Section;
  onNavigate: (section: Section) => void;
  onLogout: () => void;
  onHelp: () => void;
  onAccount: () => void;
  open: boolean;
  onClose: () => void;
}

export function Sidebar({
  user,
  section,
  onNavigate,
  onLogout,
  onHelp,
  onAccount,
  open,
  onClose,
}: SidebarProps) {
  const items: Array<{ id: Section; label: string; icon: ReactNode; roles: User["role"][] }> = [
    { id: "overview", label: "Overview", icon: <LayoutDashboard size={21} />, roles: ["ceo", "team_lead", "employee"] },
    { id: "applications", label: "Applications", icon: <FileCheck2 size={21} />, roles: ["ceo"] },
    {
      id: "employees",
      label: user.role === "ceo" ? "People directory" : "My team",
      icon: <Users size={21} />,
      roles: ["ceo", "team_lead", "employee"],
    },
    { id: "attendance", label: "Attendance", icon: <Clock3 size={21} />, roles: ["ceo", "team_lead", "employee"] },
    { id: "leave", label: "Leave", icon: <CalendarDays size={21} />, roles: ["ceo", "team_lead", "employee"] },
    { id: "payroll", label: "Payroll", icon: <FileText size={21} />, roles: ["ceo"] },
  ];

  return (
    <>
      <button
        className={`mobile-scrim ${open ? "scrim-visible" : ""}`}
        aria-label="Close navigation"
        onClick={onClose}
      />
      <aside className={`sidebar ${open ? "sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <BrandMark />
          <button className="icon-button mobile-close" onClick={onClose} aria-label="Close navigation">
            <X size={20} />
          </button>
        </div>
        <nav className="side-nav" aria-label="Main navigation">
          <span className="nav-caption">WORKSPACE</span>
          {items
            .filter((item) => item.roles.includes(user.role))
            .map((item) => (
              <button
                key={item.id}
                className={`nav-item ${section === item.id ? "nav-active" : ""}`}
                onClick={() => {
                  onNavigate(item.id);
                  onClose();
                }}
              >
                {item.icon}
                <span>{item.label}</span>
              </button>
            ))}
        </nav>
        {user.role === "ceo" && (
          <nav className="side-nav side-bottom" aria-label="Administration">
            <span className="nav-caption">ADMINISTRATION</span>
            <button
              className={`nav-item ${section === "audit" ? "nav-active" : ""}`}
              onClick={() => onNavigate("audit")}
            >
              <ShieldCheck size={21} />
              <span>Audit log</span>
            </button>
          </nav>
        )}
        <div className="sidebar-footer">
          <button
            className={`sidebar-action ${section === "settings" ? "sidebar-action-active" : ""}`}
            onClick={() => {
              if (user.role === "ceo") onNavigate("settings");
              else onAccount();
              onClose();
            }}
          >
            <Settings size={20} />
            <span>Settings</span>
          </button>
          <button
            className="sidebar-action"
            onClick={() => {
              onHelp();
              onClose();
            }}
          >
            <CircleHelp size={20} />
            <span>Help Center</span>
          </button>
          <button className="sidebar-action sidebar-logout" onClick={onLogout}>
            <LogOut size={20} />
            <span>Log Out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
