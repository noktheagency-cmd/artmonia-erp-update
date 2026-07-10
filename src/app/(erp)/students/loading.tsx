import { Skeleton } from "@/components/ui/skeleton";

export default function StudentsLoading() {
  return (
    <section className="students-command-page students-loading" aria-label="Tələbələr yüklənir">
      <section className="students-command-shell">
        <header className="students-page-header">
          <div>
            <Skeleton className="students-skeleton-title" />
            <Skeleton className="students-skeleton-copy" />
          </div>
          <Skeleton className="students-skeleton-action" />
        </header>
        <div className="students-loading-filters">
          <Skeleton />
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </div>
      </section>
      <div className="students-kpi-grid">
        {Array.from({ length: 7 }, (_, index) => (
          <Skeleton className="students-skeleton-kpi" key={index} />
        ))}
      </div>
      <Skeleton className="students-skeleton-tabs" />
      <div className="students-analytics-grid">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton className="students-skeleton-chart" key={index} />
        ))}
      </div>
      <Skeleton className="students-skeleton-table" />
    </section>
  );
}
