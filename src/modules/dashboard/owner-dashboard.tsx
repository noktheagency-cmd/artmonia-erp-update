import { ArrowUpRight, CheckCircle2, CircleDollarSign, Clock3, UsersRound } from "lucide-react";
import type { DashboardData } from "@/modules/dashboard/queries";
import { StatusChip } from "@/components/ui/status-chip";

export function OwnerDashboard({ data }: { data: DashboardData }) {
  return (
    <section className="page-stack dashboard-page">
      <div className="page-heading">
        <div>
          <p className="eyeless-label">Artmonia studio operations</p>
          <h1>Salam, Artmonia</h1>
          <p>Bugünkü fəaliyyət, müraciətlər, borclar və tapşırıqların cari vəziyyəti.</p>
        </div>

        <button className="dark-action" type="button">
          Bu ay
          <ArrowUpRight size={16} />
        </button>
      </div>

      <div className="dashboard-grid">
        {/* KPI Grid */}
        <div className="kpi-grid">
          {data.kpis.map((item) => (
            <article className={`metric-card ${item.tone === "primary" ? "metric-primary" : ""}`} key={item.label}>
              <button className="corner-action" type="button" aria-label={`${item.label} aç`}>
                <ArrowUpRight size={16} />
              </button>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <div className="metric-footer">
                <em>{item.delta}</em>
                <small>{item.helper}</small>
              </div>
            </article>
          ))}
        </div>

        {/* Revenue dynamic chart */}
        <article className="panel chart-panel">
          <div className="panel-head">
            <div>
              <h2>Gəlir dinamikası</h2>
              <p>Son 6 ayın ödəniş trendi</p>
            </div>
            <button className="round-dark" type="button" aria-label="Gəlir hesabatı aç">
              <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="bar-chart" aria-label="Gəlir bar qrafiki">
            {data.revenueBars.map((bar) => (
              <div className="bar-item" key={bar.label}>
                <div className="bar-track">
                  <span style={{ height: `${bar.value}%` }} title={bar.amount} />
                </div>
                <small>{bar.label}</small>
              </div>
            ))}
          </div>
        </article>

        {/* Debt aging conic donut */}
        <article className="panel donut-panel">
          <div className="panel-head compact">
            <div>
              <h2>Gecikən borclar</h2>
              <p>Faktura qalıqlarının müddəti</p>
            </div>
            <Clock3 size={18} />
          </div>
          <div className="donut-row">
            <div
              className="donut"
              style={{
                background: buildDebtGradient(data.debtAging),
              }}
            >
              <div className="donut-center-content">
                <span className="donut-center-label">Cəmi Borc</span>
                <span className="donut-center-amount">
                  {data.debtCenter.split(" ")[0]}
                </span>
                <span className="donut-center-currency">
                  {data.debtCenter.split(" ")[1] ?? "AZN"}
                </span>
              </div>
            </div>
            <div className="legend-stack">
              {data.debtAging.map((item) => (
                <div className="legend-item" key={item.label}>
                  <div className="legend-label-group">
                    <i style={{ backgroundColor: item.color }} />
                    <span className="legend-label">{item.label}</span>
                  </div>
                  <strong className="legend-amount">{item.amount}</strong>
                </div>
              ))}
            </div>
          </div>
        </article>

        {/* Recent payments table */}
        <article className="panel recent-payments-panel">
          <div className="panel-head">
            <div>
              <h2>Son ödənişlər</h2>
              <p>Sistemə daxil edilmiş son 5 ödəniş</p>
            </div>
          </div>
          <div className="recent-payments-table-wrap">
            <table className="recent-payments-table">
              <thead>
                <tr>
                  <th>Tələbə</th>
                  <th>Məbləğ</th>
                  <th>Tarix</th>
                  <th>Metod</th>
                </tr>
              </thead>
              <tbody>
                {data.recentPayments.length > 0 ? (
                  data.recentPayments.map((payment) => (
                    <tr key={payment.id}>
                      <td>
                        <div className="recent-payee">
                          <strong>{payment.studentName}</strong>
                          <span>{payment.studentCode}</span>
                        </div>
                      </td>
                      <td>
                        <strong className="payment-positive">{payment.amount}</strong>
                      </td>
                      <td>{payment.paidAt}</td>
                      <td>
                        <span className="payment-method-chip">{payment.method}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="recent-payments-empty">
                      Ödəniş tapılmadı
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        {/* Programs analytics */}
        <article className="panel program-stats-panel">
          <div className="panel-head">
            <div>
              <h2>Proqram təhlili</h2>
              <p>Proqramlar üzrə aktiv tələbələr</p>
            </div>
          </div>
          <div className="program-stats-list">
            {data.programStats.length > 0 ? (
              data.programStats.map((prog) => (
                <div className="program-stat-item" key={prog.name}>
                  <div className="program-stat-header">
                    <span>{prog.name}</span>
                    <strong>{prog.count} tələbə ({prog.percentage}%)</strong>
                  </div>
                  <div className="program-stat-track">
                    <div className="program-stat-bar" style={{ width: `${prog.percentage}%` }} />
                  </div>
                </div>
              ))
            ) : (
              <div className="program-stats-empty">Məlumat yoxdur</div>
            )}
          </div>
        </article>

        {/* Student lifecycle status counts */}
        <article className="panel status-breakdown-panel">
          <div className="panel-head">
            <div>
              <h2>Tələbə statusları</h2>
              <p>Cari status paylanması</p>
            </div>
          </div>
          <div className="status-breakdown-list">
            {data.studentStatusCounts.map((status) => (
              <div className="status-breakdown-item" key={status.label}>
                <StatusChip tone={status.tone}>{status.label}</StatusChip>
                <strong>{status.count} nəfər</strong>
              </div>
            ))}
          </div>
        </article>

        {/* Today's Tasks */}
        <article className="panel task-panel">
          <div className="mini-icon">
            <CheckCircle2 size={18} />
          </div>
          <strong>Günün tapşırıqları</strong>
          <ul>
            {data.tasks.length > 0 ? (
              data.tasks.map((task) => (
                <li key={task}>{task}</li>
              ))
            ) : (
              <li className="tasks-empty">Tapşırıq tapılmadı</li>
            )}
          </ul>
        </article>

        {/* Teacher Payout Preview */}
        <article className="panel payout-panel">
          <div className="mini-icon">
            <CircleDollarSign size={18} />
          </div>
          <strong>Müəllim maaş fondu</strong>
          <div className="big-number">{data.payoutPreview}</div>
          <p>{data.payoutHelper}</p>
        </article>

        {/* Waiting Leads banner */}
        <article className="panel people-panel">
          <UsersRound size={20} />
          <strong>{data.waitingFamilies} ailə cavab gözləyir</strong>
          <p>{data.waitingHelper}</p>
        </article>
      </div>
    </section>
  );
}

function buildDebtGradient(data: DashboardData["debtAging"]) {
  let start = 0;
  const stops = data
    .filter((item) => item.value > 0)
    .map((item) => {
      const end = start + item.value;
      const stop = `${item.color} ${start}% ${end}%`;
      start = end;
      return stop;
    });

  if (stops.length === 0) {
    return "conic-gradient(#eef2f7 0 100%)";
  }

  return `conic-gradient(${stops.join(", ")})`;
}
