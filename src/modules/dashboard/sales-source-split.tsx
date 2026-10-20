/**
 * BK-21 / daily report: visible CRM vs Birbaşa + Yeni vs Qayıdış split.
 * Uses existing `.sales-source-split` styles in globals.css.
 */
export function SalesSourceSplit({
  crmSales,
  directSales,
  newSales,
  returnSales,
}: {
  crmSales: number;
  directSales: number;
  newSales: number;
  returnSales: number;
}) {
  const routeTotal = Math.max(crmSales + directSales, 0);
  const kindTotal = Math.max(newSales + returnSales, 0);
  const crmPct = routeTotal > 0 ? Math.round((crmSales / routeTotal) * 100) : 0;
  const directPct = routeTotal > 0 ? 100 - crmPct : 0;
  const newPct = kindTotal > 0 ? Math.round((newSales / kindTotal) * 100) : 0;
  const returnPct = kindTotal > 0 ? 100 - newPct : 0;

  return (
    <div className="sales-source-split" aria-label="Satış mənbəyi bölgüsü">
      <h4>Mənbə · CRM / Birbaşa</h4>
      <div className="split-progress-bar" role="img" aria-label={`CRM ${crmPct}%, Birbaşa ${directPct}%`}>
        {crmPct > 0 ? <span className="split-segment segment-consult" style={{ width: `${crmPct}%` }} /> : null}
        {directPct > 0 ? <span className="split-segment segment-direct" style={{ width: `${directPct}%` }} /> : null}
      </div>
      <div className="split-labels">
        <span>CRM {crmSales} ({crmPct}%)</span>
        <span>Birbaşa {directSales} ({directPct}%)</span>
      </div>

      <h4 style={{ marginTop: 12 }}>Növ · Yeni / Qayıdış</h4>
      <div className="split-progress-bar" role="img" aria-label={`Yeni ${newPct}%, Qayıdış ${returnPct}%`}>
        {newPct > 0 ? <span className="split-segment segment-direct" style={{ width: `${newPct}%` }} /> : null}
        {returnPct > 0 ? <span className="split-segment segment-consult" style={{ width: `${returnPct}%` }} /> : null}
      </div>
      <div className="split-labels">
        <span>Yeni {newSales} ({newPct}%)</span>
        <span>Qayıdış {returnSales} ({returnPct}%)</span>
      </div>
    </div>
  );
}
