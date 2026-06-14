export function RouteLoading() {
  return (
    <section className="page-stack route-loading" aria-label="Yüklənir">
      <div className="page-heading">
        <div>
          <span className="skeleton-line skeleton-label" />
          <span className="skeleton-line skeleton-title" />
          <span className="skeleton-line skeleton-copy" />
        </div>
        <span className="skeleton-pill" />
      </div>

      <div className="summary-grid">
        {Array.from({ length: 4 }, (_, index) => (
          <article className="summary-card skeleton-card" key={index}>
            <span className="skeleton-line skeleton-card-label" />
            <span className="skeleton-line skeleton-card-value" />
            <span className="skeleton-line skeleton-card-copy" />
          </article>
        ))}
      </div>

      <article className="panel skeleton-panel">
        <div className="panel-head">
          <div>
            <span className="skeleton-line skeleton-panel-title" />
            <span className="skeleton-line skeleton-panel-copy" />
          </div>
          <span className="skeleton-circle" />
        </div>
        <div className="skeleton-table">
          {Array.from({ length: 7 }, (_, index) => (
            <span className="skeleton-row" key={index} />
          ))}
        </div>
      </article>
    </section>
  );
}
