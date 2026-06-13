export function ModulePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className="page-stack module-placeholder">
      <article className="panel">
        <div className="panel-head">
          <div>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
        </div>
      </article>
    </section>
  );
}
