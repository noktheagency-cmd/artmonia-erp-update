import { CheckCircle2, Filter, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { CrmPeriodSelect } from "@/modules/crm/crm-period-select";
import { LeadDetailDialog } from "@/modules/crm/lead-detail-dialog";
import { NewLeadDialog } from "@/modules/crm/new-lead-dialog";
import type { CrmData } from "@/modules/crm/queries";
import { crmPeriodLabels } from "@/modules/crm/period";
import { buildCrmSourceSelectOptions } from "@/modules/crm/source-options";
import {
  convertLeadToStudentAction,
  updateLeadStageAction,
} from "@/modules/crm/actions";
import {
  leadStageLabels,
  leadStageSelectOptions,
} from "@/modules/crm/stage";

const followUpLabels = {
  all: "Bütün izləmələr",
  overdue: "Gecikmiş",
  today: "Bugünkü",
  unplanned: "Planlanmayıb",
  scheduled: "Planlanıb",
} as const;

const followUpSelectOptions = Object.entries(followUpLabels).map(([value, label]) => ({
  value,
  label,
}));

export function CrmPipeline({ data }: { data: CrmData }) {
  return (
    <section className="page-stack">
      <div className="page-heading list-heading">
        <div>
          <p className="eyeless-label">Artmonia CRM</p>
          <h1>Müraciət axını</h1>
          <p>Yeni müraciətlər, sınaq namizədləri, izləmələr və qeydiyyata çevrilmə vəziyyəti.</p>
          <div className="crm-access-row">
            <span>{data.access.scopeLabel}</span>
            <span>{data.access.actorName}</span>
          </div>
        </div>
        <div className="crm-heading-actions">
          <CrmPeriodSelect value={data.filters.period} />
          {data.access.canCreateLead ? (
            <NewLeadDialog
              programs={data.programs}
              managers={data.managers}
              sourceOptions={data.sourceOptions}
            />
          ) : null}
        </div>
      </div>

      <div className="summary-grid">
        {data.metrics.map((item) => (
          <article className={`summary-card summary-${item.tone}`} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
            <small>{item.helper}</small>
          </article>
        ))}
      </div>

      <article className="panel crm-stage-overview">
        <div className="panel-head">
          <div>
            <h2>Mərhələlər</h2>
            <p>Müraciətlərin statuslara görə canlı bölgüsü.</p>
          </div>
          <div className="crm-stage-total">
            <strong>{data.leads.length}</strong>
            <span>görünən müraciət</span>
          </div>
        </div>

        <div className="crm-stage-strip">
          {data.stageSummary.map((stage) => (
            <div className={`crm-stage-card crm-stage-${stage.tone}`} key={stage.stage}>
              <StatusChip tone={stage.tone}>{stage.label}</StatusChip>
              <strong>{stage.value}</strong>
            </div>
          ))}
        </div>
      </article>

      <article className="panel table-panel crm-table-panel">
        <form className="table-toolbar crm-filter-toolbar" action="/crm">
          {data.filters.period !== "this_month" ? (
            <input type="hidden" name="period" value={data.filters.period} />
          ) : null}
          <label className="table-search">
            <Search size={16} />
            <span className="sr-only">Müraciət axtar</span>
            <input
              name="q"
              placeholder="Ad, telefon, mənbə və ya proqram üzrə axtar"
              defaultValue={data.query}
            />
          </label>
          <div className="crm-filter-grid">
            <label>
              <span>Mərhələ</span>
              <FormSelect
                name="stage"
                defaultValue={data.filters.stage}
                emptyLabel="Bütün mərhələlər"
                options={leadStageSelectOptions}
              />
            </label>
            <label>
              <span>Məsul şəxs</span>
              <FormSelect
                name="owner"
                defaultValue={data.filters.owner}
                emptyLabel="Bütün məsullar"
                options={data.managers.map((manager) => ({
                  value: manager.id,
                  label: manager.fullName,
                }))}
              />
            </label>
            <label>
              <span>Proqram</span>
              <FormSelect
                name="program"
                defaultValue={data.filters.program}
                emptyLabel="Bütün proqramlar"
                options={data.programs.map((program) => ({
                  value: program.id,
                  label: program.name,
                }))}
              />
            </label>
            <label>
              <span>Mənbə</span>
              <FormSelect
                name="source"
                defaultValue={data.filters.source}
                emptyLabel="Bütün mənbələr"
                options={buildCrmSourceSelectOptions(data.sourceOptions)}
              />
            </label>
            <label>
              <span>İzləmə</span>
              <FormSelect
                name="followUp"
                defaultValue={data.filters.followUp}
                options={followUpSelectOptions}
              />
            </label>
          </div>
          <div className="toolbar-actions">
            <Button type="submit" variant="outline" size="sm">
              <Filter data-icon="inline-start" />
              Axtar
            </Button>
            <a className="ui-button ui-button-ghost ui-button-sm" href="/crm">
              <SlidersHorizontal data-icon="inline-start" />
              Təmizlə
            </a>
          </div>
        </form>

        <div className="filter-chips" aria-label="CRM filterləri">
          <span>{data.leads.length} müraciət</span>
          <span>{data.filters.activeCount} aktiv filtr</span>
          <span>Dövr: {crmPeriodLabels[data.filters.period]}</span>
          <span>Mərhələ: {data.filters.stage ? leadStageLabels[data.filters.stage] : "Bütün"}</span>
          <span>İzləmə: {followUpLabels[data.filters.followUp]}</span>
          <a href="/crm">Təmizlə</a>
        </div>

        <div className="data-table-wrap">
          <table className="data-table crm-table">
            <thead>
              <tr>
                <th>Müraciət</th>
                <th>Mənbə</th>
                <th>Proqram</th>
                <th>Məsul şəxs</th>
                <th>Mərhələ</th>
                <th>İzləmə</th>
                <th>Qeydiyyat</th>
                <th>Qeyd</th>
              </tr>
            </thead>
            <tbody>
              {data.leads.length > 0 ? (
                data.leads.map((lead) => (
                  <tr key={lead.id}>
                    <td>
                      <div className="student-cell">
                        <LeadDetailDialog
                          lead={lead}
                          managers={data.managers}
                          programs={data.programs}
                          sourceOptions={data.sourceOptions}
                          returnTo={data.returnTo}
                        />
                        <span>{lead.phone}</span>
                      </div>
                    </td>
                    <td>{lead.source}</td>
                    <td>{lead.program}</td>
                    <td>{lead.manager}</td>
                    <td>
                      <form action={updateLeadStageAction} className="stage-form">
                        <input type="hidden" name="leadId" value={lead.id} />
                        <input type="hidden" name="returnTo" value={data.returnTo} />
                        <FormSelect
                          name="stage"
                          defaultValue={lead.stage}
                          aria-label="Müraciət mərhələsi"
                          options={leadStageSelectOptions}
                        />
                        <Button type="submit" variant="secondary" size="sm">
                          Saxla
                        </Button>
                      </form>
                    </td>
                    <td>{lead.nextFollowUpAt}</td>
                    <td>
                      <form action={convertLeadToStudentAction} className="convert-form">
                        <input type="hidden" name="leadId" value={lead.id} />
                        <input type="hidden" name="returnTo" value={data.returnTo} />
                        <Button
                          type="submit"
                          variant={lead.canConvert ? "secondary" : "ghost"}
                          size="sm"
                          disabled={!lead.canConvert || !data.access.canConvertLead}
                          aria-disabled={!lead.canConvert || !data.access.canConvertLead}
                          title={lead.canConvert ? "Tələbə kimi qeydiyyata al" : lead.conversionLabel}
                        >
                          {lead.canConvert ? <CheckCircle2 data-icon="inline-start" /> : null}
                          {lead.conversionLabel}
                        </Button>
                      </form>
                    </td>
                    <td>
                      <div className="student-cell">
                        <strong>
                          <StatusChip tone={lead.stageTone}>{lead.stageLabel}</StatusChip>
                        </strong>
                        <span>{lead.latestNote}</span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">Müraciət tapılmadı</div>
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
