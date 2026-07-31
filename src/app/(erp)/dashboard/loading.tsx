export default function DashboardLoading() {
  return (
    <section className="owner-dashboard owner-dashboard-loading" aria-label="Dashboard yüklənir">
      <header className="owner-dashboard-header">
        <div>
          <span className="owner-dashboard-skeleton owner-dashboard-skeleton-title" />
          <span className="owner-dashboard-skeleton owner-dashboard-skeleton-copy" />
        </div>
        <span className="owner-dashboard-skeleton owner-dashboard-skeleton-filter" />
      </header>

      <div className="owner-dashboard-kpi-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <span className="owner-dashboard-skeleton owner-dashboard-skeleton-kpi" key={index} />
        ))}
      </div>

      <div className="owner-dashboard-primary-grid">
        <span className="owner-dashboard-skeleton owner-dashboard-skeleton-revenue" />
      </div>
    </section>
  );
}
