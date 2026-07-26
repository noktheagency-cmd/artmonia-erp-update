import Link from "next/link";
import { BarChart3, CalendarDays, Target } from "lucide-react";
import { cx } from "@/components/ui/cx";

export function MarketingViewTabs({
  active,
  month,
}: {
  active: "strategy" | "results" | "content";
  month?: string;
}) {
  const monthSuffix = month ? `&month=${month}` : "";
  return (
    <nav className="marketing-view-tabs" aria-label="Marketing bölmələri">
      <Link href={`/marketing?view=strategy${monthSuffix}`} className={cx(active === "strategy" && "is-active")}>
        <Target size={16} />
        Ümumi strategiya
      </Link>
      <Link href="/marketing" className={cx(active === "results" && "is-active")}>
        <BarChart3 size={16} />
        Reklam nəticələri
      </Link>
      <Link href={`/marketing?view=content${monthSuffix}`} className={cx(active === "content" && "is-active")}>
        <CalendarDays size={16} />
        Content plan
      </Link>
    </nav>
  );
}
