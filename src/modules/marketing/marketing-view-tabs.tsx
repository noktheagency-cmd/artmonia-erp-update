import Link from "next/link";
import { BarChart3, CalendarDays, LayoutDashboard, MessagesSquare, Target } from "lucide-react";
import { cx } from "@/components/ui/cx";

export function MarketingViewTabs({
  active,
  month,
}: {
  active: "dashboard" | "strategy" | "results" | "content" | "dm";
  month?: string;
}) {
  const monthSuffix = month ? `&month=${month}` : "";
  return (
    <nav className="marketing-view-tabs" aria-label="Marketing bölmələri">
      <Link href="/marketing" className={cx(active === "dashboard" && "is-active")}>
        <LayoutDashboard size={16} />
        Dashboard
      </Link>
      <Link href="/marketing?view=results" className={cx(active === "results" && "is-active")}>
        <BarChart3 size={16} />
        Reklam nəticələri
      </Link>
      <Link href={`/marketing?view=strategy${monthSuffix}`} className={cx(active === "strategy" && "is-active")}>
        <Target size={16} />
        Ümumi strategiya
      </Link>
      <Link href={`/marketing?view=content${monthSuffix}`} className={cx(active === "content" && "is-active")}>
        <CalendarDays size={16} />
        Content plan
      </Link>
      <Link href="/marketing?view=dm" className={cx(active === "dm" && "is-active")}>
        <MessagesSquare size={16} />
        DM intelligence
      </Link>
    </nav>
  );
}
