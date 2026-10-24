"use client";

import Link from "next/link";
import type { Route } from "next";
import { useSearchParams } from "next/navigation";
import { BarChart3, CalendarDays, LayoutDashboard, MessagesSquare, Target } from "lucide-react";
import { cx } from "@/components/ui/cx";

export function MarketingViewTabs({
  active,
  month,
}: {
  active: "dashboard" | "strategy" | "results" | "content" | "dm";
  month?: string;
}) {
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const selectedMonth = month || from.slice(0, 7);
  const hrefFor = (view: "dashboard" | "strategy" | "results" | "content" | "dm"): Route => {
    const params = new URLSearchParams();
    if (view !== "dashboard") params.set("view", view);
    if (from && to) {
      params.set("from", from);
      params.set("to", to);
    }
    if ((view === "strategy" || view === "content") && selectedMonth) {
      params.set("month", selectedMonth);
    }
    const query = params.toString();
    return (query ? `/marketing?${query}` : "/marketing") as Route;
  };
  return (
    <nav className="marketing-view-tabs" aria-label="Marketing bölmələri">
      <Link href={hrefFor("dashboard")} className={cx(active === "dashboard" && "is-active")}>
        <LayoutDashboard size={16} />
        Dashboard
      </Link>
      {/* <Link href={hrefFor("results")} className={cx(active === "results" && "is-active")}>
        <BarChart3 size={16} />
        Reklam nəticələri
      </Link> */}
      <Link href={hrefFor("strategy")} className={cx(active === "strategy" && "is-active")}>
        <Target size={16} />
        Ümumi strategiya
      </Link>
      {/* <Link href={hrefFor("content")} className={cx(active === "content" && "is-active")}>
        <CalendarDays size={16} />
        Content plan
      </Link> */}
      <Link href={hrefFor("dm")} prefetch={false} className={cx(active === "dm" && "is-active")}>
        <MessagesSquare size={16} />
        DM intelligence
      </Link>
    </nav>
  );
}
