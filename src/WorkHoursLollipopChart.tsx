import { useId, useMemo, useState, type KeyboardEvent } from "react";

export type PeriodType = "daily" | "weekly" | "monthly";

export type WorkHoursItem = {
  id: string;
  label: string;
  fullLabel: string;
  initial: string;
  hours: number;
  workedMinutes?: number | null;
  breakMinutes?: number;
  status?: "active" | "on_break" | "completed" | "no_record" | "weekly_off" | "company_holiday";
  isToday?: boolean;
  hasRecord?: boolean;
  workdayCount?: number;
  isProvisional?: boolean;
  holidayName?: string | null;
};

export type WorkHoursLollipopChartProps = {
  title?: string;
  subtitle?: string;
  liveData?: boolean;
  period?: PeriodType;
  onPeriodChange?: (period: PeriodType) => void;
  data?: WorkHoursItem[];
  className?: string;
};

export function formatDurationHoursMins(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

export function WorkHoursLollipopChart({
  title = "Avg. Work Hours",
  period: externalPeriod,
  onPeriodChange,
  data,
  className = "",
}: WorkHoursLollipopChartProps) {
  const chartId = useId().replace(/:/g, "_");
  const [internalPeriod, setInternalPeriod] = useState<PeriodType>("daily");
  const currentPeriod = externalPeriod ?? internalPeriod;

  const dataset: WorkHoursItem[] = useMemo(() => {
    if (!data || data.length === 0) return [];
    return data.map((d, index) => ({
      id: d.id ?? `item-${index}-${d.label.toLowerCase()}`,
      label: d.label,
      fullLabel: d.fullLabel ?? d.label,
      initial: d.initial ?? (d.label.trim().charAt(0).toUpperCase() || `${index + 1}`),
      hours: typeof d.hours === "number" && !isNaN(d.hours) ? Math.max(0, d.hours) : 0,
      workedMinutes: d.workedMinutes,
      breakMinutes: d.breakMinutes,
      status: d.status ?? (d.hours > 0 ? "completed" : "no_record"),
      isToday: d.isToday,
      hasRecord: d.hasRecord ?? (d.hours > 0 || d.workedMinutes !== undefined),
      workdayCount: d.workdayCount,
      isProvisional: d.isProvisional,
      holidayName: d.holidayName,
    }));
  }, [data]);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Automatically select the active item: prefer isToday, then last item with recorded work, then last item
  const activeSelectedId = useMemo(() => {
    if (selectedId && dataset.some((d) => d.id === selectedId)) {
      return selectedId;
    }
    const todayItem = dataset.find((d) => d.isToday);
    if (todayItem) return todayItem.id;

    // Fallback to last recorded session
    const lastWithData = [...dataset].reverse().find((d) => d.hasRecord && d.hours > 0);
    if (lastWithData) return lastWithData.id;

    return dataset[dataset.length - 1]?.id ?? dataset[0]?.id ?? "";
  }, [dataset, selectedId]);

  const activeIndex = useMemo(() => {
    const idx = dataset.findIndex((d) => d.id === activeSelectedId);
    return idx >= 0 ? idx : 0;
  }, [dataset, activeSelectedId]);

  const selectedItem = dataset[activeIndex] ?? dataset[0];

  function handlePeriodSwitch(p: PeriodType) {
    if (externalPeriod === undefined) {
      setInternalPeriod(p);
    }
    setSelectedId(null);
    onPeriodChange?.(p);
  }

  function handleKeySelection(event: KeyboardEvent, id: string) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelectedId(id);
    }
  }

  // Geometry
  const svgWidth = 680;
  const svgHeight = 270;
  const chartLeft = 52;
  const chartRight = 652;
  const chartTop = 32;
  const chartBottom = 206;
  const chartPlotHeight = chartBottom - chartTop;
  const chartPlotWidth = chartRight - chartLeft;

  // Dynamic scale ensuring work hours exceeding 8h are fully visible without clipping
  const maxHoursInData = dataset.reduce((max, d) => Math.max(max, d.hours), 0);
  const maxScaleHours = Math.max(8, Math.ceil(maxHoursInData / 2) * 2);

  // Generate ticks dynamically
  const yTicks = useMemo(() => {
    const step = maxScaleHours > 12 ? 4 : 2;
    const ticks: Array<{ value: number; label: string; isBenchmark: boolean }> = [];
    for (let h = maxScaleHours; h >= 0; h -= step) {
      ticks.push({
        value: h,
        label: `${h}h`,
        isBenchmark: h === 8, // Standard 8h benchmark line
      });
    }
    return ticks;
  }, [maxScaleHours]);

  function getY(hours: number) {
    const clamped = Math.max(0, Math.min(maxScaleHours, hours));
    return chartBottom - (clamped / maxScaleHours) * chartPlotHeight;
  }

  const count = dataset.length;
  const step = count > 1 ? chartPlotWidth / count : chartPlotWidth;

  const points = dataset.map((item, idx) => {
    const cx = chartLeft + (idx + 0.5) * step;
    const isZero = !item.hasRecord || item.hours <= 0.02;
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

  const tooltipWidth = 110;
  const tooltipHeight = 34;
  const beamWidth = 28;

  const isRightEdge = selectedPoint ? selectedPoint.cx + beamWidth / 2 + tooltipWidth + 16 > chartRight : false;
  const tooltipX = selectedPoint
    ? isRightEdge
      ? selectedPoint.cx - beamWidth / 2 - tooltipWidth - 8
      : selectedPoint.cx + beamWidth / 2 + 8
    : 0;

  const benchmarkY = getY(8);
  const tooltipY = Math.max(chartTop, Math.min(chartBottom - tooltipHeight, benchmarkY - tooltipHeight / 2));

  const beamGradId = `beam_grad_${chartId}`;
  const activeBeamGradId = `active_beam_grad_${chartId}`;

  // Tooltip content formatter
  function getTooltipContent(item?: WorkHoursItem) {
    if (!item) return { title: "0h 00m", sub: "No records" };

    if (item.status === "weekly_off") {
      return { title: "Weekly Off", sub: "Scheduled off-day" };
    }
    if (item.status === "company_holiday") {
      return { title: item.holidayName || "Company Holiday", sub: "Official holiday" };
    }
    if (!item.hasRecord) {
      return { title: "No Record", sub: "No attendance logged" };
    }

    const mins = item.workedMinutes ?? Math.round(item.hours * 60);
    const formatted = formatDurationHoursMins(mins);
    const decimal = `(${item.hours.toFixed(2)}h)`;

    if (currentPeriod === "weekly" || currentPeriod === "monthly") {
      const daysLabel = item.workdayCount ? `${item.workdayCount} workdays avg` : "Average";
      return {
        title: formatted,
        sub: item.isProvisional ? `${daysLabel} (Provisional)` : daysLabel,
      };
    }

    if (item.status === "on_break") {
      return {
        title: formatted,
        sub: "On Break",
      };
    }

    if (item.status === "active") {
      return {
        title: formatted,
        sub: `Active ${decimal}`,
      };
    }

    return {
      title: formatted,
      sub: decimal,
    };
  }

  const tooltipInfo = getTooltipContent(selectedPoint);

  return (
    <section className={`panel chart-panel report-hours-panel work-hours-lollipop-card ${className}`}>
      <div className="panel-heading chart-heading-controls">
        <div>
          <h2>{title}</h2>
          {selectedItem && (
            <p style={{ margin: "2px 0 0", fontSize: "0.8125rem", color: "#64748b" }}>
              {selectedItem.fullLabel}:{" "}
              <strong style={{ color: selectedItem.hasRecord ? "#0f172a" : "#94a3b8" }}>
                {tooltipInfo.title}
              </strong>
              {tooltipInfo.sub && <span style={{ marginLeft: "6px" }}>· {tooltipInfo.sub}</span>}
            </p>
          )}
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

      <div className="chart-wrap report-hours-chart lollipop-chart-wrapper">
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
              Recorded work hours will appear here after your first completed session.
            </p>
          </div>
        ) : (
          <svg
            viewBox={`0 0 ${svgWidth} ${svgHeight}`}
            className="lollipop-svg"
            preserveAspectRatio="xMidYMid meet"
            role="img"
            aria-label={`${title} chart showing ${selectedItem?.fullLabel ?? ""} with ${tooltipInfo.title}.`}
          >
            <defs>
              {/* Luminous Orange Vertical Capsule Gradient */}
              <linearGradient id={beamGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#FFF7ED" stopOpacity="0.4" />
                <stop offset="25%" stopColor="#FED7AA" stopOpacity="0.8" />
                <stop offset="65%" stopColor="#FB923C" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#EA580C" stopOpacity="1" />
              </linearGradient>

              {/* Luminous Emerald Active Gradient */}
              <linearGradient id={activeBeamGradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ECFDF5" stopOpacity="0.4" />
                <stop offset="25%" stopColor="#A7F3D0" stopOpacity="0.8" />
                <stop offset="65%" stopColor="#34D399" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#10B981" stopOpacity="1" />
              </linearGradient>
            </defs>

            {/* Gridlines & Y-Axis */}
            <g className="chart-gridlines" aria-hidden="true">
              {yTicks.map((tick) => {
                const y = getY(tick.value);
                const isBenchmark = tick.isBenchmark;
                return (
                  <g key={tick.value} className="grid-tick">
                    <text
                      x={chartLeft - 12}
                      y={y + 4.5}
                      textAnchor="end"
                      fill={isBenchmark ? "#0F172A" : "#94A3B8"}
                      fontSize={isBenchmark ? "13" : "11.5"}
                      fontWeight={isBenchmark ? "700" : "500"}
                      fontFamily="inherit"
                    >
                      {tick.label}
                    </text>
                    <line
                      x1={chartLeft}
                      y1={y}
                      x2={chartRight}
                      y2={y}
                      stroke={isBenchmark ? "#94A3B8" : "#E2E8F0"}
                      strokeWidth={isBenchmark ? "1.4" : "1"}
                      strokeDasharray={isBenchmark ? "4 4" : "2 4"}
                    />
                  </g>
                );
              })}
            </g>

            {/* Unselected Items: Stems & Markers */}
            <g className="unselected-stems">
              {points.map((pt) => {
                if (pt.isSelected) return null;

                if (pt.isZero) {
                  return (
                    <g
                      key={pt.id}
                      className="stem-group interactive-stem zero-stem"
                      onClick={() => setSelectedId(pt.id)}
                      onKeyDown={(e) => handleKeySelection(e, pt.id)}
                      tabIndex={0}
                      role="button"
                      aria-label={`${pt.fullLabel}: No attendance recorded`}
                      style={{ cursor: "pointer", outline: "none" }}
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
                    onKeyDown={(e) => handleKeySelection(e, pt.id)}
                    tabIndex={0}
                    role="button"
                    aria-label={`${pt.fullLabel}: ${pt.hours.toFixed(2)}h`}
                    style={{ cursor: "pointer", outline: "none" }}
                  >
                    <rect
                      x={pt.cx - 18}
                      y={chartTop}
                      width="36"
                      height={chartPlotHeight + 20}
                      fill="transparent"
                    />
                    <line
                      x1={pt.cx}
                      y1={chartBottom}
                      x2={pt.cx}
                      y2={pt.cy}
                      stroke={pt.status === "active" ? "#10B981" : "#CBD5E1"}
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                    <circle
                      cx={pt.cx}
                      cy={pt.cy}
                      r="2.8"
                      fill={pt.status === "active" ? "#10B981" : "#475569"}
                    />
                  </g>
                );
              })}
            </g>

            {/* Selected Item Beam & Floating Info Tooltip */}
            {selectedPoint && (
              <g className="selected-beam-group">
                {(() => {
                  if (selectedPoint.isZero) {
                    return (
                      <>
                        <line
                          x1={selectedPoint.cx - 10}
                          y1={chartBottom}
                          x2={selectedPoint.cx + 10}
                          y2={chartBottom}
                          stroke="#64748B"
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
                            fill="#334155"
                            style={{ filter: "drop-shadow(0 4px 10px rgba(51, 65, 85, 0.25))" }}
                          />
                          <text
                            x={tooltipWidth / 2}
                            y={tooltipHeight / 2 - 2}
                            textAnchor="middle"
                            fill="#FFFFFF"
                            fontSize="11.5"
                            fontWeight="700"
                            fontFamily="inherit"
                          >
                            {tooltipInfo.title}
                          </text>
                          <text
                            x={tooltipWidth / 2}
                            y={tooltipHeight / 2 + 10}
                            textAnchor="middle"
                            fill="#94A3B8"
                            fontSize="9.5"
                            fontFamily="inherit"
                          >
                            {tooltipInfo.sub}
                          </text>
                        </g>
                      </>
                    );
                  }

                  const rx = beamWidth / 2;
                  const beamTop = Math.max(chartTop - 4, selectedPoint.cy - 14);
                  const beamBottom = chartBottom + 14;
                  const beamHeight = beamBottom - beamTop;
                  const beamX = selectedPoint.cx - beamWidth / 2;

                  const isLiveActive = selectedPoint.status === "active";
                  const fillGrad = isLiveActive ? `url(#${activeBeamGradId})` : `url(#${beamGradId})`;
                  const tooltipBg = isLiveActive ? "#10B981" : "#EA580C";

                  return (
                    <>
                      <rect
                        x={beamX}
                        y={beamTop}
                        width={beamWidth}
                        height={beamHeight}
                        rx={rx}
                        fill={fillGrad}
                      />
                      <line
                        x1={selectedPoint.cx}
                        y1={chartBottom}
                        x2={selectedPoint.cx}
                        y2={selectedPoint.cy}
                        stroke="#FFFFFF"
                        strokeWidth="2"
                        strokeLinecap="round"
                        opacity="0.95"
                      />
                      <circle
                        cx={selectedPoint.cx}
                        cy={selectedPoint.cy}
                        r="3.2"
                        fill="#0F172A"
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
                          fill={tooltipBg}
                          style={{
                            filter: isLiveActive
                              ? "drop-shadow(0 4px 10px rgba(16, 185, 129, 0.35))"
                              : "drop-shadow(0 4px 10px rgba(234, 88, 12, 0.35))",
                          }}
                        />
                        <text
                          x={tooltipWidth / 2}
                          y={tooltipHeight / 2 - 2}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="12.5"
                          fontWeight="700"
                          fontFamily="inherit"
                        >
                          {tooltipInfo.title}
                        </text>
                        <text
                          x={tooltipWidth / 2}
                          y={tooltipHeight / 2 + 10}
                          textAnchor="middle"
                          fill="rgba(255, 255, 255, 0.88)"
                          fontSize="9.5"
                          fontWeight="500"
                          fontFamily="inherit"
                        >
                          {tooltipInfo.sub}
                        </text>
                      </g>
                    </>
                  );
                })()}
              </g>
            )}

            {/* X-Axis Baseline Circles and Labels */}
            <g className="chart-x-axis" role="tablist" aria-label="Dates">
              {points.map((pt) => {
                const isSelected = pt.isSelected;
                const circleRadius = 14;
                const circleY = chartBottom + 30;

                return (
                  <g
                    key={pt.id}
                    className={`axis-node ${isSelected ? "axis-node-active" : ""}`}
                    onClick={() => setSelectedId(pt.id)}
                    onKeyDown={(e) => handleKeySelection(e, pt.id)}
                    tabIndex={0}
                    role="tab"
                    aria-selected={isSelected}
                    aria-label={`${pt.fullLabel}: ${pt.hours} hours`}
                    style={{ cursor: "pointer", outline: "none" }}
                  >
                    <circle
                      cx={pt.cx}
                      cy={circleY}
                      r={circleRadius}
                      fill={
                        isSelected
                          ? pt.status === "active"
                            ? "#10B981"
                            : "#EA580C"
                          : pt.isToday
                          ? "#0F172A"
                          : "#F1F5F9"
                      }
                      stroke={pt.isToday && !isSelected ? "#CBD5E1" : "transparent"}
                      strokeWidth="1.5"
                    />
                    <text
                      x={pt.cx}
                      y={circleY + 4}
                      textAnchor="middle"
                      fill={isSelected || pt.isToday ? "#FFFFFF" : "#475569"}
                      fontSize={11.5}
                      fontWeight="700"
                      fontFamily="inherit"
                    >
                      {pt.initial}
                    </text>
                    <text
                      x={pt.cx}
                      y={circleY + 22}
                      textAnchor="middle"
                      fill={isSelected ? "#0F172A" : "#64748B"}
                      fontSize={11}
                      fontWeight={isSelected ? "700" : "500"}
                      fontFamily="inherit"
                    >
                      {pt.label}
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
