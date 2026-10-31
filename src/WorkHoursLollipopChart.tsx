import { useId, useMemo, useState, type KeyboardEvent } from "react";

export type PeriodType = "daily" | "weekly" | "monthly";

export type WorkHoursItem = {
  id: string;
  label: string;
  fullLabel: string;
  initial: string;
  hours: number;
  isToday?: boolean;
};

const DEFAULT_MONTHLY_DATA: WorkHoursItem[] = [
  { id: "jan", label: "Jan", fullLabel: "January", initial: "J", hours: 5.2 },
  { id: "feb", label: "Feb", fullLabel: "February", initial: "F", hours: 1.8 },
  { id: "mar", label: "Mar", fullLabel: "March", initial: "M", hours: 6.2 },
  { id: "apr", label: "Apr", fullLabel: "April", initial: "A", hours: 7.6 },
  { id: "may", label: "May", fullLabel: "May", initial: "M", hours: 3.8 },
  { id: "jun", label: "Jun", fullLabel: "June", initial: "J", hours: 5.6 },
  { id: "jul", label: "Jul", fullLabel: "July", initial: "J", hours: 6.8 },
  { id: "aug", label: "Aug", fullLabel: "August", initial: "A", hours: 2.8 },
  { id: "sep", label: "Sep", fullLabel: "September", initial: "S", hours: 3.2 },
  { id: "oct", label: "Oct", fullLabel: "October", initial: "O", hours: 4.32, isToday: new Date().getMonth() === 9 },
  { id: "nov", label: "Nov", fullLabel: "November", initial: "N", hours: 5.0 },
  { id: "dec", label: "Dec", fullLabel: "December", initial: "D", hours: 0 },
];

const DEFAULT_WEEKLY_DATA: WorkHoursItem[] = [
  { id: "w1", label: "W1", fullLabel: "Week 1", initial: "1", hours: 6.2 },
  { id: "w2", label: "W2", fullLabel: "Week 2", initial: "2", hours: 7.1 },
  { id: "w3", label: "W3", fullLabel: "Week 3", initial: "3", hours: 6.8 },
  { id: "w4", label: "W4", fullLabel: "Week 4", initial: "4", hours: 7.9 },
  { id: "w5", label: "W5", fullLabel: "Week 5", initial: "5", hours: 7.4 },
  { id: "w6", label: "W6", fullLabel: "Week 6", initial: "6", hours: 8.0, isToday: true },
];

const DEFAULT_DAILY_DATA: WorkHoursItem[] = [
  { id: "tue", label: "Tue", fullLabel: "Tuesday", initial: "T", hours: 7.5 },
  { id: "wed", label: "Wed", fullLabel: "Wednesday", initial: "W", hours: 8.0 },
  { id: "thu", label: "Thu", fullLabel: "Thursday", initial: "T", hours: 7.2 },
  { id: "fri", label: "Fri", fullLabel: "Friday", initial: "F", hours: 8.1 },
  { id: "sat", label: "Sat", fullLabel: "Saturday", initial: "S", hours: 4.5 },
  { id: "mon", label: "Mon", fullLabel: "Monday", initial: "M", hours: 0, isToday: true },
];

function formatTooltipTime(hours: number): string {
  if (hours <= 0) return "0.00h";
  const totalSeconds = Math.round(hours * 3600);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) {
    return `${h}.${m.toString().padStart(2, "0")}.${s.toString().padStart(2, "0")}h`;
  }
  return `0.${m.toString().padStart(2, "0")}.${s.toString().padStart(2, "0")}h`;
}

export type WorkHoursLollipopChartProps = {
  title?: string;
  subtitle?: string;
  liveData?: boolean;
  period?: PeriodType;
  onPeriodChange?: (period: PeriodType) => void;
  data?: Array<{ label: string; hours: number; initial?: string; fullLabel?: string; id?: string; isToday?: boolean }>;
  monthlyData?: WorkHoursItem[];
  weeklyData?: WorkHoursItem[];
  dailyData?: WorkHoursItem[];
  className?: string;
};

export function WorkHoursLollipopChart({
  title = "Avg. Work Hours",
  period: externalPeriod,
  onPeriodChange,
  data,
  monthlyData = DEFAULT_MONTHLY_DATA,
  weeklyData = DEFAULT_WEEKLY_DATA,
  dailyData = DEFAULT_DAILY_DATA,
  className = "",
}: WorkHoursLollipopChartProps) {
  const chartId = useId().replace(/:/g, "_");
  const [internalPeriod, setInternalPeriod] = useState<PeriodType>("monthly");
  const currentPeriod = externalPeriod ?? internalPeriod;

  const dataset = useMemo(() => {
    if (data && data.length > 0) {
      return data.map((d, index) => ({
        id: d.id ?? `item-${index}-${d.label.toLowerCase()}`,
        label: d.label,
        fullLabel: d.fullLabel ?? d.label,
        initial: d.initial ?? (d.label.trim().charAt(0).toUpperCase() || `${index + 1}`),
        hours: typeof d.hours === "number" && !isNaN(d.hours) ? d.hours : 0,
        isToday: d.isToday,
      }));
    }
    switch (currentPeriod) {
      case "daily":
        return dailyData;
      case "weekly":
        return weeklyData;
      case "monthly":
      default:
        return monthlyData;
    }
  }, [data, currentPeriod, dailyData, weeklyData, monthlyData]);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Automatically select the active item: prefer isToday, then current month, then latest day
  const activeSelectedId = useMemo(() => {
    if (selectedId && dataset.some((d) => d.id === selectedId)) {
      return selectedId;
    }
    const todayItem = dataset.find((d) => d.isToday);
    if (todayItem) return todayItem.id;

    if (currentPeriod === "monthly") {
      const monthIdx = new Date().getMonth();
      const monthNames = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
      const currentMonthId = monthNames[monthIdx];
      const matchMonth = dataset.find((d) => d.id === currentMonthId || d.label.toLowerCase().startsWith(currentMonthId));
      if (matchMonth) return matchMonth.id;
    }

    return dataset[dataset.length - 1]?.id ?? dataset[0]?.id ?? "";
  }, [dataset, selectedId, currentPeriod]);

  const activeIndex = useMemo(() => {
    const idx = dataset.findIndex((d) => d.id === activeSelectedId);
    return idx >= 0 ? idx : 0;
  }, [dataset, activeSelectedId]);

  const selectedItem = dataset[activeIndex] ?? dataset[0];

  function handlePeriodSwitch(p: PeriodType) {
    if (externalPeriod === undefined) {
      setInternalPeriod(p);
    }
    onPeriodChange?.(p);
  }

  function handleKeySelection(event: KeyboardEvent, id: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedId(id);
    }
  }

  // Wide panoramic layout constants matching Image 2
  const svgWidth = 680;
  const svgHeight = 270;
  const chartLeft = 46;
  const chartRight = 652;
  const chartTop = 32;
  const chartBottom = 206;
  const chartPlotHeight = chartBottom - chartTop;
  const chartPlotWidth = chartRight - chartLeft;

  const maxScaleHours = 8;
  const yTicks = [
    { value: 8, label: "8h", isBenchmark: false },
    { value: 6, label: "6h", isBenchmark: true },
    { value: 4, label: "4h", isBenchmark: false },
    { value: 2, label: "2h", isBenchmark: false },
    { value: 0, label: "0h", isBenchmark: false },
  ];

  function getY(hours: number) {
    const clamped = Math.max(0, Math.min(maxScaleHours, hours));
    return chartBottom - (clamped / maxScaleHours) * chartPlotHeight;
  }

  // Pre-calculate X coordinates for each item
  const count = dataset.length;
  const step = count > 1 ? chartPlotWidth / count : chartPlotWidth;

  const points = dataset.map((item, idx) => {
    const cx = chartLeft + (idx + 0.5) * step;
    const isZero = !item.hours || item.hours <= 0.05;
    const cy = isZero ? chartBottom : getY(item.hours);
    const isSelected = item.id === activeSelectedId;
    return {
      ...item,
      cx,
      cy,
      isZero,
      isSelected,
    };
  });

  const selectedPoint = points[activeIndex] ?? points[0];

  // Tooltip positioned to the side of the vertical beam matching Image 2
  const tooltipWidth = 76;
  const tooltipHeight = 32;
  const beamWidth = 28;

  const isRightEdge = selectedPoint ? selectedPoint.cx + beamWidth / 2 + tooltipWidth + 16 > chartRight : false;
  const tooltipX = selectedPoint
    ? isRightEdge
      ? selectedPoint.cx - beamWidth / 2 - tooltipWidth - 8
      : selectedPoint.cx + beamWidth / 2 + 8
    : 0;

  // Vertically centered around the 6h benchmark line
  const benchmarkY = getY(6);
  const tooltipY = Math.max(chartTop, Math.min(chartBottom - tooltipHeight, benchmarkY - tooltipHeight / 2));

  // Distinct beam & glow gradient IDs
  const beamGradId = `beam_grad_${chartId}`;
  const badgeY = chartBottom + 30;

  return (
    <section className={`panel chart-panel report-hours-panel work-hours-lollipop-card ${className}`}>
      {/* Header matching Image 2: Bold title on left, dark capsule selector on right */}
      <div className="panel-heading chart-heading-controls">
        <div>
          <h2>{title}</h2>
        </div>
        <div className="chart-periods" role="group" aria-label="Work-hours chart period">
          {(["daily", "weekly", "monthly"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={currentPeriod === p ? "period-active" : ""}
              aria-pressed={currentPeriod === p}
              onClick={() => handlePeriodSwitch(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* SVG Lollipop Chart Container */}
      <div className="chart-wrap report-hours-chart lollipop-chart-wrapper">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="lollipop-svg"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`${title} chart showing ${selectedItem?.fullLabel ?? ""} with ${selectedItem?.hours.toFixed(2) ?? ""} hours recorded.`}
        >
          <defs>
            {/* Luminous Orange Vertical Capsule Gradient (Fades softly to white/pale at top, rich orange at bottom) */}
            <linearGradient id={beamGradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FFF7ED" stopOpacity="0.32" />
              <stop offset="22%" stopColor="#FED7AA" stopOpacity="0.75" />
              <stop offset="58%" stopColor="#FB923C" stopOpacity="0.95" />
              <stop offset="100%" stopColor="#EA580C" stopOpacity="1" />
            </linearGradient>
          </defs>

          {/* Gridlines & Y-Axis */}
          <g className="chart-gridlines" aria-hidden="true">
            {yTicks.map((tick) => {
              const y = getY(tick.value);
              const isBenchmark = tick.isBenchmark;
              return (
                <g key={tick.value} className="grid-tick">
                  {/* Y-axis text label */}
                  <text
                    x={chartLeft - 12}
                    y={y + 4.5}
                    textAnchor="end"
                    fill={isBenchmark ? "#0F172A" : "#94A3B8"}
                    fontSize={isBenchmark ? "13" : "12"}
                    fontWeight={isBenchmark ? "700" : "500"}
                    fontFamily="inherit"
                  >
                    {tick.label}
                  </text>
                  {/* Horizontal gridline (6h benchmark is dashed, others are subtle dotted) */}
                  <line
                    x1={chartLeft}
                    y1={y}
                    x2={chartRight}
                    y2={y}
                    stroke={isBenchmark ? "#CBD5E1" : "#E2E8F0"}
                    strokeWidth={isBenchmark ? "1.2" : "1"}
                    strokeDasharray={isBenchmark ? "4 4" : "2 4"}
                  />
                </g>
              );
            })}
          </g>

          {/* Unselected Months / Stems & Dots */}
          <g className="unselected-stems">
            {points.map((pt) => {
              if (pt.isSelected) return null;

              if (pt.isZero) {
                // Zero hours: sleek resting dash at baseline
                return (
                  <g
                    key={pt.id}
                    className="stem-group interactive-stem zero-stem"
                    onClick={() => setSelectedId(pt.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <rect
                      x={pt.cx - 18}
                      y={chartBottom - 16}
                      width="36"
                      height="32"
                      fill="transparent"
                    />
                    <line
                      x1={pt.cx - 7}
                      y1={chartBottom}
                      x2={pt.cx + 7}
                      y2={chartBottom}
                      stroke="#CBD5E1"
                      strokeWidth="2.8"
                      strokeLinecap="round"
                      className="resting-zero-dash"
                    />
                  </g>
                );
              }

              return (
                <g
                  key={pt.id}
                  className="stem-group interactive-stem"
                  onClick={() => setSelectedId(pt.id)}
                  style={{ cursor: "pointer" }}
                >
                  {/* Hit target for effortless clicking */}
                  <rect
                    x={pt.cx - 18}
                    y={chartTop}
                    width="36"
                    height={chartPlotHeight + 20}
                    fill="transparent"
                  />

                  {/* Clean thin vertical stem */}
                  <line
                    x1={pt.cx}
                    y1={chartBottom}
                    x2={pt.cx}
                    y2={pt.cy}
                    stroke="#CBD5E1"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                  />

                  {/* Top small crisp dark dot marker */}
                  <circle
                    cx={pt.cx}
                    cy={pt.cy}
                    r="2.6"
                    fill="#475569"
                  />
                </g>
              );
            })}
          </g>

          {/* Selected Month: Redesigned Capsule Beam, Center Stem, Dot & Side Tooltip matching Image 2 */}
          {selectedPoint && (
            <g className="selected-beam-group">
              {(() => {
                if (selectedPoint.isZero) {
                  // Resting state if selected month has 0h
                  return (
                    <>
                      <line
                        x1={selectedPoint.cx - 10}
                        y1={chartBottom}
                        x2={selectedPoint.cx + 10}
                        y2={chartBottom}
                        stroke="#EA580C"
                        strokeWidth="3.2"
                        strokeLinecap="round"
                      />
                      <g
                        className="floating-side-tooltip"
                        transform={`translate(${tooltipX}, ${tooltipY})`}
                        aria-hidden="true"
                      >
                        <rect
                          x="0"
                          y="0"
                          width={tooltipWidth}
                          height={tooltipHeight}
                          rx="8"
                          fill="#EA580C"
                          style={{ filter: "drop-shadow(0 4px 10px rgba(234, 88, 12, 0.3))" }}
                        />
                        <text
                          x={tooltipWidth / 2}
                          y={tooltipHeight / 2 + 4.5}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="12.5"
                          fontWeight="700"
                          fontFamily="inherit"
                        >
                          0.00h
                        </text>
                      </g>
                    </>
                  );
                }

                // Vertical capsule geometry
                const rx = beamWidth / 2;
                const beamTop = Math.max(chartTop - 4, selectedPoint.cy - 14);
                const beamBottom = chartBottom + 14;
                const beamHeight = beamBottom - beamTop;
                const beamX = selectedPoint.cx - beamWidth / 2;

                const tooltipText = formatTooltipTime(selectedPoint.hours);

                return (
                  <>
                    {/* Glowing vertical gradient capsule beam */}
                    <rect
                      x={beamX}
                      y={beamTop}
                      width={beamWidth}
                      height={beamHeight}
                      rx={rx}
                      fill={`url(#${beamGradId})`}
                    />

                    {/* Thin white vertical stem inside the center of the beam */}
                    <line
                      x1={selectedPoint.cx}
                      y1={chartBottom}
                      x2={selectedPoint.cx}
                      y2={selectedPoint.cy}
                      stroke="#FFFFFF"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      opacity="0.95"
                    />

                    {/* Small crisp dark dot at top of the stem */}
                    <circle
                      cx={selectedPoint.cx}
                      cy={selectedPoint.cy}
                      r="2.8"
                      fill="#0F172A"
                    />

                    {/* Floating Side Tooltip Box adjacent to the beam at benchmark level */}
                    <g
                      className="floating-side-tooltip"
                      transform={`translate(${tooltipX}, ${tooltipY})`}
                      aria-hidden="true"
                    >
                      <rect
                        x="0"
                        y="0"
                        width={tooltipWidth}
                        height={tooltipHeight}
                        rx="8"
                        fill="#EA580C"
                        style={{ filter: "drop-shadow(0 4px 10px rgba(234, 88, 12, 0.35))" }}
                      />
                      <text
                        x={tooltipWidth / 2}
                        y={tooltipHeight / 2 + 4.5}
                        textAnchor="middle"
                        fill="#FFFFFF"
                        fontSize="12.5"
                        fontWeight="700"
                        fontFamily="inherit"
                        letterSpacing="0.25px"
                      >
                        {tooltipText}
                      </text>
                    </g>
                  </>
                );
              })()}
            </g>
          )}

          {/* Month / Item Selectors along chart bottom */}
          <g className="month-axis-badges" role="listbox" aria-label="Select data period">
            {points.map((pt) => {
              const isSelected = pt.isSelected;

              return (
                <g
                  key={pt.id}
                  className={`month-selector-badge ${isSelected ? "selected" : ""}`}
                  tabIndex={0}
                  role="option"
                  aria-selected={isSelected}
                  aria-label={`${pt.fullLabel}: ${pt.hours.toFixed(2)} hours`}
                  onClick={() => setSelectedId(pt.id)}
                  onKeyDown={(e) => handleKeySelection(e, pt.id)}
                  style={{ cursor: "pointer", outline: "none" }}
                >
                  {/* Circular Background */}
                  <circle
                    cx={pt.cx}
                    cy={badgeY}
                    r={isSelected ? 14 : 13}
                    fill={isSelected ? "#FFFFFF" : "#F8FAFC"}
                    stroke={isSelected ? "#EA580C" : "transparent"}
                    strokeWidth={isSelected ? "2.2" : "0"}
                    className="badge-circle"
                  />

                  {/* Month Initial Text */}
                  <text
                    x={pt.cx}
                    y={badgeY + 4}
                    textAnchor="middle"
                    fill={isSelected ? "#0F172A" : "#94A3B8"}
                    fontSize={isSelected ? "12.5" : "11.5"}
                    fontWeight={isSelected ? "700" : "500"}
                    fontFamily="inherit"
                    className="badge-text"
                  >
                    {pt.initial}
                  </text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </section>
  );
}
