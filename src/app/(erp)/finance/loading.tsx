import { Skeleton } from "@/components/ui/skeleton";

export default function FinanceLoading() {
  return (
    <section className="finance-command-page finance-loading-page" aria-label="Maliyyə məlumatları yüklənir">
      <header className="finance-command-hero finance-loading-hero">
        <div className="finance-loading-heading">
          <div>
            <Skeleton className="finance-skeleton-title" />
            <Skeleton className="finance-skeleton-copy" />
          </div>
          <div className="finance-loading-actions">
            <Skeleton />
            <Skeleton />
          </div>
        </div>
        <div className="finance-loading-filters">
          {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} />)}
        </div>
        <div className="finance-loading-presets">
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} />)}
        </div>
      </header>
      <div className="finance-kpi-grid">
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
