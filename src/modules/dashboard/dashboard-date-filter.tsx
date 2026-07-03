"use client";

import type { FormEvent } from "react";
import { useMemo, useRef, useState, useTransition } from "react";
import { CalendarDays, ChevronDown, ListFilter, RotateCcw } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { DatePicker } from "@/components/ui/date-picker";

type DashboardDateFilterProps = {
  from: string;
  to: string;
  label: string;
};

type DatePreset = {
  id: string;
  label: string;
  from: string;
  to: string;
};

export function DashboardDateFilter({ from, to, label }: DashboardDateFilterProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState({ from, to });
  const popoverRef = useRef<HTMLDivElement>(null);
  const presets = useMemo(() => buildDashboardPeriodPresets(), []);

  function applyRange(nextRange = draft) {
    const orderedRange = orderRange(nextRange);
    setDraft(orderedRange);
    startTransition(() => {
      router.replace(buildDashboardPath(orderedRange) as Route, { scroll: false });
      setIsOpen(false);
    });
  }

  function applyPreset(preset: DatePreset) {
    setDraft({ from: preset.from, to: preset.to });
    applyRange({ from: preset.from, to: preset.to });
  }

  function resetRange() {
    const currentMonth = presets.find((preset) => preset.id === "current-month") ?? presets[0];
    applyPreset(currentMonth);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    applyRange();
  }

  return (
    <div className="dashboard-date-filter" ref={popoverRef}>
      <button
        className={`dark-action dashboard-date-trigger${isOpen ? " is-open" : ""}`}
        type="button"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen((current) => !current)}
      >
        <CalendarDays size={16} />
        <span>{label}</span>
        <ChevronDown size={15} />
      </button>

      {isOpen ? (
        <form className="dashboard-date-popover" onSubmit={handleSubmit}>
          <div className="dashboard-date-popover-head">
            <span>Tarix filteri</span>
            <strong>{formatRangeLabel(draft.from, draft.to)}</strong>
          </div>

          <div className="dashboard-date-fields">
            <label>
              <span>Başlanğıc</span>
              <DatePicker
                name="from"
                value={draft.from}
                onValueChange={(value) => setDraft((current) => ({ ...current, from: value }))}
                allowClear={false}
                popoverPlacement="floating"
                aria-label="Başlanğıc tarixini seç"
              />
            </label>

            <label>
              <span>Son tarix</span>
              <DatePicker
                name="to"
                value={draft.to}
                onValueChange={(value) => setDraft((current) => ({ ...current, to: value }))}
                allowClear={false}
                popoverPlacement="floating"
                aria-label="Son tarixi seç"
              />
            </label>
          </div>

          <div className="dashboard-date-presets">
            {presets.map((preset) => {
              const isActive = draft.from === preset.from && draft.to === preset.to;

              return (
                <button
                  className={isActive ? "is-active" : undefined}
                  key={preset.id}
                  type="button"
                  onClick={() => applyPreset(preset)}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>

          <div className="dashboard-date-actions">
            <button className="dashboard-date-reset" type="button" onClick={resetRange}>
              <RotateCcw size={13} />
              Sıfırla
            </button>
            <button className="dashboard-date-apply" type="submit" disabled={isPending}>
              <ListFilter size={13} />
              {isPending ? "Yenilənir..." : "Göstər"}
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function buildDashboardPath(range: { from: string; to: string }) {
  const params = new URLSearchParams();

  if (range.from) {
    params.set("from", range.from);
  }

  if (range.to) {
    params.set("to", range.to);
  }

  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

function buildDashboardPeriodPresets(): DatePreset[] {
  const today = startOfLocalDay(new Date());
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const previousMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const previousMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
  const last30Start = addLocalDays(today, -29);

  return [
    { id: "today", label: "Bu gün", from: toDateInput(today), to: toDateInput(today) },
    { id: "current-month", label: "Bu ay", from: toDateInput(monthStart), to: toDateInput(today) },
    { id: "last-30", label: "Son 30 gün", from: toDateInput(last30Start), to: toDateInput(today) },
    { id: "previous-month", label: "Keçən ay", from: toDateInput(previousMonthStart), to: toDateInput(previousMonthEnd) },
  ];
}

function orderRange(range: { from: string; to: string }) {
  if (!range.from || !range.to || range.from <= range.to) {
    return range;
  }

  return { from: range.to, to: range.from };
}

function formatRangeLabel(from: string, to: string) {
  if (from === to) {
    return formatDateInput(from);
  }

  return `${formatDateInput(from)} - ${formatDateInput(to)}`;
}

function formatDateInput(value: string) {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return "Tarix seçilməyib";
  }

  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
}

function startOfLocalDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addLocalDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function toDateInput(value: Date) {
  return [
    value.getFullYear().toString(),
    (value.getMonth() + 1).toString().padStart(2, "0"),
    value.getDate().toString().padStart(2, "0"),
  ].join("-");
}
