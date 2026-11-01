import { useEffect, useState } from "react";
import type { NotifyFn } from "../../types";
import { api } from "../../services/api";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingState } from "../../components/ui/LoadingState";
import { PageHeader } from "../../components/ui/PageHeader";

export interface AuditPageProps {
  notify: NotifyFn;
}

export function AuditPage({ notify }: AuditPageProps) {
  const [rows, setRows] = useState<
    Array<{ action: string; entityType: string; entityId: string; createdAt: string; actor: string | null }>
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<typeof rows>("/api/audit")
      .then(setRows)
      .catch((error) => notify(error instanceof Error ? error.message : "Could not load audit history.", "error"))
      .finally(() => setLoading(false));
  }, [notify]);

  return (
    <div className="page-content">
      <PageHeader title="Audit log" subtitle="A recent history of sensitive account and workflow changes." />
      <section className="panel table-panel">
        {loading ? (
          <LoadingState />
        ) : rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Record</th>
                  <th>Actor</th>
                  <th>Time</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.action}-${index}`}>
                    <td>
                      <span className="audit-action">{row.action}</span>
                    </td>
                    <td>{row.entityType}</td>
                    <td>{row.entityId}</td>
                    <td>{row.actor || "System"}</td>
                    <td>
                      {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(
                        new Date(row.createdAt)
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No audit events yet"
            detail="Sensitive operations will be recorded here."
          />
        )}
      </section>
    </div>
  );
}
