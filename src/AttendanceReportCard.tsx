import { useId, useState, type KeyboardEvent } from "react";

export type AttendanceDayItem = {
  id: string;
  day: string;
  fullDate?: string;
  attendancePercent: number;
  sample?: boolean;
  isToday?: boolean;
};

const DEFAULT_ATTENDANCE_DATA: AttendanceDayItem[] = [
  { id: "tue", day: "T", fullDate: "Tuesday", attendancePercent: 78 },
  { id: "wed", day: "W", fullDate: "Wednesday", attendancePercent: 92 },
  { id: "thu", day: "T", fullDate: "Thursday", attendancePercent: 45 },
  { id: "fri", day: "F", fullDate: "Friday", attendancePercent: 70 },
  { id: "sat", day: "S", fullDate: "Saturday", attendancePercent: 51 },
  { id: "mon", day: "M", fullDate: "Monday", attendancePercent: 0, isToday: true },
];

export type AttendanceReportCardProps = {
  title?: string;
  data?: AttendanceDayItem[];
  className?: string;
  onMoreClick?: () => void;
};

export function AttendanceReportCard({
  title = "Attendance Report",
  data,
  className = "",
}: AttendanceReportCardProps) {
  const chartId = useId().replace(/:/g, "_");
  const dataset = data && data.length > 0 ? data : DEFAULT_ATTENDANCE_DATA;

  // Always default to today's item so today is highlighted and active
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

  // Geometric layout constants aligned with WorkHoursLollipopChart
  const svgWidth = 520;
  const svgHeight = 270;
  const chartLeft = 32;
  const chartRight = 488;
  const chartTop = 32;
  const chartBottom = 206;
  const badgeY = chartBottom + 30; // 236: Identical baseline to Lollipop Chart Month circles
  const plotHeight = chartBottom - chartTop; // 174
  const plotWidth = chartRight - chartLeft; // 456

  // Slim, elegant, compact capsule bars (changed from bulky 42px to 24px)
  const barWidth = 24;
  const barRadius = barWidth / 2; // 12px capsule pill radius

  const count = dataset.length;
  const step = count > 0 ? plotWidth / count : plotWidth;

  const grayPatternId = `stripes_gray_${chartId}`;
  const greenPatternId = `stripes_green_${chartId}`;
  const tooltipShadowId = `tooltip_shadow_${chartId}`;

  const bars = dataset.map((item, idx) => {
    const cx = chartLeft + (idx + 0.5) * step;
    const isHighlighted = item.id === activeSelectedId;
    const isZero = !item.attendancePercent || item.attendancePercent <= 0;

    // Calculate height proportional to attendancePercent with minimum capsule height
    const rawHeight = (Math.max(12, Math.min(100, item.attendancePercent)) / 100) * plotHeight;
    const height = Math.max(barWidth + 8, rawHeight);
    const y = chartBottom - height;

    return {
      ...item,
      cx,
      y,
      height,
      isZero,
      isHighlighted,
    };
  });

  const activeBar = bars.find((b) => b.isHighlighted && !b.isZero);

  const tooltipWidth = 48;
  const tooltipHeight = 26;
  const tooltipX = activeBar ? activeBar.cx - tooltipWidth / 2 : 0;
  const tooltipY = activeBar ? Math.max(8, activeBar.y - tooltipHeight - 8) : 0;

  return (
    <section className={`panel chart-panel attendance-report-panel attendance-svg-card ${className}`}>
      {/* Clean header with title (three dots removed per request) */}
      <div className="panel-heading chart-heading-controls">
        <div>
          <h2>{title}</h2>
        </div>
      </div>

      {/* SVG Attendance Report Chart matching Image 1 */}
      <div className="chart-wrap attendance-report-chart attendance-svg-wrapper">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="attendance-svg"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={activeBar ? `${title} chart showing ${activeBar.fullDate ?? activeBar.day} at ${activeBar.attendancePercent}% attendance.` : `${title} chart`}
        >
          <defs>
            {/* Gray diagonal stripes pattern (slanted forward slash / matching Image 1) */}
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

            {/* Vibrant Emerald Green diagonal stripes pattern for active day */}
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

            {/* Subtle soft shadow for active floating badge */}
            <filter id={tooltipShadowId} x="-20%" y="-20%" width="140%" height="150%">
              <feDropShadow dx="0" dy="3" stdDeviation="4" floodColor="#0F172A" floodOpacity="0.18" />
            </filter>
          </defs>

          {/* Striped Capsule Bars */}
          <g className="attendance-bars">
            {bars.map((bar) => {
              const patternUrl = bar.isHighlighted ? `url(#${greenPatternId})` : `url(#${grayPatternId})`;
              const strokeColor = bar.isHighlighted ? "rgba(16, 185, 129, 0.45)" : "rgba(148, 163, 184, 0.28)";

              if (bar.isZero) {
                return (
                  <g
                    key={bar.id}
                    className={`attendance-bar-group zero-attendance-group ${bar.isHighlighted ? "bar-active" : ""}`}
                    tabIndex={0}
                    role="button"
                    aria-label={`${bar.fullDate ?? bar.day}: No attendance`}
                    onClick={() => setSelectedId(bar.id)}
                    onKeyDown={(e) => handleKeySelection(e, bar.id)}
                    style={{ cursor: "pointer", outline: "none" }}
                  >
                    {/* Sleek resting dash pill representing zero attendance */}
                    <rect
                      x={bar.cx - 10}
                      y={chartBottom - 6}
                      width={20}
                      height={4}
                      rx={2}
                      fill={bar.isHighlighted ? "#94A3B8" : "#E2E8F0"}
                    />
                  </g>
                );
              }

              return (
                <g
                  key={bar.id}
                  className={`attendance-bar-group ${bar.isHighlighted ? "bar-active" : ""}`}
                  tabIndex={0}
                  role="button"
                  aria-pressed={bar.isHighlighted}
                  aria-label={`${bar.fullDate ?? bar.day}: ${bar.attendancePercent}%`}
                  onClick={() => setSelectedId(bar.id)}
                  onKeyDown={(e) => handleKeySelection(e, bar.id)}
                  style={{ cursor: "pointer", outline: "none" }}
                >
                  {/* Clean white base pill to keep stripes crisp */}
                  <rect
                    x={bar.cx - barWidth / 2}
                    y={bar.y}
                    width={barWidth}
                    height={bar.height}
                    rx={barRadius}
                    ry={barRadius}
                    fill="#FFFFFF"
                  />

                  {/* Diagonal striped compact capsule */}
                  <rect
                    x={bar.cx - barWidth / 2}
                    y={bar.y}
                    width={barWidth}
                    height={bar.height}
                    rx={barRadius}
                    ry={barRadius}
                    fill={patternUrl}
                    stroke={strokeColor}
                    strokeWidth="1"
                  />
                </g>
              );
            })}
          </g>

          {/* Floating Dark Pill Tooltip above Active Bar matching Image 1 */}
          {activeBar && (
            <g className="attendance-active-tooltip" pointerEvents="none">
              <rect
                x={tooltipX}
                y={tooltipY}
                width={tooltipWidth}
                height={tooltipHeight}
                rx={7}
                fill="#18181B"
                filter={`url(#${tooltipShadowId})`}
              />
              <text
                x={activeBar.cx}
                y={tooltipY + tooltipHeight / 2 + 1}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="#FFFFFF"
                fontSize="13"
                fontWeight="700"
                fontFamily="Inter, Manrope, -apple-system, sans-serif"
              >
                {activeBar.attendancePercent}%
              </text>
            </g>
          )}

          {/* Day Labels along bottom baseline (aligned with Month circles on left card) */}
          <g className="attendance-day-labels" aria-hidden="true">
            {bars.map((bar) => {
              const isBold = bar.isHighlighted;
              return (
                <text
                  key={`label-${bar.id}`}
                  x={bar.cx}
                  y={badgeY + 4}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill={isBold ? "#0F172A" : "#94A3B8"}
                  fontSize={isBold ? "15" : "14"}
                  fontWeight={isBold ? "750" : "500"}
                  fontFamily="Inter, Manrope, -apple-system, sans-serif"
                >
                  {bar.day}
                </text>
              );
            })}
          </g>
        </svg>
      </div>
    </section>
  );
}
