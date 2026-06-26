type PlaceholderMetric = {
  label: string;
  value: string;
  helper: string;
  tone?: "success" | "warning" | "danger" | "info" | "neutral";
};

type PlaceholderItem = {
  label: string;
  value: string;
};

export function ModulePlaceholder({
  title,
  description,
  metrics = defaultMetrics,
  items = defaultItems,
}: {
  title: string;
  description: string;
  metrics?: PlaceholderMetric[];
  items?: PlaceholderItem[];
}) {
  return (
    <section className="page-stack module-placeholder operational-page">
      <div className="page-heading list-heading">
        <div>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </div>

      <div className="table-toolbar section-filter-bar module-filter-bar" aria-label={`${title} filterləri`}>
        <label className="table-search">
          <span className="sr-only">Axtarış</span>
          <input placeholder="Axtarış, tarix və status üzrə baxış" disabled />
        </label>
        <div className="filter-chips module-filter-chips">
          <span>Bu ay</span>
          <span>Bütün statuslar</span>
          <span>Hazırlanır</span>
        </div>
        <div className="toolbar-actions">
          <button className="ui-button ui-button-outline ui-button-sm" type="button" disabled>
            Göstər
          </button>
          <button className="ui-button ui-button-ghost ui-button-sm" type="button" disabled>
            Təmizlə
          </button>
        </div>
      </div>

      <div className="summary-grid">
        {metrics.map((metric) => (
          <article className={`summary-card summary-${metric.tone ?? "info"}`} key={metric.label}>
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
            <small>{metric.helper}</small>
          </article>
        ))}
      </div>

      <article className="panel table-panel module-preview-panel">
        <div className="section-tabs" aria-label={`${title} bölmələri`}>
          <span className="is-active">İcmal</span>
          <span>Əməliyyatlar</span>
          <span>Tarixçə</span>
          <span>Eksport</span>
        </div>
        <div className="module-preview-list">
          {items.map((item) => (
            <div className="module-preview-row" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

const defaultMetrics: PlaceholderMetric[] = [
  { label: "Hazırlıq", value: "MVP", helper: "Data layer gözləyir", tone: "info" },
  { label: "Əməliyyat", value: "0", helper: "Canlı qeyd yoxdur", tone: "neutral" },
  { label: "Risk", value: "Yox", helper: "Bloklayan hal yoxdur", tone: "success" },
];

const defaultItems: PlaceholderItem[] = [
  { label: "Əsas iş axını", value: "Planlaşdırılıb" },
  { label: "Cədvəl görünüşü", value: "Hazırlanır" },
  { label: "Eksport və audit", value: "Növbəti mərhələ" },
];
