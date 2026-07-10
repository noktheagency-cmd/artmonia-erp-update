"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  BarChart3,
  BookOpen,
  Calendar,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Filter,
  Layers3,
  List,
  Search,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  UserRound,
  UserRoundPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { FormSelect } from "@/components/ui/select";
import { CrmLeadsTable } from "@/modules/crm/crm-leads-table";
import { CrmOverview } from "@/modules/crm/crm-overview";
import type { CrmData } from "@/modules/crm/queries";
import { NewLeadDialog } from "@/modules/crm/new-lead-dialog";
import { ExportDialog } from "@/modules/exports/export-dialog";
import {
  leadPriorityLabels,
  leadPrioritySelectOptions,
} from "@/modules/crm/follow-up";
import { buildCrmSourceSelectOptions } from "@/modules/crm/source-options";
import { leadStageLabels, leadStageSelectOptions } from "@/modules/crm/stage";

const followUpLabels = {
  all: "Bütün növbəti addımlar",
  attention: "Diqqət tələb edir",
  overdue: "Gecikmiş",
  today: "Bugünkü",
  unplanned: "Planlanmayıb",
  scheduled: "Planlanıb",
} as const;

const followUpSelectOptions = Object.entries(followUpLabels).map(([value, label]) => ({
  value,
  label,
}));

const metricIcons = [TrendingUp, UserRoundPlus, Clock3, CheckCircle2];

type CrmTab = "overview" | "list";

export function CrmPipeline({ data }: { data: CrmData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const activeTab: CrmTab = searchParams.get("tab") === "list" ? "list" : "overview";
  const showCreateToast = searchParams.get("leadCreated") === "1";

  const dismissCreateToast = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("leadCreated");
    params.set("tab", "list");
    router.replace(`/crm?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  useEffect(() => {
    if (!showCreateToast) return;
    const timeoutId = window.setTimeout(dismissCreateToast, 4200);
    return () => window.clearTimeout(timeoutId);
  }, [dismissCreateToast, showCreateToast]);

  function navigate(params: URLSearchParams, transition = false) {
    const href = params.size > 0 ? `/crm?${params.toString()}` : "/crm";
    if (transition) {
      startTransition(() => router.push(href as Route));
      return;
    }
    router.push(href as Route);
  }

  function handleTabChange(tab: CrmTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    navigate(params);
  }

  function handleQuickFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    params.set("tab", "list");
    navigate(params);
  }

  function handleMetricClick(index: number) {
    if (index === 2) {
      handleQuickFilter("followUp", "attention");
      return;
    }
    if (index === 3) {
      handleQuickFilter("stage", "REGISTERED");
      return;
    }

    const params = new URLSearchParams(searchParams.toString());
    if (index === 1) {
      params.delete("from");
      params.delete("to");
      params.delete("period");
    }
    params.set("tab", "list");
    navigate(params);
  }

  function handleClearFilters() {
    const params = new URLSearchParams();
    params.set("tab", activeTab);
    navigate(params);
  }

  function handleFilterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams(searchParams.toString());
    const fields = [
      "q",
      "stage",
      "owner",
      "program",
      "priority",
      "source",
      "followUp",
      "from",
      "to",
      "period",
    ];

    fields.forEach((field) => {
      const value = formData.get(field)?.toString().trim();
      if (value && value !== "all") params.set(field, value);
      else params.delete(field);
    });

    params.set("tab", activeTab);
    navigate(params, true);
  }

  return (
    <section className="crm-command-page" aria-labelledby="crm-page-title">
      <div className="route-progress" aria-hidden={!isPending} data-visible={isPending} />

      {showCreateToast ? (
        <div className="crm-modern-toast" role="status" aria-live="polite">
          <span aria-hidden="true"><CheckCircle2 /></span>
          <div>
            <strong>Müraciət yaradıldı</strong>
            <p>Yeni müraciət siyahıya əlavə olundu.</p>
          </div>
          <button type="button" aria-label="Bildirişi bağla" onClick={dismissCreateToast}>
            <X />
          </button>
        </div>
      ) : null}

      <header className="crm-command-header crm-enter">
        <div>
          <h1 id="crm-page-title">Müraciətlər və İzləmə</h1>
          <p>Yeni müraciətlər, sınaq namizədləri və izləmələrin qeydiyyata çevrilmə prosesi.</p>
        </div>
        <div className="crm-header-actions">
          {data.access.canExport ? (
            <ExportDialog
              module="crm"
              resultCount={data.leads.length}
              filters={{ q: data.query, stage: data.filters.stage, owner: data.filters.owner, program: data.filters.program, source: data.filters.source, priority: data.filters.priority, followUp: data.filters.followUp, from: data.filters.dateFrom, to: data.filters.dateTo }}
              previewRows={data.leads.map((lead) => ({ name: lead.name, phone: lead.phone, program: lead.program, source: lead.source, stage: lead.stageLabel, priority: lead.priorityLabel, nextAction: lead.nextActionTypeLabel, nextFollowUp: lead.nextFollowUpAt, manager: lead.manager, createdAt: lead.createdAt, note: lead.latestNote, convertedStudent: lead.detail.convertedStudentCode, history: "" }))}
            />
          ) : null}
          {data.access.canCreateLead ? (
            <NewLeadDialog programs={data.programs} managers={data.managers} sourceOptions={data.sourceOptions} />
          ) : null}
        </div>
      </header>

      <CrmFilterPanel
        key={`${data.filters.dateFrom}-${data.filters.dateTo}-${data.filters.period}`}
        data={data}
        isPending={isPending}
        onSubmit={handleFilterSubmit}
        onClear={handleClearFilters}
      />

      <section className="crm-metrics-grid" aria-label="CRM əsas göstəriciləri">
        {data.metrics.map((metric, index) => {
          const Icon = metricIcons[index] ?? Sparkles;
          return (
            <button
              type="button"
              className={cx("crm-metric-card", `is-${metric.tone}`, "crm-enter")}
              style={{ animationDelay: `${45 + index * 45}ms` }}
              onClick={() => handleMetricClick(index)}
              key={metric.label}
              aria-label={`${metric.label}: ${metric.value}. Siyahını aç`}
            >
              <span className="crm-metric-top">
                <span>{metric.label}</span>
                <span className="crm-metric-icon" aria-hidden="true"><Icon /></span>
              </span>
              <strong>{metric.value}</strong>
              <span className="crm-metric-foot">
                <span>{metric.helper}</span>
                <span aria-hidden="true">→</span>
              </span>
            </button>
          );
        })}
      </section>

      <div className="crm-view-toolbar crm-enter" style={{ animationDelay: "230ms" }}>
        <div className="crm-view-tabs" role="tablist" aria-label="CRM görünüşü">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "overview"}
            data-active={activeTab === "overview"}
            onClick={() => handleTabChange("overview")}
          >
            <BarChart3 aria-hidden="true" />
            <span>İcmal və Analitika</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "list"}
            data-active={activeTab === "list"}
            onClick={() => handleTabChange("list")}
          >
            <List aria-hidden="true" />
            <span>Müraciət Siyahısı</span>
            <small>{data.leads.length}</small>
          </button>
        </div>
        {data.filters.activeCount > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={handleClearFilters}>
            <SlidersHorizontal data-icon="inline-start" />
            Filtrləri sıfırla ({data.filters.activeCount})
          </Button>
        ) : null}
      </div>

      {activeTab === "overview" ? (
        <>
          <CrmOverview
            data={data}
            onStageSelect={(stage) => handleQuickFilter("stage", stage)}
            onLeadSelect={(name) => handleQuickFilter("q", name)}
          />
          <CrmLeadsTable
            data={data}
            preview
            onShowAll={() => handleTabChange("list")}
            onClearFilters={handleClearFilters}
          />
        </>
      ) : (
        <div className="crm-list-view">
          <ActiveFiltersBar data={data} onClear={handleClearFilters} onRemove={handleQuickFilter} />
          <CrmLeadsTable data={data} onClearFilters={handleClearFilters} />
        </div>
      )}
    </section>
  );
}

function CrmFilterPanel({
  data,
  isPending,
  onSubmit,
  onClear,
}: {
  data: CrmData;
  isPending: boolean;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onClear: () => void;
}) {
  const [dateFrom, setDateFrom] = useState(data.filters.dateFrom);
  const [dateTo, setDateTo] = useState(data.filters.dateTo);

  function setQuickDateRange(periodType: "today" | "month" | "thirty") {
    const today = new Date();
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    if (periodType === "today") {
      const value = formatDate(today);
      setDateFrom(value);
      setDateTo(value);
      return;
    }
    if (periodType === "month") {
      setDateFrom(formatDate(new Date(today.getFullYear(), today.getMonth(), 1)));
      setDateTo(formatDate(new Date(today.getFullYear(), today.getMonth() + 1, 0)));
      return;
    }
    setDateFrom(formatDate(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000)));
    setDateTo(formatDate(today));
  }

  return (
    <form className="crm-filter-panel crm-enter" onSubmit={onSubmit} aria-label="CRM filtrləri">
      {data.filters.period !== "this_month" ? (
        <input type="hidden" name="period" value={data.filters.period} />
      ) : null}

      <div className="crm-filter-primary">
        <Field className="crm-search-field">
          <FieldLabel className="sr-only" htmlFor="crm-search">Müraciət axtar</FieldLabel>
          <InputGroup>
            <InputGroupAddon aria-hidden="true"><Search /></InputGroupAddon>
            <InputGroupInput
              id="crm-search"
              name="q"
              placeholder="Müraciət edən, telefon və ya mənbə..."
              defaultValue={data.query}
            />
          </InputGroup>
        </Field>
        <DatePicker
          name="from"
          value={dateFrom}
          onValueChange={setDateFrom}
          placeholder="Başlanğıc"
          aria-label="Başlanğıc tarixi"
        />
        <DatePicker
          name="to"
          value={dateTo}
          onValueChange={setDateTo}
          placeholder="Son tarix"
          aria-label="Son tarix"
        />
        <Button type="submit" size="sm" disabled={isPending}>
          <Filter data-icon="inline-start" />
          {isPending ? "Yüklənir..." : "Göstər"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          <X data-icon="inline-start" />
          Təmizlə
        </Button>
      </div>

      <div className="crm-filter-secondary">
        <div className="crm-quick-periods" aria-label="Sürətli tarix aralığı">
          <Button type="button" variant="ghost" size="sm" onClick={() => setQuickDateRange("today")}>
            <Calendar data-icon="inline-start" />Bugün
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setQuickDateRange("month")}>
            <CalendarDays data-icon="inline-start" />Bu ay
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setQuickDateRange("thirty")}>
            <Clock3 data-icon="inline-start" />Son 30 gün
          </Button>
        </div>
        <div className="crm-filter-selects">
          <FormSelect
            aria-label="Status"
            name="stage"
            defaultValue={data.filters.stage}
            emptyLabel="Bütün statuslar"
            options={leadStageSelectOptions}
            icon={Activity}
          />
          <FormSelect
            aria-label="Məsul şəxs"
            name="owner"
            defaultValue={data.filters.owner}
            emptyLabel="Bütün məsullar"
            options={data.managers.map((manager) => ({ value: manager.id, label: manager.fullName }))}
            icon={UserRound}
          />
          <FormSelect
            aria-label="Proqram"
            name="program"
            defaultValue={data.filters.program}
            emptyLabel="Bütün proqramlar"
            options={data.programs.map((program) => ({ value: program.id, label: program.name }))}
            icon={BookOpen}
          />
          <FormSelect
            aria-label="Prioritet"
            name="priority"
            defaultValue={data.filters.priority}
            emptyLabel="Bütün prioritetlər"
            options={leadPrioritySelectOptions}
            icon={SlidersHorizontal}
          />
          <FormSelect
            aria-label="Mənbə"
            name="source"
            defaultValue={data.filters.source}
            emptyLabel="Bütün mənbələr"
            options={buildCrmSourceSelectOptions(data.sourceOptions)}
            icon={Layers3}
          />
          <FormSelect
            aria-label="Növbəti addım"
            name="followUp"
            defaultValue={data.filters.followUp}
            options={followUpSelectOptions}
            icon={CheckCircle2}
          />
        </div>
      </div>
    </form>
  );
}

function ActiveFiltersBar({
  data,
  onClear,
  onRemove,
}: {
  data: CrmData;
  onClear: () => void;
  onRemove: (key: string, value: string) => void;
}) {
  if (data.filters.activeCount === 0) return null;

  const chips = [
    data.filters.stage
      ? { key: "stage", label: `Status: ${leadStageLabels[data.filters.stage]}` }
      : null,
    data.filters.priority
      ? { key: "priority", label: `Prioritet: ${leadPriorityLabels[data.filters.priority]}` }
      : null,
    data.filters.owner
      ? {
          key: "owner",
          label: `Məsul: ${data.managers.find((item) => item.id === data.filters.owner)?.fullName ?? "-"}`,
        }
      : null,
    data.filters.program
      ? {
          key: "program",
          label: `Proqram: ${data.programs.find((item) => item.id === data.filters.program)?.name ?? "-"}`,
        }
      : null,
    data.filters.source ? { key: "source", label: `Mənbə: ${data.filters.source}` } : null,
    data.filters.followUp !== "all"
      ? { key: "followUp", label: `Addım: ${followUpLabels[data.filters.followUp]}` }
      : null,
  ].filter((chip): chip is { key: string; label: string } => Boolean(chip));

  return (
    <div className="crm-active-filters" aria-label="Aktiv filtrlər">
      <div>
        <SlidersHorizontal aria-hidden="true" />
        <span>{data.leads.length} nəticə</span>
      </div>
      <div className="crm-filter-chips">
        {chips.map((chip) => (
          <button type="button" key={chip.key} onClick={() => onRemove(chip.key, "")}>
            {chip.label}<X aria-hidden="true" />
          </button>
        ))}
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onClear}>Hamısını təmizlə</Button>
    </div>
  );
}
