import { useEffect, useState, type FormEvent } from "react";
import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import type { AutoWorkReport, NotifyFn } from "../../types";
import { api, formatDate } from "../../services/api";
import { Button } from "../../components/ui/Button";

type Props = {
  reports: AutoWorkReport[];
  notify: NotifyFn;
  onSubmitted: () => Promise<void>;
};

export function PendingAutoReport({ reports, notify, onSubmitted }: Props) {
  const report = reports[0];
  const [summary, setSummary] = useState("");
  const [project, setProject] = useState("");
  const [blockers, setBlockers] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setSummary("");
    setProject("");
    setBlockers("");
    setError("");
  }, [report?.attendanceRecordId]);

  if (!report) return null;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = summary.trim();
    if (trimmed.length < 20 || trimmed.length > 2000) {
      setError("Summarize your completed work in 20–2,000 characters.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api("/api/attendance/auto-report", {
        method: "POST",
        body: JSON.stringify({
          attendanceRecordId: report.attendanceRecordId,
          workSummary: trimmed,
          projectReference: project.trim() || undefined,
          blockers: blockers.trim() || undefined,
        }),
      });
      notify("Daily work report submitted. Your recorded checkout time has not changed.");
      await onSubmitted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to submit your report.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="panel" aria-labelledby="auto-report-heading" style={{ marginBottom: 20 }}>
      <div className="panel-heading">
        <div>
          <h2 id="auto-report-heading"><FileText size={18} aria-hidden="true" /> Daily work report required</h2>
          <p>Automatic checkout recorded on {formatDate(report.workDate)}. Your attendance time is already saved.</p>
        </div>
        <span className="panel-badge" aria-label={report.status === "overdue" ? "Report overdue" : "Report pending"}>
          {report.status === "overdue" ? "Overdue" : "Pending"}
        </span>
      </div>
      <div className="notice notice-warning" role="status" style={{ marginBottom: 16 }}>
        <AlertTriangle size={17} aria-hidden="true" />
        <span>
          Your session closed automatically after ten elapsed hours.
          Submit a genuine summary of your work; no description has been generated on your behalf.
          {reports.length > 1 ? ` ${reports.length - 1} additional report(s) are awaiting submission.` : ""}
        </span>
      </div>
      <form onSubmit={submit} className="form-grid">
        <label className="full-width">
          <span>What did you complete during this workday? <b>*</b></span>
          <textarea rows={4} required minLength={20} maxLength={2000}
            value={summary} onChange={(e) => setSummary(e.target.value)}
            placeholder="Summarize tasks completed, deliverables, and progress." />
          <small>{summary.trim().length} / 2,000 characters</small>
        </label>
        <label>
          <span>Project or task reference (optional)</span>
          <input maxLength={255} value={project} onChange={(e) => setProject(e.target.value)}
            placeholder="e.g. Employee portal" />
        </label>
        <label>
          <span>Challenges or blockers (optional)</span>
          <input maxLength={1000} value={blockers} onChange={(e) => setBlockers(e.target.value)}
            placeholder="Anything your manager should know" />
        </label>
        {error && <p className="form-error full-width" role="alert">{error}</p>}
        <div className="full-width" style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button type="submit" disabled={saving || summary.trim().length < 20}>
            <CheckCircle2 size={16} aria-hidden="true" />
            {saving ? "Submitting…" : "Submit Daily Work Report"}
          </Button>
        </div>
      </form>
    </section>
  );
}
