"use client";

import type { CSSProperties } from "react";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { cx } from "@/components/ui/cx";
import "./time-picker.css";

type TimePickerProps = {
  name: string;
  value: string;
  onValueChange: (value: string) => void;
  required?: boolean;
  "aria-label"?: string;
};

const hours = Array.from({ length: 24 }, (_, hour) => String(hour).padStart(2, "0"));
const minuteSteps = Array.from({ length: 12 }, (_, index) => String(index * 5).padStart(2, "0"));

export function TimePicker({
  name,
  value,
  onValueChange,
  required,
  "aria-label": ariaLabel = "Saat seç",
}: TimePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [floatingStyle, setFloatingStyle] = useState<CSSProperties>({});
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();
  const { hour, minute } = splitTime(value);
  const minutes = minuteSteps.includes(minute) ? minuteSteps : [...minuteSteps, minute].sort();

  function close() {
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
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      close();
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

    function updatePosition() {
      const trigger = triggerRef.current;
      const popover = popoverRef.current;
      if (!trigger || !popover) return;
      const triggerRect = trigger.getBoundingClientRect();
      const viewport = window.visualViewport;
      const viewportWidth = viewport?.width ?? window.innerWidth;
      const viewportHeight = viewport?.height ?? window.innerHeight;
      const viewportLeft = viewport?.offsetLeft ?? 0;
      const viewportTop = viewport?.offsetTop ?? 0;
      const padding = 8;
      const width = Math.min(292, viewportWidth - padding * 2);
      const maxHeight = viewportHeight - padding * 2;
      const height = Math.min(popover.offsetHeight || 360, maxHeight);
      const left = Math.max(
        viewportLeft + padding,
        Math.min(viewportLeft + viewportWidth - width - padding, triggerRect.left),
      );
      const belowTop = triggerRect.bottom + 8;
      const aboveTop = triggerRect.top - height - 8;
      const top = belowTop + height <= viewportTop + viewportHeight - padding
        ? belowTop
        : Math.max(viewportTop + padding, Math.min(aboveTop, viewportTop + viewportHeight - height - padding));

      setFloatingStyle({
        "--picker-left": `${left}px`,
        "--picker-top": `${top}px`,
        "--picker-width": `${width}px`,
        "--picker-max-height": `${maxHeight}px`,
      } as CSSProperties);
    }

    updatePosition();
    const frameId = window.requestAnimationFrame(updatePosition);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    window.visualViewport?.addEventListener("resize", updatePosition);
    window.visualViewport?.addEventListener("scroll", updatePosition);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
      window.visualViewport?.removeEventListener("resize", updatePosition);
      window.visualViewport?.removeEventListener("scroll", updatePosition);
      panel?.hidePopover?.();
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    popoverRef.current?.querySelectorAll<HTMLElement>(".time-picker-column").forEach((column) => {
      const selected = column.querySelector<HTMLElement>(".is-selected");
      if (!selected) return;
      column.scrollTop = selected.offsetTop - column.clientHeight / 2 + selected.clientHeight / 2;
    });
  }, [isOpen, hour, minute]);

  function choose(nextHour: string, nextMinute: string) {
    onValueChange(`${nextHour}:${nextMinute}`);
  }

  const popover = isOpen ? (
    <div
      ref={popoverRef}
      id={popoverId}
      popover="manual"
      className="date-picker-popover is-floating time-picker-popover"
      style={floatingStyle}
      role="dialog"
      aria-label={ariaLabel}
    >
      <div className="time-picker-clock" aria-hidden="true">
        <strong>{hour}</strong>
        <span>:</span>
        <strong>{minute}</strong>
      </div>
      <div className="time-picker-columns">
        <div className="time-picker-column" role="listbox" aria-label="Saat">
          <span>Saat</span>
          {hours.map((item) => (
            <button
              key={item}
              type="button"
              role="option"
              aria-selected={item === hour}
              className={cx("time-picker-option", item === hour && "is-selected")}
              onClick={() => choose(item, minute)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="time-picker-column" role="listbox" aria-label="Dəqiqə">
          <span>Dəqiqə</span>
          {minutes.map((item) => (
            <button
              key={item}
              type="button"
              role="option"
              aria-selected={item === minute}
              className={cx("time-picker-option", item === minute && "is-selected")}
              onClick={() => choose(hour, item)}
            >
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className="time-picker-footer">
        <button type="button" onClick={() => onValueChange(bakuNowTime())}>İndi</button>
        <button type="button" onClick={close}>Hazır</button>
      </div>
    </div>
  ) : null;

  return (
    <div ref={rootRef} className="date-picker time-picker">
      <input type="hidden" name={name} value={normalizeTime(value)} required={required} />
      <button
        ref={triggerRef}
        type="button"
        className={cx("date-picker-trigger", "has-value", isOpen && "is-open")}
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls={isOpen ? popoverId : undefined}
        onClick={() => setIsOpen((current) => !current)}
      >
        <Clock size={14} className="date-icon" />
        <span>{normalizeTime(value)}</span>
      </button>
      {popover}
    </div>
  );
}

function splitTime(value: string) {
  const match = normalizeTime(value).match(/^(\d{2}):(\d{2})$/);
  return { hour: match?.[1] ?? "12", minute: match?.[2] ?? "00" };
}

function normalizeTime(value: string) {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return "12:00";
  const hour = Math.min(23, Math.max(0, Number(match[1])));
  const minute = Math.min(59, Math.max(0, Number(match[2])));
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function bakuNowTime() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Baku",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "12") % 24;
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? "0");
  const rounded = Math.round(minute / 5) * 5;
  const nextHour = rounded === 60 ? (hour + 1) % 24 : hour;
  const nextMinute = rounded === 60 ? 0 : rounded;
  return `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`;
}
