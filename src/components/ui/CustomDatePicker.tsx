import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

export const CAL_MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

export const CAL_WEEKDAY_NAMES = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function formatDateDisplay(isoDate?: string): string {
  if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return "";
  const [y, m, d] = isoDate.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

export interface CustomDatePickerProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  required?: boolean;
  minDate?: string;
  maxDate?: string;
  disabled?: boolean;
}

export function CustomDatePicker({
  value,
  onChange,
  placeholder = "Select date",
  required,
  minDate,
  maxDate,
  disabled,
}: CustomDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const initialDate = useMemo(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split("-").map(Number);
      return new Date(y, m - 1, d);
    }
    return new Date();
  }, [value]);

  const [viewYear, setViewYear] = useState(initialDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(initialDate.getMonth());

  useEffect(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m] = value.split("-").map(Number);
      setViewYear(y);
      setViewMonth(m - 1);
    }
  }, [value]);

  useEffect(() => {
    function handlePointerDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handlePointerDown);
    }
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isOpen]);

  const todayStr = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, "0");
    const d = String(now.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }, []);

  function handlePrevMonth() {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((prev) => prev - 1);
    } else {
      setViewMonth((prev) => prev - 1);
    }
  }

  function handleNextMonth() {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((prev) => prev + 1);
    } else {
      setViewMonth((prev) => prev + 1);
    }
  }

  function selectDate(isoString: string) {
    onChange(isoString);
    setIsOpen(false);
  }

  const calendarDays = useMemo(() => {
    const firstDayIndex = new Date(viewYear, viewMonth, 1).getDay();
    const daysInCurrentMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const days: Array<{
      dateStr: string;
      dayNum: number;
      isCurrentMonth: boolean;
      isDisabled: boolean;
    }> = [];

    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = daysInPrevMonth - i;
      const prevM = viewMonth === 0 ? 12 : viewMonth;
      const prevY = viewMonth === 0 ? viewYear - 1 : viewYear;
      const dateStr = `${prevY}-${String(prevM).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
      days.push({
        dateStr,
        dayNum,
        isCurrentMonth: false,
        isDisabled: Boolean((minDate && dateStr < minDate) || (maxDate && dateStr > maxDate)),
      });
    }

    for (let d = 1; d <= daysInCurrentMonth; d++) {
      const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      days.push({
        dateStr,
        dayNum: d,
        isCurrentMonth: true,
        isDisabled: Boolean((minDate && dateStr < minDate) || (maxDate && dateStr > maxDate)),
      });
    }

    const totalCells = days.length <= 35 ? 35 : 42;
    const remaining = totalCells - days.length;
    for (let n = 1; n <= remaining; n++) {
      const nextM = viewMonth === 11 ? 1 : viewMonth + 2;
      const nextY = viewMonth === 11 ? viewYear + 1 : viewYear;
      const dateStr = `${nextY}-${String(nextM).padStart(2, "0")}-${String(n).padStart(2, "0")}`;
      days.push({
        dateStr,
        dayNum: n,
        isCurrentMonth: false,
        isDisabled: Boolean((minDate && dateStr < minDate) || (maxDate && dateStr > maxDate)),
      });
    }

    return days;
  }, [viewYear, viewMonth, minDate, maxDate]);

  return (
    <div className={`custom-datepicker ${disabled ? "datepicker-disabled" : ""}`} ref={containerRef}>
      <button
        type="button"
        className={`datepicker-trigger ${isOpen ? "datepicker-trigger-active" : ""} ${value ? "datepicker-has-value" : ""}`}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span className="datepicker-trigger-icon">
          <CalendarDays size={16} />
        </span>
        <span className="datepicker-trigger-text">
          {value ? formatDateDisplay(value) : placeholder}
        </span>
        <span className="datepicker-trigger-arrow">
          <ChevronDown size={14} className={isOpen ? "arrow-rotate" : ""} />
        </span>
      </button>

      <input
        type="text"
        value={value}
        required={required}
        readOnly
        style={{ opacity: 0, position: "absolute", width: 1, height: 1, pointerEvents: "none" }}
        tabIndex={-1}
      />

      {isOpen && (
        <div className="cal-popover" role="dialog" aria-label="Choose date">
          <div className="cal-header">
            <span className="cal-month-title">
              {CAL_MONTH_NAMES[viewMonth]}, {viewYear}
            </span>
            <div className="cal-nav-group">
              <button
                type="button"
                className="cal-nav-btn"
                onClick={handlePrevMonth}
                aria-label="Previous month"
              >
                <ChevronLeft size={15} />
              </button>
              <button
                type="button"
                className="cal-nav-btn"
                onClick={handleNextMonth}
                aria-label="Next month"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          </div>

          <div className="cal-weekdays">
            {CAL_WEEKDAY_NAMES.map((d) => (
              <span key={d} className="cal-weekday-label">
                {d}
              </span>
            ))}
          </div>

          <div className="cal-days-grid">
            {calendarDays.map((item) => {
              const isSelected = item.dateStr === value;
              const isToday = item.dateStr === todayStr;
              return (
                <button
                  type="button"
                  key={item.dateStr}
                  className={[
                    "cal-day-cell",
                    item.isCurrentMonth ? "cal-day-current" : "cal-day-outside",
                    isSelected ? "cal-day-selected" : "",
                    isToday ? "cal-day-today" : "",
                    item.isDisabled ? "cal-day-disabled" : "",
                  ].filter(Boolean).join(" ")}
                  disabled={item.isDisabled}
                  onClick={() => selectDate(item.dateStr)}
                >
                  <span>{item.dayNum}</span>
                </button>
              );
            })}
          </div>

          <div className="cal-footer">
            <button
              type="button"
              className="cal-footer-btn cal-clear-btn"
              onClick={() => { onChange(""); setIsOpen(false); }}
            >
              Clear
            </button>
            <button
              type="button"
              className="cal-footer-btn cal-today-btn"
              onClick={() => selectDate(todayStr)}
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
