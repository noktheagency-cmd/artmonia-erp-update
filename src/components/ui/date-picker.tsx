"use client";

import type { CSSProperties } from "react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { currentBakuDateValue } from "@/modules/students/payment-date-policy";

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
  minValue?: string;
  maxValue?: string;
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
  defaultValue,
  onValueChange,
  placeholder = "DD.MM.YYYY",
  allowClear = true,
  required,
  "aria-label": ariaLabel,
  className,
  popoverPlacement = "floating",
  compact = false,
  minValue,
  maxValue,
}: DatePickerProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(
    () => defaultValue ?? currentBakuDateValue(),
  );
  const selectedValue = isControlled ? value : internalValue;
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(() => parsePickerDate(selectedValue) ?? new Date());
  const [floatingStyle, setFloatingStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  function closeCalendar() {
    setIsOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  }

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
        event.preventDefault();
        event.stopPropagation();
        closeCalendar();
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    // The top layer escapes scroll/transform clipping while preserving DOM
    // ancestry inside a modal's focus scope. A body portal breaks that scope.
    const panel = popoverRef.current;
    panel?.showPopover?.();

    function updateFloatingPosition() {
      const trigger = rootRef.current?.querySelector(".date-picker-trigger");
      const popover = popoverRef.current;

      if (!(trigger instanceof HTMLElement) || !popover) {
        return;
      }

      const triggerRect = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportPadding = 8;
      const width = Math.min(compact ? 288 : 324, viewportWidth - viewportPadding * 2);
      const maxHeight = viewportHeight - viewportPadding * 2;
      const height = Math.min(popover.offsetHeight || 360, maxHeight);
      const left = Math.max(viewportLeft + viewportPadding, Math.min(
        viewportLeft + viewportWidth - width - viewportPadding,
        triggerRect.left
      ));
      const belowTop = triggerRect.bottom + 8;
      const aboveTop = triggerRect.top - height - 8;
      const top = belowTop + height <= viewportTop + viewportHeight - viewportPadding
        ? belowTop
        : Math.max(viewportTop + viewportPadding, Math.min(aboveTop, viewportTop + viewportHeight - height - viewportPadding));

      setFloatingStyle({
        "--picker-left": `${left}px`,
        "--picker-top": `${top}px`,
        "--picker-width": `${width}px`,
        "--picker-max-height": `${maxHeight}px`,
      } as CSSProperties);
    }

    updateFloatingPosition();
    const frameId = window.requestAnimationFrame(updateFloatingPosition);
    window.addEventListener("resize", updateFloatingPosition);
    window.addEventListener("scroll", updateFloatingPosition, true);
    window.visualViewport?.addEventListener("resize", updateFloatingPosition);
    window.visualViewport?.addEventListener("scroll", updateFloatingPosition);
    const observer = new ResizeObserver(updateFloatingPosition);
    if (panel) observer.observe(panel);
    const focusDay = panel?.querySelector<HTMLButtonElement>(".is-selected:not(:disabled)")
      ?? panel?.querySelector<HTMLButtonElement>(".is-today:not(:disabled)")
      ?? panel?.querySelector<HTMLButtonElement>(".date-picker-day:not(:disabled)");
    focusDay?.focus({ preventScroll: true });

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateFloatingPosition);
      window.removeEventListener("scroll", updateFloatingPosition, true);
      window.visualViewport?.removeEventListener("resize", updateFloatingPosition);
      window.visualViewport?.removeEventListener("scroll", updateFloatingPosition);
      observer.disconnect();
      panel?.hidePopover?.();
    };
  }, [isOpen, compact]);

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
    const nextValue = toPickerDate(date);
    if (minValue && nextValue < minValue) return;
    if (maxValue && nextValue > maxValue) return;
    updateValue(nextValue);
    setViewDate(date);
    closeCalendar();
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
    closeCalendar();
  }

  const popover = isOpen ? (
    <div
      ref={popoverRef}
      id={popoverId}
      popover="manual"
      data-placement={popoverPlacement}
      className={cx(
        "date-picker-popover",
        "is-floating",
        compact && "is-compact"
      )}
      style={floatingStyle}
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
          const isDisabled = Boolean(
            (minValue && dayValue < minValue) || (maxValue && dayValue > maxValue),
          );

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
              disabled={isDisabled}
              aria-label={formatPickerDisplay(dayValue)}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
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
        <button
          type="button"
          onClick={selectToday}
          disabled={Boolean(
            (minValue && todayValue < minValue) || (maxValue && todayValue > maxValue),
          )}
        >
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
        ref={triggerRef}
        type="button"
        className={cx("date-picker-trigger", isOpen && "is-open", selectedValue && "has-value")}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? popoverId : undefined}
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

      {popover}
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

export { currentBakuDateValue } from "@/modules/students/payment-date-policy";

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
