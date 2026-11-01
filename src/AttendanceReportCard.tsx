import { useId, useState, type KeyboardEvent } from "react";

export type AttendanceReportStatus =
  | "not_recorded"
  | "working"
  | "on_break"
  | "completed"
  | "partial"
  | "approved_leave"
  | "weekly_off"
  | "company_holiday"
  | "exception"
  | "target_not_configured";

export type AttendanceDayItem = {
  id: string;
  day: string;
  fullDate?: string;
  attendancePercent: number | null; // null when target not configured or weekly off
  status?: AttendanceReportStatus;
  workedMinutes?: number | null;
  holidayName?: string | null;
  isToday?: boolean;
};

export type AttendanceReportCardProps = {
  title?: string;
  data?: AttendanceDayItem[];
  targetConfigured?: boolean;
  className?: string;
  onMoreClick?: () => void;
};

export function AttendanceReportCard({
  title = "Attendance Report",
  data,
  targetConfigured = true,
  className = "",
}: AttendanceReportCardProps) {
  const chartId = useId().replace(/:/g, "_");
  const dataset = data && data.length > 0 ? data : [];

  const todayItem = dataset.find((d) => d.isToday);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const activeSelectedId = selectedId && dataset.some((d) => d.id === selectedId)
    ? selectedId
    : todayItem?.id ?? dataset[dataset.length - 1]?.id ?? dataset[0]?.id ?? "";

  function handleKeySelection(event: KeyboardEvent, id: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedId(id);
    }
  }

  const svgWidth = 520;
  const svgHeight = 270;
  const chartLeft = 32;
  const chartRight = 488;
  const chartTop = 32;
  const chartBottom = 206;
  const plotHeight = chartBottom - chartTop; // 174
  const plotWidth = chartRight - chartLeft; // 456

  const barWidth = 24;
  const barRadius = barWidth / 2;

  const count = dataset.length;
  const step = count > 0 ? plotWidth / count : plotWidth;

  const grayPatternId = `stripes_gray_${chartId}`;
  const greenPatternId = `stripes_green_${chartId}`;
  const amberPatternId = `stripes_amber_${chartId}`;
  const bluePatternId = `stripes_blue_${chartId}`;
  const tooltipShadowId = `tooltip_shadow_${chartId}`;

  const bars = dataset.map((item, idx) => {
    const cx = chartLeft + (idx + 0.5) * step;
    const isHighlighted = item.id === activeSelectedId;

    const isNonWorkingDay = item.status === "weekly_off" || item.status === "company_holiday";
    const isNoRecord = item.status === "not_recorded" || (item.attendancePercent === 0 && !item.workedMinutes);
    const isTargetUnconfigured = item.attendancePercent === null && (item.workedMinutes ?? 0) > 0;
    const isZero = isNonWorkingDay || isNoRecord;

    // Proportional height
    const percentValue = item.attendancePercent ?? (isTargetUnconfigured ? Math.min(100, ((item.workedMinutes ?? 0) / 480) * 100) : 0);
    const rawHeight = (Math.max(12, Math.min(100, percentValue)) / 100) * plotHeight;
    const height = Math.max(barWidth + 8, rawHeight);
    const y = chartBottom - height;

    return {
      ...item,
      cx,
      y,
      height,
      percentValue,
      isZero,
      isNonWorkingDay,
      isTargetUnconfigured,
      isHighlighted,
    };
  });

  const selectedBar = bars.find((b) => b.isHighlighted) ?? bars[bars.length - 1];

  function getTooltipLabel(item?: typeof bars[0]) {
    if (!item) return { title: "0%", desc: "No attendance" };
    if (item.status === "weekly_off") {
      return { title: "Off Day", desc: "Weekly Off" };
    }
    if (item.status === "company_holiday") {
      return { title: "Holiday", desc: item.holidayName || "Company Holiday" };
    }
    if (item.status === "approved_leave") {
      return { title: "Leave", desc: "Approved Paid Leave" };
    }
    if (item.status === "exception") {
      return { title: "Notice", desc: "Attendance Exception" };
    }
    if (item.status === "on_break") {
      const mins = item.workedMinutes ?? 0;
      return { title: `${Math.floor(mins / 60)}h ${mins % 60}m`, desc: "On Break" };
    }
    if (item.isTargetUnconfigured) {
      const mins = item.workedMinutes ?? 0;
      return { title: `${Math.floor(mins / 60)}h ${mins % 60}m`, desc: "Target not configured" };
    }
    if (item.status === "working") {
      const mins = item.workedMinutes ?? 0;
      return { title: `${item.percentValue}%`, desc: `Working · ${Math.floor(mins / 60)}h ${mins % 60}m` };
    }
    if (item.attendancePercent !== null && item.attendancePercent > 0) {
      const mins = item.workedMinutes ?? 0;
      return {
        title: `${item.attendancePercent}%`,
        desc: mins > 0 ? `${Math.floor(mins / 60)}h ${mins % 60}m completed` : "Completed",
      };
    }
    return { title: "0%", desc: "No attendance" };
  }

  const tooltipInfo = getTooltipLabel(selectedBar);
  const tooltipWidth = 74;
  const tooltipHeight = 30;
  const tooltipX = selectedBar ? selectedBar.cx - tooltipWidth / 2 : 0;
  const tooltipY = selectedBar ? Math.max(8, selectedBar.y - tooltipHeight - 8) : 0;

  return (
    <section className={`panel chart-panel attendance-report-panel attendance-svg-card ${className}`}>
      <div className="panel-heading chart-heading-controls">
        <div>
          <h2>{title}</h2>
          {selectedBar ? (
            <p style={{ margin: "2px 0 0", fontSize: "0.8125rem", color: "#64748b" }}>
              {selectedBar.fullDate ?? selectedBar.day}:{" "}
              <strong style={{ color: "#0f172a" }}>{tooltipInfo.title}</strong>
              <span style={{ marginLeft: "6px" }}>· {tooltipInfo.desc}</span>
              {!targetConfigured && <span style={{ marginLeft: "6px", color: "#94a3b8" }}>(Target not configured)</span>}
            </p>
          ) : !targetConfigured ? (
            <p style={{ margin: "2px 0 0", fontSize: "0.8125rem", color: "#64748b" }}>
              Attendance target not configured
            </p>
          ) : null}
        </div>
      </div>

      <div className="chart-wrap attendance-report-chart attendance-svg-wrapper">
        {dataset.length === 0 ? (
          <div
            style={{
              padding: "54px 20px",
              textAlign: "center",
              color: "#64748b",
              background: "#f8fafc",
              borderRadius: "12px",
              border: "1px dashed #cbd5e1",
              margin: "12px",
            }}
          >
            <p style={{ margin: 0, fontWeight: 600, fontSize: "0.875rem" }}>
              No attendance data available for this period.
            </p>
            <p style={{ margin: "4px 0 0", fontSize: "0.8125rem" }}>
              Your attendance completion percentages will appear here once sessions are recorded.
            </p>
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="attendance-svg"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={selectedBar ? `${title} showing ${selectedBar.fullDate ?? selectedBar.day} at ${tooltipInfo.title}.` : `${title} chart`}
          >
            <defs>
              <pattern
                id={grayPatternId}
                width="10"
                height="10"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line x1="0" y1="0" x2="0" y2="10" stroke="#94A3B8" strokeWidth="2.5" />
                <line x1="10" y1="0" x2="10" y2="10" stroke="#94A3B8" strokeWidth="2.5" />
              </pattern>

              <pattern
                id={greenPatternId}
                width="10"
                height="10"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line x1="0" y1="0" x2="0" y2="10" stroke="#10B981" strokeWidth="2.5" />
                <line x1="10" y1="0" x2="10" y2="10" stroke="#10B981" strokeWidth="2.5" />
              </pattern>

              <pattern
                id={amberPatternId}
                width="10"
                height="10"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line x1="0" y1="0" x2="0" y2="10" stroke="#F59E0B" strokeWidth="2.5" />
                <line x1="10" y1="0" x2="10" y2="10" stroke="#F59E0B" strokeWidth="2.5" />
              </pattern>

              <pattern
                id={bluePatternId}
                width="10"
                height="10"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(45)"
              >
                <line x1="0" y1="0" x2="0" y2="10" stroke="#3B82F6" strokeWidth="2.5" />
                <line x1="10" y1="0" x2="10" y2="10" stroke="#3B82F6" strokeWidth="2.5" />
              </pattern>

              <filter id={tooltipShadowId} x="-20%" y="-20%" width="140%" height="150%">
                <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0F172A" floodOpacity="0.18" />
              </filter>
            </defs>

            {/* Striped Capsule Bars */}
            <g className="attendance-bars">
              {bars.map((bar) => {
                const isSelected = bar.isHighlighted;
                let patternUrl = `url(#${grayPatternId})`;
                let strokeColor = "rgba(148, 163, 184, 0.28)";

                if (bar.status === "working") {
                  patternUrl = `url(#${greenPatternId})`;
                  strokeColor = "rgba(16, 185, 129, 0.45)";
                } else if (bar.status === "on_break") {
                  patternUrl = `url(#${amberPatternId})`;
                  strokeColor = "rgba(245, 158, 11, 0.45)";
                } else if (bar.status === "approved_leave") {
                  patternUrl = `url(#${bluePatternId})`;
                  strokeColor = "rgba(59, 130, 246, 0.45)";
                } else if (isSelected) {
                  patternUrl = `url(#${greenPatternId})`;
                  strokeColor = "rgba(16, 185, 129, 0.45)";
                }

                if (bar.isZero) {
                  return (
                    <g
                      key={bar.id}
                      className={`attendance-bar-group zero-attendance-group ${isSelected ? "bar-active" : ""}`}
                      tabIndex={0}
                      role="button"
                      aria-label={`${bar.fullDate ?? bar.day}: ${bar.status === "weekly_off" ? "Weekly Off" : bar.status === "company_holiday" ? (bar.holidayName || "Holiday") : "No attendance"}`}
                      onClick={() => setSelectedId(bar.id)}
                      onKeyDown={(e) => handleKeySelection(e, bar.id)}
                      style={{ cursor: "pointer", outline: "none" }}
                    >
                      <rect
                        x={bar.cx - 10}
                        y={chartBottom - 6}
                        width={20}
                        height={4}
                        rx={2}
                        fill={isSelected ? (bar.isNonWorkingDay ? "#64748B" : "#94A3B8") : "#E2E8F0"}
                      />
                    </g>
                  );
                }

                return (
                  <g
                    key={bar.id}
                    className={`attendance-bar-group ${isSelected ? "bar-active" : ""}`}
                    tabIndex={0}
                    role="button"
                    aria-pressed={isSelected}
                    aria-label={`${bar.fullDate ?? bar.day}: ${tooltipInfo.title}`}
                    onClick={() => setSelectedId(bar.id)}
                    onKeyDown={(e) => handleKeySelection(e, bar.id)}
                    style={{ cursor: "pointer", outline: "none" }}
                  >
                    <rect
                      x={bar.cx - barWidth / 2}
                      y={bar.y}
                      width={barWidth}
                      height={bar.height}
                      rx={barRadius}
                      ry={barRadius}
                      fill="#FFFFFF"
                    />
                    <rect
                      x={bar.cx - barWidth / 2}
                      y={bar.y}
                      width={barWidth}
                      height={bar.height}
                      rx={barRadius}
                      ry={barRadius}
                      fill={patternUrl}
                      stroke={strokeColor}
                      strokeWidth="1.2"
                    />
                    {isSelected && (
                      <rect
                        x={bar.cx - barWidth / 2 - 2}
                        y={bar.y - 2}
                        width={barWidth + 4}
                        height={bar.height + 4}
                        rx={barRadius + 2}
                        ry={barRadius + 2}
                        fill="none"
                        stroke="#10B981"
                        strokeWidth="1.5"
                        opacity="0.8"
                      />
                    )}
                  </g>
                );
              })}
            </g>

            {/* Active Floating Badge matching Image 1 */}
            {selectedBar && !selectedBar.isZero && (
              <g
                className="active-floating-badge"
                transform={`translate(${tooltipX}, ${tooltipY})`}
                filter={`url(#${tooltipShadowId})`}
                aria-hidden="true"
              >
                <rect
                  x="0"
                  y="0"
                  width={tooltipWidth}
                  height={tooltipHeight}
                  rx="7"
                  fill="#0F172A"
                />
                <polygon
                  points={`${tooltipWidth / 2 - 5},${tooltipHeight} ${tooltipWidth / 2 + 5},${tooltipHeight} ${tooltipWidth / 2},${tooltipHeight + 5}`}
                  fill="#0F172A"
                />
                <text
                  x={tooltipWidth / 2}
                  y={tooltipHeight / 2 + 4.5}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize="12"
                  fontWeight="700"
                  fontFamily="inherit"
                >
                  {tooltipInfo.title}
                </text>
              </g>
            )}

            {/* Baseline X-Axis Nodes */}
            <g className="attendance-x-axis" role="tablist" aria-label="Attendance Days">
              {bars.map((bar) => {
                const isSelected = bar.isHighlighted;
                const circleRadius = 14;
                const circleY = chartBottom + 30;

                return (
                  <g
                    key={bar.id}
                    className={`axis-node ${isSelected ? "axis-node-active" : ""}`}
                    onClick={() => setSelectedId(bar.id)}
                    onKeyDown={(e) => handleKeySelection(e, bar.id)}
                    tabIndex={0}
                    role="tab"
                    aria-selected={isSelected}
                    aria-label={`${bar.fullDate ?? bar.day}: ${bar.attendancePercent}% attendance`}
                    style={{ cursor: "pointer", outline: "none" }}
                  >
                    <circle
                      cx={bar.cx}
                      cy={circleY}
                      r={circleRadius}
                      fill={
                        isSelected
                          ? bar.status === "working"
                            ? "#10B981"
                            : bar.status === "on_break"
                            ? "#F59E0B"
                            : "#0F172A"
                          : bar.isToday
                          ? "#334155"
                          : "#F1F5F9"
                      }
                      stroke={bar.isToday && !isSelected ? "#94A3B8" : "transparent"}
                      strokeWidth="1.5"
                    />
                    <text
                      x={bar.cx}
                      y={circleY + 4}
                      textAnchor="middle"
                      fill={isSelected || bar.isToday ? "#FFFFFF" : "#64748B"}
                      fontSize="12"
                      fontWeight="700"
                      fontFamily="inherit"
                    >
                      {bar.day}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>
    </section>
  );
}
