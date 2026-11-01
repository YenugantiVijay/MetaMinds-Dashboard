import type { ReactNode } from "react";

export interface StatCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  detail: string;
  tone: string;
}

export function StatCard({ label, value, icon, detail, tone }: StatCardProps) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span>{label}</span>
        <span className={`stat-icon ${tone}`}>{icon}</span>
      </div>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}
