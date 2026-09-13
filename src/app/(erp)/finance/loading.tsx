import { Skeleton } from "@/components/ui/skeleton";

export default function FinanceLoading() {
  return (
    <section className="finance-command-page finance-loading-page" aria-label="Maliyyə məlumatları yüklənir">
      <div className="finance-primary-kpi-grid">
        {Array.from({ length: 5 }, (_, index) => <Skeleton className="finance-skeleton-kpi" key={index} />)}
      </div>
      <Skeleton className="finance-skeleton-tabs" />
      <div className="finance-overview-grid">
        <Skeleton className="finance-skeleton-chart" />
        <Skeleton className="finance-skeleton-chart" />
      </div>
      <div className="finance-stat-grid">
        {Array.from({ length: 3 }, (_, index) => <Skeleton className="finance-skeleton-stat" key={index} />)}
      </div>
    </section>
  );
}
