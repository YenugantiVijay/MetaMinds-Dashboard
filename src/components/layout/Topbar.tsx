import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  ChevronDown,
  LogOut,
  Menu,
  Search,
  UserRound,
} from "lucide-react";
import type { Section, User } from "../../types";
import { UserAvatar } from "../ui/UserAvatar";

export interface TopbarProps {
  user: User;
  title: string;
  onMenu: () => void;
  onNotifications: () => void;
  onMessages?: () => void;
  onNavigate: (section: Section) => void;
  onAccount: () => void;
  onLogout: () => void;
}

export function Topbar({
  user,
  title,
  onMenu,
  onNotifications,
  onNavigate,
  onAccount,
  onLogout,
}: TopbarProps) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const destinations: Array<{ label: string; section: Section; roles: User["role"][] }> = [
    { label: "Overview", section: "overview", roles: ["ceo", "team_lead", "employee"] },
    {
      label: user.role === "ceo" ? "People directory" : "My team",
      section: "employees",
      roles: ["ceo", "team_lead", "employee"],
    },
    { label: "My Profile", section: "profile", roles: ["employee", "team_lead"] },
    { label: "Attendance", section: "attendance", roles: ["ceo", "team_lead", "employee"] },
    { label: "Leave & Calendar", section: "leave", roles: ["ceo", "team_lead", "employee"] },
    { label: "Applications", section: "applications", roles: ["ceo"] },
    { label: "Payroll", section: "payroll", roles: ["ceo"] },
    { label: "Company settings", section: "settings", roles: ["ceo"] },
    { label: "Audit log", section: "audit", roles: ["ceo"] },
  ];

  const results = destinations.filter(
    (item) =>
      item.roles.includes(user.role) &&
      (!query.trim() || item.label.toLowerCase().includes(query.trim().toLowerCase()))
  );

  function openDestination(section: Section) {
    onNavigate(section);
    setSearchOpen(false);
    setQuery("");
  }

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="icon-button menu-toggle" onClick={onMenu} aria-label="Open navigation">
          <Menu size={19} />
        </button>
        <span className="topbar-title">{title}</span>
      </div>
      <div className="topbar-actions">
        <div ref={searchRef} className={`topbar-search-wrap ${searchOpen ? "search-active" : ""}`}>
          <button
            className="icon-button mobile-search-toggle"
            aria-label="Search workspace"
            onClick={() => setSearchOpen((open) => !open)}
          >
            <Search size={17} />
          </button>
          <label className="search-box">
            <Search size={15} />
            <input
              aria-label="Search workspace pages"
              placeholder="Search workspace"
              value={query}
              onFocus={() => setSearchOpen(true)}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearchOpen(false);
                if (event.key === "Enter" && results[0]) openDestination(results[0].section);
              }}
            />
          </label>
          {searchOpen && (
            <div className="search-results" role="listbox" aria-label="Workspace pages">
              {results.length ? (
                results.map((item) => (
                  <button
                    key={item.section}
                    role="option"
                    aria-selected="false"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => openDestination(item.section)}
                  >
                    {item.label}
                    <ArrowUpRight size={14} />
                  </button>
                ))
              ) : (
                <span>No matching workspace pages</span>
              )}
            </div>
          )}
        </div>
        <button className="icon-button" onClick={onNotifications} aria-label="Notifications">
          <Bell size={18} />
        </button>
        <span className="topbar-separator" />
        <div ref={profileRef} className="profile-menu-wrap">
          <button
            className="profile-trigger profile-capsule"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((open) => !open)}
            aria-label="User profile menu"
          >
            <UserAvatar user={user} className="topbar-avatar profile-capsule-avatar" />
            <div className="profile-capsule-meta">
              <span className="profile-capsule-name">{user.name}</span>
              <span className="profile-capsule-role">
                {user.position ||
                  (user.role === "ceo"
                    ? "Chief Executive Officer"
                    : user.role === "team_lead"
                    ? "Team Lead"
                    : "Employee")}
              </span>
            </div>
            <ChevronDown size={14} className="profile-capsule-arrow" />
          </button>
          {profileOpen && (
            <div className="profile-menu">
              <div className="profile-menu-identity">
                <strong>{user.name}</strong>
                <small>{user.email}</small>
              </div>
              <button
                onClick={() => {
                  onAccount();
                  setProfileOpen(false);
                }}
              >
                <UserRound size={15} /> My account
              </button>
              <button
                className="profile-logout"
                onClick={() => {
                  onLogout();
                  setProfileOpen(false);
                }}
              >
                <LogOut size={15} /> Log out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
