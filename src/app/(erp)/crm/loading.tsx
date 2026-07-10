import { Skeleton } from "@/components/ui/skeleton";

export default function CrmLoading() {
  return (
    <section className="crm-command-page crm-loading-page" aria-label="Yüklənir">
      <header className="crm-command-header">
        <div><Skeleton className="crm-skeleton-title" /><Skeleton className="crm-skeleton-copy" /></div>
        <Skeleton className="crm-skeleton-action" />
      </header>
      <div className="crm-filter-panel">
        <Skeleton className="crm-skeleton-filter" />
        <Skeleton className="crm-skeleton-filter-secondary" />
      </div>
      <div className="crm-metrics-grid">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton className="crm-skeleton-metric" key={index} />
        ))}
      </div>
      <Skeleton className="crm-skeleton-tabs" />
      <div className="crm-overview-grid">
        <Skeleton className="crm-skeleton-panel is-wide" />
        <Skeleton className="crm-skeleton-panel" />
        <Skeleton className="crm-skeleton-panel is-half" />
        <Skeleton className="crm-skeleton-panel" />
        <Skeleton className="crm-skeleton-panel" />
      </div>
    </section>
  );
}
