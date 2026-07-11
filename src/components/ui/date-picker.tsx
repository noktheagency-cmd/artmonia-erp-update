"use client";

import type { CSSProperties } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "@/components/ui/cx";

type DatePickerProps = {
  name: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  required?: boolean;
  "aria-label"?: string;
  className?: string;
  popoverPlacement?: "default" | "floating";
  compact?: boolean;
};

const weekDays = ["B.e", "Ç.a", "Ç", "C.a", "C", "Ş", "B"];
const monthNames = [
  "Yanvar",
  "Fevral",
  "Mart",
  "Aprel",
  "May",
  "İyun",
  "İyul",
  "Avqust",
  "Sentyabr",
  "Oktyabr",
  "Noyabr",
  "Dekabr",
];

export function DatePicker({
  name,
  value,
  defaultValue = "",
  onValueChange,
  placeholder = "DD.MM.YYYY",
  allowClear = true,
  required,
  "aria-label": ariaLabel,
  className,
  popoverPlacement = "default",
  compact = false,
}: DatePickerProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(defaultValue);
  const selectedValue = isControlled ? value : internalValue;
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => parsePickerDate(selectedValue) ?? new Date());
  const [floatingStyle, setFloatingStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;

      if (!rootRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setIsOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || popoverPlacement !== "floating") {
      return;
    }

    function updateFloatingPosition() {
      const trigger = rootRef.current?.querySelector(".date-picker-trigger");
      const popover = popoverRef.current;

      if (!(trigger instanceof HTMLElement) || !popover) {
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const width = popover.offsetWidth || 324;
      const height = popover.offsetHeight || 360;
      const viewportPadding = 16;
      const left = Math.min(
        window.innerWidth - width - viewportPadding,
        Math.max(viewportPadding, triggerRect.left + triggerRect.width / 2 - width / 2)
      );
      const belowTop = triggerRect.bottom + 12;
      const aboveTop = triggerRect.top - height - 12;
      const top = belowTop + height <= window.innerHeight - viewportPadding
        ? belowTop
        : Math.max(viewportPadding, aboveTop);

      setFloatingStyle({ left, top });
    }

    updateFloatingPosition();
    const frameId = window.requestAnimationFrame(updateFloatingPosition);
    window.addEventListener("resize", updateFloatingPosition);
    window.addEventListener("scroll", updateFloatingPosition, true);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateFloatingPosition);
      window.removeEventListener("scroll", updateFloatingPosition, true);
    };
  }, [isOpen, popoverPlacement]);

  const calendarDays = useMemo(() => buildCalendarDays(viewDate), [viewDate]);
  const yearOptions = useMemo(() => buildYearOptions(viewDate), [viewDate]);
  const todayValue = toPickerDate(new Date());
  const selectedDate = parsePickerDate(selectedValue);

  function updateValue(nextValue: string) {
    if (!isControlled) {
      setInternalValue(nextValue);
    }
    onValueChange?.(nextValue);
  }

  function selectDate(date: Date) {
    updateValue(toPickerDate(date));
    setViewDate(date);
    setIsOpen(false);
  }

  function shiftMonth(monthOffset: number) {
    setViewDate((current) => new Date(current.getFullYear(), current.getMonth() + monthOffset, 1));
  }

  function selectMonth(month: number) {
    setViewDate((current) => new Date(current.getFullYear(), month, 1));
  }

  function selectYear(year: number) {
    setViewDate((current) => new Date(year, current.getMonth(), 1));
  }

  function selectToday() {
    selectDate(new Date());
  }

  function clearDate() {
    updateValue("");
    setIsOpen(false);
  }

  const popover = isOpen ? (
    <div
      ref={popoverRef}
      className={cx(
        "date-picker-popover",
        popoverPlacement === "floating" && "is-floating",
        compact && "is-compact"
      )}
      style={popoverPlacement === "floating" ? floatingStyle : undefined}
      role="dialog"
      aria-label={ariaLabel ?? "Tarix sec"}
    >
      <div className="date-picker-head">
        <button type="button" aria-label="Əvvəlki ay" onClick={() => shiftMonth(-1)}>
          <ChevronLeft size={16} />
        </button>
        <div className="date-picker-current" aria-label="Göstərilən ay və il">
          <select
            aria-label="Ay seç"
            value={viewDate.getMonth()}
            onChange={(event) => selectMonth(Number(event.target.value))}
          >
            {monthNames.map((month, index) => (
              <option key={month} value={index}>
                {month}
              </option>
            ))}
          </select>
          <select
            aria-label="İl seç"
            value={viewDate.getFullYear()}
            onChange={(event) => selectYear(Number(event.target.value))}
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <button type="button" aria-label="Növbəti ay" onClick={() => shiftMonth(1)}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="date-picker-weekdays">
        {weekDays.map((day, index) => (
          <span key={`${day}-${index}`}>{day}</span>
        ))}
      </div>

      <div className="date-picker-grid">
        {calendarDays.map((day) => {
          const dayValue = toPickerDate(day.date);
          const isSelected = selectedDate ? dayValue === toPickerDate(selectedDate) : false;
          const isToday = dayValue === todayValue;

          return (
            <button
              key={dayValue}
              type="button"
              className={cx(
                "date-picker-day",
                !day.isCurrentMonth && "is-muted",
                isToday && "is-today",
                isSelected && "is-selected",
              )}
              onClick={() => selectDate(day.date)}
            >
              {day.date.getDate()}
            </button>
          );
        })}
      </div>

      <div className="date-picker-footer">
        {allowClear ? (
          <button type="button" onClick={clearDate}>
            Təmizlə
          </button>
        ) : (
          <span />
        )}
        <button type="button" onClick={selectToday}>
          Bu gün
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={cx("date-picker", compact && "is-compact", className)}>
      <input
        type="hidden"
        name={name}
        value={selectedValue}
        required={required}
        suppressHydrationWarning
      />
      <button
        type="button"
        className={cx("date-picker-trigger", isOpen && "is-open", selectedValue && "has-value")}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        onClick={() => {
          const parsed = parsePickerDate(selectedValue);
          if (!isOpen && parsed) {
            setViewDate(parsed);
          }
          setIsOpen((current) => !current);
        }}
      >
        <Calendar size={14} className="date-icon" />
        <span>{selectedValue ? formatPickerDisplay(selectedValue) : placeholder}</span>
      </button>

      {popoverPlacement === "floating" && typeof document !== "undefined"
        ? createPortal(popover, document.body)
        : popover}
    </div>
  );
}

function buildCalendarDays(viewDate: Date) {
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const startDate = new Date(year, month, 1 - startOffset);

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + index);

    return {
      date,
      isCurrentMonth: date.getMonth() === month,
    };
  });
}

function buildYearOptions(viewDate: Date) {
  const currentYear = viewDate.getFullYear();
  const startYear = currentYear - 8;

  return Array.from({ length: 17 }, (_, index) => startYear + index);
}

function parsePickerDate(value?: string) {
  if (!value) {
    return null;
  }

  const trimmedValue = value.trim();
  const displayMatch = trimmedValue.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  const [year, month, day] = displayMatch
    ? [Number(displayMatch[3]), Number(displayMatch[2]), Number(displayMatch[1])]
    : trimmedValue.split("-").map(Number);

  if (!year || !month || !day) {
    return null;
  }

  return new Date(year, month - 1, day);
}

function toPickerDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatPickerDisplay(value: string) {
  const parsed = parsePickerDate(value);
  if (!parsed) {
    return value;
  }

  const day = String(parsed.getDate()).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const year = parsed.getFullYear();

  return `${day}.${month}.${year}`;
}
