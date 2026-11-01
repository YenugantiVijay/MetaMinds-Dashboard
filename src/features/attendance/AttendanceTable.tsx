import type { Attendance } from "../../types";
import { formatDate, formatTime, durationLabel } from "../../services/api";
import { EmptyState } from "../../components/ui/EmptyState";
import { StatusPill } from "../../components/ui/StatusPill";

export interface AttendanceTableProps {
  rows: Attendance[];
  own?: boolean;
  timezone?: string;
}

export function AttendanceTable({ rows, own = false, timezone }: AttendanceTableProps) {
  if (!rows.length) {
    return (
      <EmptyState
        title="No attendance records"
        detail="Check-in records will appear here after staff activity."
      />
    );
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {!own && <th>Staff member</th>}
            <th>Date</th>
            <th>Check in</th>
            <th>Check out</th>
            <th>Duration</th>
            <th>Progress</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.employeeId || "own"}-${row.date}`}>
              {!own && (
                <td>
                  <strong>{row.name}</strong>
                  <small>{row.employeeId}</small>
                </td>
              )}
              <td>{formatDate(row.date)}</td>
              <td>{formatTime(row.checkIn, timezone)}</td>
              <td>{formatTime(row.checkOut, timezone)}</td>
              <td>{durationLabel(row.workedMinutes)}</td>
              <td>
                <span className="progress-cell">
                  <span className="progress-bar">
                    <span
                      className={`progress-fill ${row.progress?.complete ? "fill-complete" : ""}`}
                      style={{ width: `${row.progress?.percentage ?? 0}%` }}
                    />
                  </span>
                  <small>{row.progress?.percentage !== null ? `${row.progress?.percentage}%` : "—"}</small>
                </span>
              </td>
              <td>
                <StatusPill
                  status={row.exceptionStatus || (row.checkOut ? "present" : "in_progress")}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
