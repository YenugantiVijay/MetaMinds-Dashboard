import type { ReactNode } from "react";
import { Activity, CalendarDays } from "lucide-react";
import type { User } from "../../types";

export interface OverviewHeroProps {
  user: User;
  today?: string;
  label: string;
  description: string;
  action?: ReactNode;
}

export function OverviewHero({ user, today, label, description, action }: OverviewHeroProps) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const dateLabel = today
    ? new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(
        new Date(`${today}T12:00:00`)
      )
    : "Today";
  const rawName = user.name || user.email.split("@")[0];
  const displayName = rawName.includes(".")
    ? rawName.split(".")[0].charAt(0).toUpperCase() + rawName.split(".")[0].slice(1)
    : rawName.split(" ")[0];

  return (
    <header className="overview-hero">
      <div className="overview-hero-copy">
        <div className="hero-meta">
          <span className="hero-tag">
            <Activity size={13} /> {label}
          </span>
          <span className="hero-sep">·</span>
          <span className="hero-date">
            <CalendarDays size={13} /> {dateLabel}
          </span>
          <span className="hero-sep">·</span>
          <span className="hero-live-pill">
            <span className="live-dot" />
            Live Portal
          </span>
        </div>

        <h1 className="hero-heading">
          {greeting}, <span className="hero-name">{displayName}</span>
        </h1>
        <p className="hero-desc">{description}</p>

        {action && <div className="hero-action">{action}</div>}
      </div>
    </header>
  );
}
