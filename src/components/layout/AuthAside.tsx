import { CalendarCheck2, CheckCircle2, LayoutDashboard, UserRound } from "lucide-react";
import { BrandMark } from "../ui/BrandMark";

// A static product preview, not fabricated live performance or SSO metrics.
export function AuthAside() {
  return (
    <aside className="auth-aside auth-aside-modern" aria-label="About the MetaMinds employee portal">
      <div className="auth-showcase">
        <BrandMark className="auth-showcase-brand" />
        <div className="auth-showcase-copy">
          <p className="auth-showcase-eyebrow">EMPLOYEE &amp; LEADERSHIP PORTAL</p>
          <h2>People. Progress. Together.</h2>
          <p>One secure workspace to manage attendance, personal information, and leave requests.</p>
        </div>
        <div className="auth-product-preview" aria-label="Employee portal illustration">
          <div className="preview-sidebar">
            <strong>MetaMinds</strong>
            <span className="preview-menu active"><LayoutDashboard size={16} /> Dashboard</span>
            <span className="preview-menu"><UserRound size={16} /> My Profile</span>
            <span className="preview-menu"><CalendarCheck2 size={16} /> Leave</span>
          </div>
          <div className="preview-main">
            <p className="preview-small">MY WORKSPACE</p>
            <h3>Everything in one place</h3>
            <div className="preview-stat-row">
              <div><CalendarCheck2 size={21}/><span>Attendance</span></div>
              <div><UserRound size={21}/><span>Personal details</span></div>
            </div>
            <div className="preview-progress">
              <span><CheckCircle2 size={17}/> Track work hours accurately</span>
              <span><CheckCircle2 size={17}/> Request leave with confidence</span>
              <span><CheckCircle2 size={17}/> Stay informed and connected</span>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
