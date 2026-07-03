import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight, CheckCircle2, CircleDollarSign, TrendingUp, UsersRound } from "lucide-react";
import type { DashboardData } from "@/modules/dashboard/queries";
import { DashboardDateFilter } from "@/modules/dashboard/dashboard-date-filter";
import { StatusChip } from "@/components/ui/status-chip";

const kpiRoutes = [
  "/students?status=ACTIVE",
  "/finance?type=payments",
  "/finance?type=debts",
  "/crm",
] as const satisfies readonly Route[];

export function OwnerDashboard({ data }: { data: DashboardData }) {
  return (
    <section className="page-stack dashboard-page">
      <div className="page-heading">
        <div>
          <p className="eyeless-label">Artmonia studio operations</p>
          <h1>Salam, Artmonia</h1>
          <p>Bugünkü fəaliyyət, müraciətlər, borclar və tapşırıqların cari vəziyyəti.</p>
        </div>

        <DashboardDateFilter from={data.filters.from} to={data.filters.to} label={data.filters.label} />
      </div>

      <div className="dashboard-grid">
        <div className="kpi-grid">
          {data.kpis.map((item, index) => (
            <Link
              className={`metric-card dashboard-link-card ${item.tone === "primary" ? "metric-primary" : ""}`}
              href={kpiRoutes[index] ?? "/dashboard"}
              key={item.label}
            >
              <span className="corner-action" aria-label={`${item.label} aç`}>
                <ArrowUpRight size={16} />
              </span>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
              <div className="metric-footer">
                <em>{item.delta}</em>
                <small>{item.helper}</small>
              </div>
            </Link>
          ))}
        </div>

        <Link className="panel chart-panel revenue-overview-panel dashboard-link-card" href="/finance?type=payments">
          <div className="panel-head">
            <div>
              <h2>Gəlir dinamikası</h2>
              <p>Aylar üzrə ümumi statistika və ən produktiv ayın səbəbi</p>
            </div>
            <span className="round-dark" aria-label="Gəlir hesabatı aç">
              <ArrowUpRight size={16} />
            </span>
          </div>

          <div className="bar-chart" aria-label="Gəlir bar qrafiki">
            {data.revenueBars.map((bar) => (
              <div className="bar-item" key={bar.label}>
                <div className="bar-track">
                  <span style={{ height: `${bar.value}%` }} title={bar.amount} />
                </div>
                <small>{bar.label}</small>
                <strong>{bar.amount}</strong>
              </div>
            ))}
          </div>

          <div className="revenue-summary-grid">
            {data.revenueStats.map((item) => (
              <div className="revenue-summary-item" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.helper}</small>
              </div>
            ))}
          </div>

          <div className="productive-month-note">
            <TrendingUp size={18} />
            <div>
              <span>Ən produktiv ay: {data.bestRevenueMonth.label}</span>
              <strong>{data.bestRevenueMonth.amount}</strong>
              <p>{data.bestRevenueMonth.reason}</p>
            </div>
          </div>
        </Link>

        <Link className="panel team-performance-panel dashboard-link-card" href="/crm">
          <div className="panel-head">
            <div>
              <h2>Team performance</h2>
              <p>Bu ay menecerlər üzrə müraciət, satış və konversiya</p>
            </div>
          </div>
          <div className="team-performance-list">
            {data.teamPerformance.length > 0 ? (
              data.teamPerformance.map((member) => (
                <div className="team-performance-item" key={member.name}>
                  <div className="team-performance-head">
                    <div>
                      <strong>{member.name}</strong>
                      <span>
                        {member.leads} lead / {member.sales} satış
                      </span>
                    </div>
                    <b>{member.conversion}</b>
                  </div>
                  <div className="team-performance-track">
                    <div className="team-performance-bar" style={{ width: `${member.score}%` }} />
                  </div>
                  <small>{member.revenue} gəlir</small>
                </div>
              ))
            ) : (
              <div className="program-stats-empty">Bu ay üçün komanda göstəricisi yoxdur</div>
            )}
          </div>
        </Link>

        <Link className="panel status-breakdown-panel dashboard-link-card" href="/students">
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
        </Link>

        <Link className="panel task-panel dashboard-link-card" href="/crm?followUp=today">
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
        </Link>

        <Link className="panel payout-panel dashboard-link-card" href="/finance?type=payroll">
          <div className="mini-icon">
            <CircleDollarSign size={18} />
          </div>
          <strong>Ay sonu gəlir proqnozu</strong>
          <div className="big-number">{data.revenueForecast}</div>
          <p>{data.revenueForecastHelper}</p>
        </Link>

        <Link className="panel people-panel dashboard-link-card" href="/crm?followUp=today">
          <UsersRound size={20} />
          <strong>{data.waitingFamilies} ailə cavab gözləyir</strong>
          <p>{data.waitingHelper}</p>
        </Link>
      </div>
    </section>
  );
}
