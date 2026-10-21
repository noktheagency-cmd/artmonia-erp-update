"use client";

import { useCallback, useContext, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { HeaderActionsContext } from "@/components/layout/header-actions-context";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock3,
  Filter,
  Layers3,
  List,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  UserRound,
  UserRoundPlus,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { FormSelect, type SelectOption } from "@/components/ui/select";
import { CrmLeadsTable } from "@/modules/crm/crm-leads-table";
import {
  CrmConversionDialog,
  type CrmConversionFunnelStep,
} from "@/modules/crm/crm-conversion-dialog";
import { CrmOverview } from "@/modules/crm/crm-overview";
import { OverviewLeadDialog } from "@/modules/crm/overview-lead-dialog";
import type { CrmData } from "@/modules/crm/queries";
import { NewLeadDialog } from "@/modules/crm/new-lead-dialog";
import { ExportDialog } from "@/modules/exports/export-dialog";
import {
  leadPriorityLabels,
  leadPrioritySelectOptions,
} from "@/modules/crm/follow-up";
import { buildCrmSourceSelectOptions } from "@/modules/crm/source-options";
import { consultationTrialLabel, consultationTrialStage, leadStageLabels, leadStageSelectOptions } from "@/modules/crm/stage";

const followUpLabels = {
  all: "İzləmə",
  workshop_masterclass: "Masterclass & Workshop",
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
  const headerActionsTarget = useContext(HeaderActionsContext);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const leadTriggerRef = useRef<HTMLElement | null>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [conversionDetailsOpen, setConversionDetailsOpen] = useState(
    () => searchParams.get("salesDetails") === "1"
  );
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

  useEffect(() => {
    if (searchParams.get("salesDetails") === "1") {
      setConversionDetailsOpen(true);
    }
  }, [searchParams]);

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

  function handleConversionOpenChange(open: boolean) {
    setConversionDetailsOpen(open);
    if (open || searchParams.get("salesDetails") !== "1") return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("salesDetails");
    const href = params.size > 0 ? `/crm?${params.toString()}` : "/crm";
    router.replace(href as Route, { scroll: false });
  }

  function handleFunnelStepSelect(step: CrmConversionFunnelStep) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("salesDetails");
    params.delete("followUp");
    params.delete("q");
    if (step === "leads") {
      params.delete("stage");
    } else if (step === "contacted") {
      params.set("stage", "CONTACTED");
    } else if (step === "consultation") {
      params.set("stage", consultationTrialStage);
    } else {
      params.set("stage", "REGISTERED");
    }
    params.set("tab", "list");
    setConversionDetailsOpen(false);
    navigate(params);
  }

  function handleMetricClick(index: number) {
    if (index === 3) {
      setConversionDetailsOpen(true);
      return;
    }
    if (index === 2) {
      handleQuickFilter("followUp", "attention");
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
      "stage",
      "owner",
      "program",
      "priority",
      "source",
      "followUp",
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
      {selectedLeadId ? (
        <OverviewLeadDialog
          key={selectedLeadId}
          leadId={selectedLeadId}
          data={data}
          onClose={() => {
            setSelectedLeadId(null);
            requestAnimationFrame(() => leadTriggerRef.current?.focus());
          }}
        />
      ) : null}
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

      <h1 id="crm-page-title" className="sr-only">Müraciətlər və İzləmə</h1>
      {headerActionsTarget ? createPortal(
        <div className="crm-header-actions">
          <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="outline"><Filter /> Filtrlər{data.filters.activeCount > 0 ? ` (${data.filters.activeCount})` : ""}</Button>
            </DialogTrigger>
            <DialogContent className="crm-filter-dialog" aria-describedby={undefined}>
              <DialogHeader><DialogTitle>Follow-up filtrləri</DialogTitle></DialogHeader>
              <CrmFilterPanel
                key={searchParams.toString()}
                data={data}
                isPending={isPending}
                onSubmit={(event) => { handleFilterSubmit(event); setFiltersOpen(false); }}
                onClear={() => { handleClearFilters(); setFiltersOpen(false); }}
              />
            </DialogContent>
          </Dialog>
          {data.access.canExport ? (
            <ExportDialog
              module="crm"
              resultCount={data.leads.length}
              filters={{ q: data.query, stage: data.filters.stage, owner: data.filters.owner, program: data.filters.program, source: data.filters.source, priority: data.filters.priority, followUp: data.filters.followUp, from: data.filters.dateFrom, to: data.filters.dateTo }}
              previewRows={data.leads.map((lead) => ({ name: lead.name, phone: lead.phone, program: lead.program, source: lead.source, stage: lead.stageLabel, trialLessonCount: lead.trialLessonCount || "-", priority: lead.priorityLabel, nextAction: lead.nextActionTypeLabel, nextFollowUp: lead.nextFollowUpAt, manager: lead.manager, createdAt: lead.createdAt, note: lead.latestNote, convertedStudent: lead.detail.convertedStudentCode, history: "" }))}
            />
          ) : null}
          {data.access.canCreateLead ? (
            <NewLeadDialog
              programs={data.programs}
              sourceOptions={data.sourceOptions}
              currentManagerName={data.access.actorName}
            />
          ) : null}
        </div>,
        headerActionsTarget,
      ) : null}

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
              aria-label={`${metric.label}: ${metric.value}. ${index === 3 ? "Detalları aç" : "Siyahını aç"}`}
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

      <CrmConversionDialog
        open={conversionDetailsOpen}
        onOpenChange={handleConversionOpenChange}
        totalLeads={data.metrics[0]?.value ?? "0"}
        stats={data.dashboardStats}
        onFunnelStepSelect={handleFunnelStepSelect}
      />

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
            <small>{data.listTotalCount}</small>
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
            onStageSelect={(stage) => {
              // BK-22/23: kart bütün dövrdür; klik eyni əhatəli siyahı açır.
              const params = new URLSearchParams(searchParams.toString());
              params.set("stage", stage);
              params.set("period", "all");
              params.delete("from");
              params.delete("to");
              params.set("tab", "list");
              navigate(params);
            }}
            onLeadSelect={(id) => {
              leadTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
              setSelectedLeadId(id);
            }}
          />
          <CrmLeadsTable
            data={data}
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
  return (
    <form className="crm-filter-panel crm-enter" onSubmit={onSubmit} aria-label="CRM filtrləri">
      {data.filters.period !== "this_month" ? (
        <input type="hidden" name="period" value={data.filters.period} />
      ) : null}

      <div className="crm-filter-secondary">
        <div className="crm-filter-selects">
          <FormSelect
            aria-label="Status"
            name="stage"
            defaultValue={data.filters.stage}
            emptyLabel="Status"
            options={leadStageSelectOptions.flatMap((option): SelectOption[] => {
              if (option.value === "TRIAL_LESSON") return [];
              if (option.value === "QUALIFIED") return [{ value: consultationTrialStage, label: consultationTrialLabel }];
              return [option];
            })}
            icon={Activity}
          />
          <FormSelect
            aria-label="Məsul şəxs"
            name="owner"
            defaultValue={data.filters.owner}
            emptyLabel="Məsul"
            options={data.managers.map((manager) => ({ value: manager.id, label: manager.fullName }))}
            icon={UserRound}
          />
          <FormSelect
            aria-label="Proqram"
            name="program"
            defaultValue={data.filters.program}
            emptyLabel="Proqram"
            options={data.programs.map((program) => ({ value: program.id, label: program.name }))}
            icon={BookOpen}
          />
          <FormSelect
            aria-label="Prioritet"
            name="priority"
            defaultValue={data.filters.priority}
            emptyLabel="Prioritet"
            options={leadPrioritySelectOptions}
            icon={SlidersHorizontal}
          />
          <FormSelect
            aria-label="Mənbə"
            name="source"
            defaultValue={data.filters.source}
            emptyLabel="Mənbə"
            options={buildCrmSourceSelectOptions(data.sourceOptions)}
            icon={Layers3}
            searchable
            searchPlaceholder="Mənbə axtar..."
            catalogKey="CRM_SOURCE"
            createLabel="Yeni mənbə əlavə et"
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
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={isPending} onClick={onClear}><X /> Sıfırla</Button>
        <Button type="submit" disabled={isPending}>{isPending ? "Tətbiq edilir…" : "Tətbiq et"}</Button>
      </DialogFooter>
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
      ? { key: "stage", label: `Status: ${data.filters.stage === consultationTrialStage ? consultationTrialLabel : leadStageLabels[data.filters.stage]}` }
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
