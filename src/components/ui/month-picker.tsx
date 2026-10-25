"use client";

import type { CSSProperties } from "react";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { cx } from "@/components/ui/cx";
import { currentBakuDateValue } from "@/modules/students/payment-date-policy";
import { calendarYearOptions, clampCalendarMonth, isCalendarMonthAllowed } from "./calendar-range";

type MonthPickerProps = {
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  allowClear?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  "aria-label"?: string;
  className?: string;
  popoverPlacement?: "default" | "floating";
  compact?: boolean;
};

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

const monthShortNames = [
  "Yan",
  "Fev",
  "Mar",
  "Apr",
  "May",
  "İyn",
  "İyl",
  "Avq",
  "Sen",
  "Okt",
  "Noy",
  "Dek",
];

export function currentBakuMonthValue(now = new Date()) {
  return currentBakuDateValue(now).slice(0, 7);
}

export function normalizeMonthValue(value: string | undefined | null, now = new Date()) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  const isoDate = trimmed.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (isoDate) return `${isoDate[1]}-${isoDate[2]}`;
  const azDate = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
  if (azDate) return `${azDate[3]}-${azDate[2].padStart(2, "0")}`;
  if (/^\d{1,2}[./]\d{1,2}[./]\d{1,3}$/.test(trimmed)) return currentBakuMonthValue(now);
  return "";
}

export function MonthPicker({
  name,
  value,
  defaultValue,
  onValueChange,
  placeholder = "Ay seçin",
  allowClear = true,
  required,
  min,
  max,
  "aria-label": ariaLabel,
  className,
  popoverPlacement = "floating",
  compact = false,
}: MonthPickerProps) {
  const isControlled = value !== undefined;
  const [internalValue, setInternalValue] = useState(
    () => normalizeMonthValue(defaultValue) || (required ? currentBakuMonthValue() : ""),
  );
  const selectedValue = normalizeMonthValue(isControlled ? value : internalValue)
    || (required ? currentBakuMonthValue() : "");
  const [isOpen, setIsOpen] = useState(false);
  const [requestedYear, setViewYear] = useState(
    () => parseMonthValue(selectedValue)?.year ?? Number(currentBakuMonthValue().slice(0, 4)),
  );
  const viewYear = Number(clampCalendarMonth(`${requestedYear}-01`, min, max).slice(0, 4));
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
    if (!isOpen) return;

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
    if (!isOpen) return;

    const panel = popoverRef.current;
    panel?.showPopover?.();

    function updateFloatingPosition() {
      const trigger = rootRef.current?.querySelector(".date-picker-trigger");
      const popover = popoverRef.current;
      if (!(trigger instanceof HTMLElement) || !popover) return;

      const triggerRect = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const viewportPadding = 8;
      const width = Math.min(compact ? 260 : 288, viewportWidth - viewportPadding * 2);
      const maxHeight = viewportHeight - viewportPadding * 2;
      const height = Math.min(popover.offsetHeight || 320, maxHeight);
      const left = Math.max(
        viewportLeft + viewportPadding,
        Math.min(
          viewportLeft + viewportWidth - width - viewportPadding,
          triggerRect.left,
        ),
      );
      const belowTop = triggerRect.bottom + 8;
      const aboveTop = triggerRect.top - height - 8;
      const top =
        belowTop + height <= viewportTop + viewportHeight - viewportPadding
          ? belowTop
          : Math.max(
              viewportTop + viewportPadding,
              Math.min(aboveTop, viewportTop + viewportHeight - height - viewportPadding),
            );

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
    const focusMonth =
      panel?.querySelector<HTMLButtonElement>(".is-selected:not(:disabled)") ??
      panel?.querySelector<HTMLButtonElement>(".is-today:not(:disabled)") ??
      panel?.querySelector<HTMLButtonElement>(".month-picker-month:not(:disabled)");
    focusMonth?.focus({ preventScroll: true });

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

  const yearOptions = useMemo(() => calendarYearOptions(viewYear, min, max), [viewYear, min, max]);
  const todayMonth = currentBakuMonthValue();
  const selectedMonth = parseMonthValue(selectedValue);

  function updateValue(nextValue: string) {
    if (!isControlled) setInternalValue(nextValue);
    onValueChange?.(nextValue);
  }

  function selectMonth(monthIndex: number) {
    const nextValue = formatMonthValue(viewYear, monthIndex);
    if (min && nextValue < min) return;
    if (max && nextValue > max) return;
    updateValue(nextValue);
    closeCalendar();
  }

  function shiftYear(offset: number) {
    setViewYear(Number(clampCalendarMonth(`${viewYear + offset}-01`, min, max).slice(0, 4)));
  }

  function selectThisMonth() {
    const parsed = parseMonthValue(todayMonth);
    if (!parsed) return;
    if (min && todayMonth < min) return;
    if (max && todayMonth > max) return;
    setViewYear(parsed.year);
    updateValue(todayMonth);
    closeCalendar();
  }

  function clearMonth() {
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
        "month-picker-popover",
        "is-floating",
        compact && "is-compact",
      )}
      style={floatingStyle}
      role="dialog"
      aria-label={ariaLabel ?? "Ay seç"}
    >
      <div className="date-picker-head">
        <button
          type="button"
          aria-label="Əvvəlki il"
          onClick={() => shiftYear(-1)}
          disabled={Boolean(min && viewYear <= Number(min.slice(0, 4)))}
        >
          <ChevronLeft size={16} />
        </button>
        <div className="date-picker-current is-year-only" aria-label="Göstərilən il">
          <select
            aria-label="İl seç"
            value={viewYear}
            onChange={(event) => setViewYear(Number(event.target.value))}
          >
            {yearOptions.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <button
          type="button"
          aria-label="Növbəti il"
          onClick={() => shiftYear(1)}
          disabled={Boolean(max && viewYear >= Number(max.slice(0, 4)))}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="month-picker-grid">
        {monthShortNames.map((label, monthIndex) => {
          const monthValue = formatMonthValue(viewYear, monthIndex);
          if (!isCalendarMonthAllowed(monthValue, min, max)) return null;
          const isSelected =
            selectedMonth?.year === viewYear && selectedMonth.month === monthIndex;
          const isToday = monthValue === todayMonth;

          return (
            <button
              key={monthValue}
              type="button"
              className={cx(
                "month-picker-month",
                isToday && "is-today",
                isSelected && "is-selected",
              )}
              onClick={() => selectMonth(monthIndex)}
              aria-label={`${monthNames[monthIndex]} ${viewYear}`}
              aria-pressed={isSelected}
              aria-current={isToday ? "date" : undefined}
            >
              {label}
            </button>
          );
        })}
      </div>

      <div className="date-picker-footer">
        {allowClear ? (
          <button type="button" onClick={clearMonth}>
            Təmizlə
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={selectThisMonth}
          disabled={Boolean((min && todayMonth < min) || (max && todayMonth > max))}
        >
          Bu ay
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div ref={rootRef} className={cx("date-picker", "month-picker", compact && "is-compact", className)}>
      {name ? (
        <input
          type="hidden"
          name={name}
          value={selectedValue}
          required={required}
          suppressHydrationWarning
        />
      ) : null}
      <button
        ref={triggerRef}
        type="button"
        className={cx("date-picker-trigger", isOpen && "is-open", selectedValue && "has-value")}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? popoverId : undefined}
        onClick={() => {
          const parsed = parseMonthValue(selectedValue);
          if (!isOpen) setViewYear(Number(clampCalendarMonth(
            selectedValue && parsed ? selectedValue : currentBakuMonthValue(), min, max,
          ).slice(0, 4)));
          setIsOpen((current) => !current);
        }}
      >
        <Calendar size={14} className="date-icon" />
        <span>{selectedValue ? formatMonthDisplay(selectedValue) : placeholder}</span>
      </button>
      {popover}
    </div>
  );
}

function parseMonthValue(value?: string) {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!year || month < 1 || month > 12) return null;
  return { year, month: month - 1 };
}

function formatMonthValue(year: number, monthIndex: number) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function formatMonthDisplay(value: string) {
  const parsed = parseMonthValue(value);
  if (!parsed) return value;
  return `${monthNames[parsed.month]} ${parsed.year}`;
}
