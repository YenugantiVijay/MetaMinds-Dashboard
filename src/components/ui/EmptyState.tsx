import type { ReactNode } from "react";
import { FileText } from "lucide-react";

export interface EmptyStateProps {
  title: string;
  detail: string;
  icon?: ReactNode;
}

export function EmptyState({ title, detail, icon = <FileText size={28} /> }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-icon">{icon}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
    </div>
  );
}
