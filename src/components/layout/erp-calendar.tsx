"use client";

import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { endOfMonth, startOfMonth } from "date-fns";

import {
  Pattern as ReuiRangeCalendar,
  type CompleteDateRange,
} from "@/components/examples/c-calendar-29";

export function ErpCalendar({ onNavigate }: { onNavigate: (href: string) => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRange = rangeFromSearch(searchParams) ?? currentMonthRange(new Date());
  const componentKey = `${pathname}?${searchParams.toString()}`;

  function applyRange(range: CompleteDateRange) {
    const href = moduleHrefForRange(pathname, searchParams, range);
    if (!href) return;
    onNavigate(href);
    router.push(href as Route);
  }

  // Only show the global control on list/report routes that consume its range.
  // Detail and settings pages otherwise expose a calendar that cannot apply.
  if (!supportsGlobalRange(pathname)) return null;

  return (
    <div className="shrink-0">
      <ReuiRangeCalendar
        key={componentKey}
        initialRange={initialRange}
        canApply={supportsGlobalRange(pathname)}
        onApply={applyRange}
      />
    </div>
  );
}

function currentMonthRange(reference: Date): CompleteDateRange {
  return {
    from: startOfMonth(reference),
    to: endOfMonth(reference),
  };
}

function rangeFromSearch(searchParams: URLSearchParams): CompleteDateRange | null {
  const from = parseSearchDate(searchParams.get("from"));
  const to = parseSearchDate(searchParams.get("to"));
  if (from && to) return orderRange(from, to);

  const date = parseSearchDate(searchParams.get("date"));
  if (date) return { from: date, to: date };

  const month = searchParams.get("month");
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    return currentMonthRange(parseDateKey(`${month}-01`));
  }
  return null;
}

function supportsGlobalRange(pathname: string) {
  return ["/dashboard", "/students", "/crm", "/finance", "/hr", "/groups", "/workshops", "/marketing"]
    .includes(pathname);
}

function moduleHrefForRange(
  pathname: string,
  searchParams: URLSearchParams,
  range: CompleteDateRange,
) {
  const params = new URLSearchParams(searchParams.toString());
  const from = dateKey(range.from);
  const to = dateKey(range.to);

  if (pathname === "/groups" || pathname.startsWith("/groups/")) {
    params.set("date", from);
  } else if (pathname === "/marketing" && ["content", "strategy"].includes(params.get("view") ?? "")) {
    params.set("month", from.slice(0, 7));
    params.set("from", from);
    params.set("to", to);
  } else if (supportsGlobalRange(pathname)) {
    params.set("from", from);
    params.set("to", to);
    if (pathname === "/workshops") params.set("dateRange", "all");
  } else {
    return null;
  }

  params.delete("page");
  return `${pathname}?${params.toString()}`;
}

function orderRange(from: Date, to: Date): CompleteDateRange {
  return from <= to ? { from, to } : { from: to, to: from };
}

function parseSearchDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? parseDateKey(value) : null;
}

function parseDateKey(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}
