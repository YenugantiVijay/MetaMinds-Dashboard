import { useCallback, useEffect, useState } from "react";
import {
  AlertCircle,
  CalendarDays,
  FileText,
  FolderGit2,
  Search,
  X,
} from "lucide-react";
import type { DailyWorkReport, NotifyFn, User } from "../../types";
import { api, durationLabel, formatDate, formatTime } from "../../services/api";
import { EmptyState } from "../../components/ui/EmptyState";
import { LoadingState } from "../../components/ui/LoadingState";

export interface DailyWorkReportsViewProps {
  user: User;
  notify: NotifyFn;
  timezone?: string;
}

export function DailyWorkReportsView({ user, notify, timezone = "Asia/Kolkata" }: DailyWorkReportsViewProps) {
  const [reports, setReports] = useState<DailyWorkReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedReport, setSelectedReport] = useState<DailyWorkReport | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateFilter) params.set("date", dateFilter);
      if (search.trim()) params.set("employeeId", search.trim());
      const query = params.toString() ? `?${params.toString()}` : "";
      const data = await api<DailyWorkReport[]>(`/api/daily-work-reports${query}`);
      setReports(data);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Unable to load daily work reports.", "error");
    } finally {
      setLoading(false);
    }
  }, [dateFilter, search, notify]);

  useEffect(() => {
    void loadReports();
  }, [loadReports]);

  const filteredReports = reports.filter((r) => {
    if (!search.trim()) return true;
    const term = search.toLowerCase();
    return (
      (r.employeeName?.toLowerCase().includes(term) ?? false) ||
      (r.companyEmployeeId?.toLowerCase().includes(term) ?? false) ||
      r.workSummary.toLowerCase().includes(term) ||
      (r.projectReference?.toLowerCase().includes(term) ?? false)
    );
  });

  return (
    <div className="daily-work-reports-view">
      {/* Search and Filters */}
      <div className="reports-filter-bar">
        <div className="reports-search-wrap">
          <Search size={16} className="reports-search-icon" />
          <input
            type="text"
            placeholder={user.role === "employee" ? "Search summary or project..." : "Search employee, ID, or keywords..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="reports-search-input"
          />
        </div>
        <div className="reports-date-filter">
          <CalendarDays size={16} className="reports-date-icon" />
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="reports-date-input"
            aria-label="Filter by date"
          />
          {dateFilter && (
            <button
              type="button"
              className="reports-clear-btn"
              onClick={() => setDateFilter("")}
              title="Clear date filter"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : filteredReports.length ? (
        <div className="table-scroll">
          <table className="work-reports-table">
            <thead>
              <tr>
                {user.role !== "employee" && <th>Employee</th>}
                <th>Date</th>
                <th>Worked</th>
                <th>Work Summary</th>
                <th>Project / Task</th>
                <th>Submitted</th>
                <th>Details</th>
              </tr>
            </thead>
            <tbody>
              {filteredReports.map((report) => (
                <tr key={report.id}>
                  {user.role !== "employee" && (
                    <td>
                      <div className="report-emp-cell">
                        <strong>{report.employeeName || "Employee"}</strong>
                        <small className="table-sub">{report.companyEmployeeId || "—"}</small>
                      </div>
                    </td>
                  )}
                  <td>
                    <span className="report-date-cell">{formatDate(report.workDate)}</span>
                  </td>
                  <td>
                    <span className="report-worked-pill">{durationLabel(report.workedMinutes)}</span>
                  </td>
                  <td className="report-summary-cell">
                    <p className="report-summary-snippet" title={report.workSummary}>
                      {report.workSummary.length > 85
                        ? `${report.workSummary.slice(0, 85)}...`
                        : report.workSummary}
                    </p>
                  </td>
                  <td>
                    {report.projectReference ? (
                      <span className="project-ref-chip" title={report.projectReference}>
                        {report.projectReference}
                      </span>
                    ) : (
                      <span className="muted-cell">—</span>
                    )}
                  </td>
                  <td>
                    <span className="report-time-cell">{formatTime(report.submittedAt, timezone)}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-view-report"
                      onClick={() => setSelectedReport(report)}
                      title="View complete report"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <EmptyState
          title="No daily work reports"
          detail={
            dateFilter || search
              ? "No work reports match your search criteria. Try adjusting your filters."
              : "Completed daily work summaries will be visible here after check-out."
          }
          icon={<FileText size={22} />}
        />
      )}

      {/* Report Details Modal */}
      {selectedReport && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedReport(null);
          }}
        >
          <div className="modal-dialog report-details-modal" role="dialog" aria-modal="true" aria-labelledby="report-modal-title">
            <div className="modal-header">
              <div>
                <h3 id="report-modal-title" style={{ margin: 0, fontSize: "1.125rem", fontWeight: 700, color: "#0f172a" }}>
                  Daily Work Report
                </h3>
                <p style={{ margin: "4px 0 0", fontSize: "0.8125rem", color: "#64748b" }}>
                  {formatDate(selectedReport.workDate)} · {selectedReport.employeeName ? `${selectedReport.employeeName} (${selectedReport.companyEmployeeId})` : "Personal Report"}
                </p>
              </div>
              <button
                type="button"
                className="checkout-close-btn"
                aria-label="Close"
                onClick={() => setSelectedReport(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="modal-body" style={{ marginTop: "16px" }}>
              <div className="report-modal-meta-grid">
                <div>
                  <small>WORKED HOURS</small>
                  <strong>{durationLabel(selectedReport.workedMinutes)}</strong>
                </div>
                <div>
                  <small>CHECKOUT TYPE</small>
                  <strong>Workday Complete</strong>
                </div>
                <div>
                  <small>SUBMITTED AT</small>
                  <strong>{formatTime(selectedReport.submittedAt, timezone)}</strong>
                </div>
                {selectedReport.department && (
                  <div>
                    <small>DEPARTMENT</small>
                    <strong>{selectedReport.department}</strong>
                  </div>
                )}
              </div>

              <div className="report-detail-section" style={{ marginTop: "16px" }}>
                <h4 className="detail-section-title">
                  <FileText size={16} /> Work Summary
                </h4>
                <div className="detail-summary-box">
                  {selectedReport.workSummary}
                </div>
              </div>

              {selectedReport.projectReference && (
                <div className="report-detail-section" style={{ marginTop: "14px" }}>
                  <h4 className="detail-section-title">
                    <FolderGit2 size={16} /> Project / Task Reference
                  </h4>
                  <div className="detail-meta-box">
                    {selectedReport.projectReference}
                  </div>
                </div>
              )}

              {selectedReport.blockers && (
                <div className="report-detail-section" style={{ marginTop: "14px" }}>
                  <h4 className="detail-section-title" style={{ color: "#d97706" }}>
                    <AlertCircle size={16} /> Challenges / Blockers
                  </h4>
                  <div className="detail-meta-box blocker-box">
                    {selectedReport.blockers}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-actions" style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="checkout-btn-cancel"
                onClick={() => setSelectedReport(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
