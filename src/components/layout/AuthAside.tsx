import {
  Activity,
  CalendarDays,
  ChevronDown,
  Clock3,
  FileCheck2,
  LayoutDashboard,
  Mail,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";

export function AuthAside() {
  return (
    <aside className="auth-aside" aria-label="MetaMinds portal overview">
      {/* Concentric Ambient Blue Ripples */}
      <div className="aside-ripples" aria-hidden="true">
        <span className="ripple-circle ripple-1" />
        <span className="ripple-circle ripple-2" />
        <span className="ripple-circle ripple-3" />
      </div>

      {/* Background Animated Aurora Orbs matching Company Logo Blues */}
      <div className="aside-aurora" aria-hidden="true">
        <span className="aurora-orb aurora-orb-1" />
        <span className="aurora-orb aurora-orb-2" />
        <span className="aurora-orb aurora-orb-3" />
        <div className="aside-grid-pattern" />
      </div>

      {/* Floating Animated Status & Metric Capsules Orbiting the Whole Section */}
      <div className="aside-orbit-layer" aria-hidden="true">
        <div className="floating-orbit-pill orbit-pill-1" title="Live System Performance">
          <span className="orbit-pulse-dot" />
          <span className="orbit-pill-title">System Uptime</span>
          <span className="orbit-pill-val">99.8%</span>
        </div>

        <div className="floating-orbit-pill orbit-pill-2" title="Active Engineering Sprint">
          <Activity size={13} className="orbit-ico-cyan" />
          <span className="orbit-pill-title">Sprint 12 · 18 Tasks</span>
          <span className="orbit-pill-badge">Active</span>
        </div>

        <div className="floating-orbit-pill orbit-pill-3" title="Bespoke Web Design & UI/UX Studio">
          <Sparkles size={13} className="orbit-ico-gold" />
          <span className="orbit-pill-title">Pixel-Perfect UI/UX Studio</span>
        </div>

        <div className="floating-orbit-pill orbit-pill-4" title="Enterprise Authentication & TLS 1.3">
          <ShieldCheck size={13} className="orbit-ico-emerald" />
          <span className="orbit-pill-title">256-Bit TLS · SSO Ready</span>
        </div>
      </div>

      {/* Top Header: Company Logo in Rounded Card + System Up Status Pill */}
      <div className="aside-top-bar brand-solo-bar">
        <div className="aside-brand-card" title="MetaMinds Pvt. Ltd.">
          <img
            src="/meta-minds-pvt-ltd.png"
            alt="MetaMinds Pvt. Ltd."
            className="aside-brand-logo-hero"
          />
        </div>
        <div className="aside-system-pill" title="Core Services Operational">
          <span className="system-pill-dot" />
          <span className="system-pill-text">System Up...</span>
        </div>
      </div>

      {/* Hero Headline & Subheadline */}
      <div className="aside-hero-copy">
        <h2 className="aside-hero-heading">
          Products, Services &amp; <span className="hero-heading-bold">Web Design</span>
        </h2>
        <p className="aside-hero-desc">
          MetaMinds Pvt. Ltd. delivers cutting-edge SaaS platforms, bespoke web design, and dedicated technology services engineered to scale modern enterprises.
        </p>
      </div>

      {/* Tab/Site Structure Representing the Dashboard */}
      <div className="aside-preview-wrapper" aria-hidden="true">
        <div className="portal-site-frame">
          {/* Site Window Title Bar */}
          <div className="portal-frame-bar">
            <div className="portal-brand-block">
              <span className="portal-brand-dot">❖</span>
              <span className="portal-brand-name">MetaMinds</span>
            </div>
            <div className="portal-frame-center">
              <span className="portal-badge-live">● Workspace Portal</span>
            </div>
          </div>

          <div className="portal-frame-grid">
            {/* Left Mini Sidebar */}
            <nav className="portal-mini-nav">
              <div className="mini-nav-item active">
                <LayoutDashboard size={12} className="nav-item-icon" />
                <span>Dashboard</span>
                <ChevronDown size={10} className="nav-chevron" />
              </div>
              <div className="mini-nav-item">
                <Mail size={12} className="nav-item-icon" />
                <span>Inbox</span>
                <span className="mini-nav-counter">3</span>
              </div>
              <div className="mini-nav-item">
                <FileCheck2 size={12} className="nav-item-icon" />
                <span>Tasks</span>
              </div>

              <div className="mini-nav-heading">YOU</div>

              <div className="mini-nav-item">
                <UserRound size={12} className="nav-item-icon" />
                <span>Me</span>
                <ChevronDown size={10} className="nav-chevron" />
              </div>
              <div className="mini-nav-item">
                <Sparkles size={12} className="nav-item-icon" />
                <span>Happiness</span>
              </div>
              <div className="mini-nav-item">
                <Clock3 size={12} className="nav-item-icon" />
                <span>Clock In</span>
              </div>
              <div className="mini-nav-item">
                <CalendarDays size={12} className="nav-item-icon" />
                <span>Time off</span>
              </div>
              <div className="mini-nav-item">
                <Activity size={12} className="nav-item-icon" />
                <span>Evaluation</span>
              </div>
            </nav>

            {/* Main Portal Content Surface */}
            <div className="portal-mini-main">
              <div className="mini-main-header">
                <span className="mini-portal-title">Employee's Portal</span>
              </div>

              {/* Top Widgets Row: Clock In + Events */}
              <div className="mini-widgets-row">
                {/* Clock In Widget */}
                <div className="mini-card clockin-card">
                  <div className="mini-card-head">
                    <Clock3 size={10} className="mini-head-ico" />
                    <span>Clock In</span>
                  </div>
                  <div className="clockin-body">
                    <span className="clockin-digits">0h 00m</span>
                    <span className="clockin-sub">Today</span>
                  </div>
                  <button type="button" className="mini-start-btn">Start</button>
                </div>

                {/* Events Widget */}
                <div className="mini-card events-card">
                  <div className="mini-card-head">
                    <CalendarDays size={10} className="mini-head-ico" />
                    <span>Events</span>
                  </div>
                  <div className="events-body">
                    <span className="event-pill-icon">🎉</span>
                    <span className="event-title">Sprint Demo</span>
                    <span className="event-sub">tomorrow</span>
                  </div>
                  <div className="events-dots-row">
                    <span className="ev-dot active" />
                    <span className="ev-dot" />
                  </div>
                </div>
              </div>

              {/* Tasks Widget */}
              <div className="mini-card tasks-card">
                <div className="mini-card-head">
                  <FileCheck2 size={10} className="mini-head-ico" />
                  <span>Tasks</span>
                </div>
                <div className="mini-task-items">
                  <div className="mini-task-entry">
                    <span className="task-bullet-chip">✏️</span>
                    <div className="task-entry-texts">
                      <span className="task-entry-title">Assigned task: Finish Employee Portal design</span>
                      <span className="task-entry-sub">Finish Time Off &amp; News cards</span>
                    </div>
                  </div>
                  <div className="mini-task-entry">
                    <span className="task-bullet-chip">✏️</span>
                    <div className="task-entry-texts">
                      <span className="task-entry-title">Review Cloud Architecture Sprint</span>
                      <span className="task-entry-sub">High-performance production check</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
