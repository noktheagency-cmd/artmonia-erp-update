import { BarChart3, CalendarDays, Filter, SlidersHorizontal, Trophy, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { cx } from "@/components/ui/cx";
import type { HrPerformanceData, HrFeedbackNote } from "@/modules/hr/performance-data";

export function HrPerformancePanel({ data }: { data: HrPerformanceData }) {
  return (
    <section className="page-stack hr-page">
      <div className="page-heading list-heading">
        <div>
          <p className="eyeless-label">Artmonia HR</p>
          <h1>Komanda performansı</h1>
          <p>
            Menecer zəngləri, konsultasiya dəvətləri, satış nəticələri və həftəlik inkişaf qeydləri.
          </p>
        </div>

        <div className="hr-source-card">
          <CalendarDays size={18} />
          <div>
            <span>Son yenilənmə</span>
            <strong>{data.labels.latestUpdate}</strong>
          </div>
        </div>
      </div>

      <article className="panel crm-table-panel hr-filter-panel">
        <form className="table-toolbar hr-filter-toolbar" action="/hr">
          <div className="hr-filter-context">
            <BarChart3 size={17} />
            <div>
              <span>{data.labels.source}</span>
              <strong>{data.labels.period}</strong>
            </div>
          </div>

          <div className="crm-filter-grid hr-filter-grid">
            <label>
              <span>Menecer</span>
              <FormSelect
                name="manager"
                defaultValue={data.filters.manager}
                emptyLabel="Bütün komanda"
                options={data.managerOptions}
              />
            </label>
            <label>
              <span>Dövr</span>
              <FormSelect
                name="month"
                defaultValue={data.filters.month}
                emptyLabel="Bütün dövr"
                options={data.monthOptions}
              />
            </label>
          </div>

          <div className="toolbar-actions">
            <Button type="submit" variant="outline" size="sm">
              <Filter data-icon="inline-start" />
              Axtar
            </Button>
            <a className="ui-button ui-button-ghost ui-button-sm" href="/hr">
              <SlidersHorizontal data-icon="inline-start" />
              Təmizlə
            </a>
          </div>
        </form>

        <div className="filter-chips" aria-label="HR filterləri">
          <span>{data.totalRows} günlük qeyd</span>
          <span>{data.filters.activeCount} aktiv filtr</span>
          <span>Menecer: {data.labels.manager}</span>
          <span>Dövr: {data.labels.month}</span>
        </div>
      </article>

      <div className="summary-grid">
        {data.metrics.map((item) => (
          <article className={`summary-card summary-${item.tone}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.helper}</small>
          </article>
        ))}
      </div>

      <div className="hr-work-grid">
        <article className="panel hr-ranking-panel">
          <div className="panel-head">
            <div>
              <h2>Menecer sıralaması</h2>
              <p>Seçilən dövr üzrə gəlir, satış və saat effektivliyi.</p>
            </div>
            <Trophy size={19} />
          </div>

          <div className="hr-ranking-list">
            {data.ranking.map((item) => (
              <div
                className={cx("hr-ranking-row", item.isSelected && "is-selected")}
                key={item.manager}
              >
                <div className="hr-rank-badge">#{item.rank}</div>
                <div className="hr-manager-cell">
                  <strong>{item.manager}</strong>
                  <span>
                    {item.days} gün - {item.hours}
                  </span>
                </div>
                <div className="hr-manager-metrics">
                  <span>{item.calls} zəng</span>
                  <span>{item.sales} satış</span>
                  <strong>{item.revenue}</strong>
                </div>
                <StatusChip tone={item.tone}>{item.conversionRate}</StatusChip>
              </div>
            ))}
          </div>
        </article>

        <article className="panel hr-funnel-panel">
          <div className="panel-head">
            <div>
              <h2>Satış hunisi</h2>
              <p>Zəngdən satışa qədər komandanın çevrilmə ardıcıllığı.</p>
            </div>
            <UsersRound size={19} />
          </div>

          <div className="hr-funnel-list">
            {data.funnel.map((step) => (
              <div className="hr-funnel-row" key={step.label}>
                <div className="hr-funnel-meta">
                  <strong>{step.label}</strong>
                  <span>
                    {step.value} - {step.helper}
                  </span>
                </div>
                <div className="hr-funnel-track">
                  <span className={`hr-funnel-fill status-${step.tone}`} style={{ width: `${step.width}%` }} />
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>

      <article className="panel hr-trend-panel">
        <div className="panel-head">
          <div>
            <h2>Aylıq trend</h2>
            <p>Gəlir və satış həcminin aylar üzrə müqayisəsi.</p>
          </div>
        </div>

        <div className="hr-trend-list">
          {data.monthlyTrend.map((month) => (
            <div className={cx("hr-trend-row", month.isSelected && "is-selected")} key={month.month}>
              <div className="hr-trend-label">
                <strong>{month.label}</strong>
                <span>{month.sales}</span>
              </div>
              <div className="hr-trend-track">
                <span style={{ width: `${month.width}%` }} />
              </div>
              <strong>{month.revenue}</strong>
            </div>
          ))}
        </div>
      </article>

      <article className="panel hr-feedback-panel">
        <div className="panel-head">
          <div>
            <h2>Həftəlik inkişaf qeydləri</h2>
            <p>Uğurlar, çətinliklər və satış prosesində görünən risklər.</p>
          </div>
        </div>

        {data.feedbackNotes.length > 0 ? (
          <div className="hr-feedback-grid">
            {data.feedbackNotes.map((note) => (
              <FeedbackCard note={note} key={`${note.week}-${note.manager}`} />
            ))}
          </div>
        ) : (
          <div className="empty-state">Seçilən filterlər üzrə həftəlik qeyd tapılmadı</div>
        )}
      </article>

      <article className="panel table-panel crm-table-panel hr-table-panel">
        <div className="panel-head">
          <div>
            <h2>Gündəlik performans</h2>
            <p>Excel-in gündəlik sheet-indən çıxarılan son 40 qeyd.</p>
          </div>
        </div>

        <div className="data-table-wrap">
          <table className="data-table hr-data-table">
            <thead>
              <tr>
                <th>Tarix</th>
                <th>Menecer</th>
                <th>Saat</th>
                <th>Zəng</th>
                <th>Cavab</th>
                <th>Dəvət</th>
                <th>Canlı</th>
                <th>Satış</th>
                <th>Gəlir</th>
                <th>Effekt</th>
              </tr>
            </thead>
            <tbody>
              {data.dailyRows.length > 0 ? (
                data.dailyRows.map((row) => (
                  <tr key={row.id}>
                    <td>{row.dateLabel}</td>
                    <td>
                      <div className="student-cell">
                        <strong>{row.manager}</strong>
                        <span>{row.revenuePerHour}</span>
                      </div>
                    </td>
                    <td>{row.hours}</td>
                    <td>{row.calls}</td>
                    <td>{row.answered}</td>
                    <td>{row.invites}</td>
                    <td>{row.liveConsults}</td>
                    <td>{row.sales}</td>
                    <td>
                      <strong>{row.revenue}</strong>
                    </td>
                    <td>
                      <StatusChip tone={row.tone}>{row.status}</StatusChip>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10}>
                    <div className="empty-state">Gündəlik performans qeydi tapılmadı</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>
    </section>
  );
}

function FeedbackCard({ note }: { note: HrFeedbackNote }) {
  return (
    <article className="hr-feedback-card">
      <div className="hr-feedback-card-head">
        <div>
          <strong>{note.manager}</strong>
          <span>{note.weekLabel}</span>
        </div>
        <StatusChip tone={note.wins.length > 0 ? "success" : "neutral"}>Weekly</StatusChip>
      </div>

      <FeedbackList title="Uğurlar" items={note.wins} empty="Uğur qeydi yoxdur" />
      <FeedbackList title="Çətinliklər" items={note.challenges} empty="Çətinlik qeydi yoxdur" />
      <FeedbackList title="Problemlər" items={note.problems} empty="Problem qeydi yoxdur" />
    </article>
  );
}

function FeedbackList({
  title,
  items,
  empty,
}: {
  title: string;
  items: string[];
  empty: string;
}) {
  return (
    <div className="hr-feedback-section">
      <span>{title}</span>
      <ul>
        {items.length > 0 ? (
          items.map((item) => <li key={item}>{item}</li>)
        ) : (
          <li className="is-empty">{empty}</li>
        )}
      </ul>
    </div>
  );
}
