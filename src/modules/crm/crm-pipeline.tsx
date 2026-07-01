"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { 
  CheckCircle2, 
  Filter, 
  Search, 
  SlidersHorizontal, 
  BarChart3, 
  List, 
  TrendingUp, 
  AlertCircle, 
  Clock,
  Briefcase,
  Users,
  Layers,
  Sparkles,
  Calendar,
  CalendarDays,
  User,
  X,
  Activity,
  BookOpen
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { FormSelect } from "@/components/ui/select";
import { StatusChip } from "@/components/ui/status-chip";
import { LeadDetailDialog } from "@/modules/crm/lead-detail-dialog";
import { NewLeadDialog } from "@/modules/crm/new-lead-dialog";
import type { CrmData } from "@/modules/crm/queries";
import { buildCrmSourceSelectOptions } from "@/modules/crm/source-options";
import { convertLeadToStudentAction } from "@/modules/crm/actions";
import {
  leadPriorityLabels,
  leadPrioritySelectOptions,
} from "@/modules/crm/follow-up";
import {
  leadStageLabels,
  leadStageSelectOptions,
} from "@/modules/crm/stage";

const followUpLabels = {
  all: "Bütün növbəti addımlar",
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
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Tab synchronization using URL search parameter 'tab'
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "list" ? "list" : "overview";
  const [dateFrom, setDateFrom] = useState(data.filters.dateFrom);
  const [dateTo, setDateTo] = useState(data.filters.dateTo);

  function handleTabChange(tab: "overview" | "list") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`/crm?${params.toString()}`);
  }

  function handleQuickFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set("tab", "list"); // Switch to list tab to see results
    router.push(`/crm?${params.toString()}`);
  }

  function handleFilterSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const params = new URLSearchParams(searchParams.toString());

    const fields = ["q", "stage", "owner", "program", "priority", "source", "followUp", "from", "to"];
    fields.forEach((field) => {
      const value = formData.get(field)?.toString().trim();
      if (value && value !== "all" && value !== "") {
        params.set(field, value);
      } else {
        params.delete(field);
      }
    });

    params.set("tab", activeTab);

    startTransition(() => {
      router.push(`/crm?${params.toString()}`);
    });
  }

  function handleClearFilters() {
    const params = new URLSearchParams();
    params.set("tab", activeTab);
    if (data.filters.period !== "this_month") {
      params.set("period", data.filters.period);
    }
    router.push(`/crm?${params.toString()}`);
  }

  function setQuickDateRange(periodType: "today" | "month" | "thirty") {
    const today = new Date();
    const formatDate = (date: Date) => {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    if (periodType === "today") {
      const todayStr = formatDate(today);
      setDateFrom(todayStr);
      setDateTo(todayStr);
    } else if (periodType === "month") {
      const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
      const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setDateFrom(formatDate(firstDay));
      setDateTo(formatDate(lastDay));
    } else if (periodType === "thirty") {
      const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
      setDateFrom(formatDate(thirtyDaysAgo));
      setDateTo(formatDate(today));
    }
  }

  const activeFiltersCount = data.filters.activeCount;

  // Formatting date range label
  const dateFromText = data.filters.dateFrom || "Başlanğıc";
  const dateToText = data.filters.dateTo || "Son tarix";
  const activeDateRangeLabel = data.filters.dateFrom || data.filters.dateTo 
    ? `${dateFromText} - ${dateToText}` 
    : "Bütün dövr";

  return (
    <section className="page-stack operational-page crm-redesign-page">
      {/* Visual Navigation Progress Indicator */}
      <div className="route-progress" aria-hidden={!isPending} data-visible={isPending} />

      {/* --- REDESIGNED UNIFIED FILTER PANEL (SCREENSHOT LAYOUT) --- */}
      <form className="crm-unified-filter-panel student-unified-filter-panel" onSubmit={handleFilterSubmit}>
        {data.filters.period !== "this_month" && (
          <input type="hidden" name="period" value={data.filters.period} />
        )}
        
        {/* --- PREMIUM COMPACT HEADER (SCREENSHOT LAYOUT) --- */}
        <div className="student-header-compact" style={{ marginBottom: 0 }}>
          <div className="header-title-wrapper-compact">
            <div className="crm-eyebrow-compact">
              <span className="eyebrow-pill pill-primary">Artmonia CRM</span>
              <span className="eyebrow-pill pill-date">{activeDateRangeLabel}</span>
            </div>
            <div className="title-row-compact">
              <h1>Müraciətlər və İzləmə</h1>
            </div>
            <p className="crm-header-desc" style={{ marginBottom: 0 }}>
              Yeni müraciətlər, sınaq namizədləri və izləmələrin qeydiyyata çevrilmə prosesi.
            </p>
          </div>
          
          <div className="header-actions-wrapper-compact">
            {data.access.canCreateLead ? (
              <NewLeadDialog
                programs={data.programs}
                managers={data.managers}
                sourceOptions={data.sourceOptions}
              />
            ) : null}
          </div>
        </div>

        <div className="filter-header-divider" />
        
        {/* Main Inputs Row */}
        <div className="filter-main-row">
          {/* Search Bar */}
          <div className="search-input-wrapper" style={{ flex: "1.5", minWidth: "220px" }}>
            <Search size={18} className="search-icon" />
            <input
              name="q"
              placeholder="Müraciət edən, kateqoriya..."
              defaultValue={data.query}
              className="filter-search-input"
            />
          </div>

          {/* Date From */}
          <DatePicker
            name="from"
            value={dateFrom}
            onValueChange={setDateFrom}
            placeholder="Başlanğıc"
            aria-label="Başlanğıc tarixi"
          />

          {/* Date To */}
          <DatePicker
            name="to"
            value={dateTo}
            onValueChange={setDateTo}
            placeholder="Son tarix"
            aria-label="Son tarix"
          />

          {/* Actions Group */}
          <div className="filter-actions-group" style={{ marginTop: 0 }}>
            <Button type="submit" variant="default" size="sm" className="crm-search-submit-btn" disabled={isPending}>
              <Filter size={16} />
              Göstər
            </Button>
            
            <button type="button" onClick={handleClearFilters} className="advanced-toggle-btn">
              Təmizlə
            </button>
          </div>
        </div>

        {/* Quick Period Buttons & Selects Row */}
        <div className="period-quick-row">
          <button
            type="button"
            onClick={() => setQuickDateRange("today")}
            className="period-quick-btn"
          >
            <Calendar size={13} className="text-tone-primary" />
            <span>Bugün</span>
          </button>
          <button
            type="button"
            onClick={() => setQuickDateRange("month")}
            className="period-quick-btn"
          >
            <CalendarDays size={13} className="text-tone-success" />
            <span>Bu ay</span>
          </button>
          <button
            type="button"
            onClick={() => setQuickDateRange("thirty")}
            className="period-quick-btn"
          >
            <Clock size={13} className="text-tone-warning" />
            <span>Son 30 gün</span>
          </button>

          {/* Selects Grid with Icons */}
          <div className="quick-selects-grid">
            <FormSelect
              name="stage"
              defaultValue={data.filters.stage}
              emptyLabel="Bütün statuslar"
              options={leadStageSelectOptions}
              icon={Activity}
            />

            <FormSelect
              name="owner"
              defaultValue={data.filters.owner}
              emptyLabel="Bütün məsullar"
              options={data.managers.map((m) => ({ value: m.id, label: m.fullName }))}
              icon={User}
            />

            <FormSelect
              name="program"
              defaultValue={data.filters.program}
              emptyLabel="Bütün proqramlar"
              options={data.programs.map((p) => ({ value: p.id, label: p.name }))}
              icon={BookOpen}
            />

            <FormSelect
              name="priority"
              defaultValue={data.filters.priority}
              emptyLabel="Bütün prioritetlər"
              options={leadPrioritySelectOptions}
              icon={SlidersHorizontal}
            />

            <FormSelect
              name="source"
              defaultValue={data.filters.source}
              emptyLabel="Bütün mənbələr"
              options={buildCrmSourceSelectOptions(data.sourceOptions)}
              icon={Layers}
            />

            <FormSelect
              name="followUp"
              defaultValue={data.filters.followUp}
              options={followUpSelectOptions}
              icon={CheckCircle2}
            />
          </div>
        </div>
      </form>

      {/* --- REDESIGNED PREMIUM SEGMENTED TABS SWITCHER (SCREENSHOT STYLE) --- */}
      <div className="crm-tabs-navigation">
        <div className="tabs-segmented-container">
          <button
            type="button"
            onClick={() => handleTabChange("overview")}
            className={`tab-segmented-item ${activeTab === "overview" ? "is-active" : ""}`}
          >
            <BarChart3 size={15} />
            <span>İcmal və Analitika</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("list")}
            className={`tab-segmented-item ${activeTab === "list" ? "is-active" : ""}`}
          >
            <List size={15} />
            <span>Müraciət Siyahısı</span>
            <span className="tab-segmented-badge">{data.leads.length}</span>
          </button>
        </div>
        
        {activeFiltersCount > 0 && (
          <button type="button" onClick={handleClearFilters} className="crm-reset-filters-btn">
            <SlidersHorizontal size={14} />
            <span>Filtrləri sıfırla ({activeFiltersCount})</span>
          </button>
        )}
      </div>

      {/* TAB 1: ANALYTICS & FOCUS DASHBOARD */}
      {activeTab === "overview" && (
        <div className="crm-dashboard-layout animate-fade-in">
          
          {/* Redesigned Metrics Grid Cards (Screenshot Layout) */}
          <div className="metrics-grid-premium">
            {data.metrics.map((metric, index) => {
              let Icon = TrendingUp;
              if (index === 1) Icon = Sparkles;
              if (index === 2) Icon = Clock;
              if (index === 3) Icon = CheckCircle2;

              const isTodayFollowUp = index === 2;

              return (
                <div
                  key={metric.label}
                  onClick={() => isTodayFollowUp && handleQuickFilter("followUp", "today")}
                  className={`metric-card-premium tone-${metric.tone}`}
                  title={isTodayFollowUp ? "Bugünkü follow-up-ları filtrlə" : undefined}
                >
                  <div className="card-top-row">
                    <span className="card-label">{metric.label}</span>
                    <div className="card-icon-square">
                      <Icon size={16} />
                    </div>
                  </div>
                  <div className="card-value-row">
                    <strong>{metric.value}</strong>
                  </div>
                  <div className="card-bottom-row">
                    <span>{metric.helper}</span>
                    <span className="card-action-text">Siyahı →</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Interactive Lead Progress Stages */}
          <div className="panel crm-stage-overview-redesign">
            <div className="panel-head-redesign">
              <div>
                <h2>Müraciət Mərhələləri</h2>
                <p>Namizədlərin statuslar üzrə paylanması. Siyahını süzmək üçün mərhələyə klikləyin.</p>
              </div>
              <div className="crm-stage-total-badge">
                <strong>{data.leads.length}</strong>
                <span>Görünən Müraciət</span>
              </div>
            </div>
            
            <div className="crm-pipeline-stages-flow">
              {data.stageSummary.map((stage, idx) => (
                <div
                  key={stage.stage}
                  onClick={() => handleQuickFilter("stage", stage.stage)}
                  className={`crm-stage-flow-card tone-${stage.tone} ${data.filters.stage === stage.stage ? "is-active" : ""}`}
                >
                  <div className="stage-flow-index">0{idx + 1}</div>
                  <div className="stage-flow-content">
                    <span className="stage-flow-label">{stage.label}</span>
                    <strong className="stage-flow-value">{stage.value}</strong>
                  </div>
                  <div className="stage-flow-arrow" />
                </div>
              ))}
            </div>
          </div>

          {/* Unified attention focus */}
          <div className="crm-focus-dashboard-grid crm-focus-dashboard-grid-single">
            <FocusPanelRedesign
              title="Bugünkü və kritik diqqət"
              emptyText="Bugünkü, kritik və gecikmiş müraciət yoxdur"
              items={data.attentionFocus}
              icon={<AlertCircle size={18} />}
              onItemClick={(leadId) => handleQuickFilter("q", leadId)}
            />
          </div>

          {/* Core Analytics Breakdown Statistics */}
          <div className="panel crm-breakdowns-panel-redesign">
            <div className="panel-head-redesign">
              <div>
                <h2>Məhsuldarlıq və Maraq Statistikası</h2>
                <p>Komanda performansı, aparıcı kanallar və proqram üzrə maraq göstəriciləri.</p>
              </div>
            </div>
            
            <div className="crm-stats-grid-redesign">
              {/* Key Conversion Highlights */}
              <div className="crm-stat-card-highlight">
                <h3>Satış Performansı</h3>
                <div className="highlight-metrics-list">
                  <div className="highlight-metric-row">
                    <span>Cəmi Satış Sayı</span>
                    <strong>{data.dashboardStats.salesCount}</strong>
                  </div>
                  <div className="highlight-metric-row">
                    <span>Konversiya Faizi</span>
                    <strong className="text-tone-success">{data.dashboardStats.conversionRate}</strong>
                  </div>
                  <div className="highlight-metric-row">
                    <span>Konsultasiya Sayı</span>
                    <strong>{data.dashboardStats.consultationCount}</strong>
                  </div>
                  <div className="highlight-metric-row">
                    <span>İtki Faizi</span>
                    <strong className="text-tone-danger">{data.dashboardStats.lossRate}</strong>
                  </div>
                </div>
                
                <div className="sales-source-split">
                  <h4>Satış Növü Bölgüsü</h4>
                  <div className="split-progress-bar">
                    <div 
                      className="split-segment segment-direct" 
                      style={{ width: `${parseFloat(data.dashboardStats.salesCount) > 0 ? (parseInt(data.dashboardStats.directSales) / parseInt(data.dashboardStats.salesCount)) * 100 : 50}%` }}
                      title={`Birbaşa satış: ${data.dashboardStats.directSales}`}
                    />
                    <div 
                      className="split-segment segment-consult" 
                      style={{ width: `${parseFloat(data.dashboardStats.salesCount) > 0 ? (parseInt(data.dashboardStats.consultationSales) / parseInt(data.dashboardStats.salesCount)) * 100 : 50}%` }}
                      title={`Konsultasiyadan satış: ${data.dashboardStats.consultationSales}`}
                    />
                  </div>
                  <div className="split-labels">
                    <span>Birbaşa ({data.dashboardStats.directSales})</span>
                    <span>Konsultasiya ({data.dashboardStats.consultationSales})</span>
                  </div>
                </div>
              </div>

              {/* Team performance breakdown */}
              <BreakdownListRedesign
                title="Komanda Performansı"
                subtitle="Satış sayı / Konversiya"
                icon={<Users size={16} />}
                items={data.dashboardStats.teamPerformance.map((item) => ({
                  label: item.manager,
                  value: `${item.sales} satış • ${item.conversionRate}`,
                }))}
              />

              {/* Source breakdown */}
              <BreakdownListRedesign
                title="Mənbə Bölgüsü"
                subtitle="Müraciət kanalları üzrə"
                icon={<Layers size={16} />}
                items={data.dashboardStats.sourceStats}
              />

              {/* Program breakdown */}
              <BreakdownListRedesign
                title="Proqram Marağı"
                subtitle="Kurs və sahələrə görə"
                icon={<Briefcase size={16} />}
                items={data.dashboardStats.programStats}
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LEADS LIST VIEW */}
      {activeTab === "list" && (
        <div className="crm-list-layout animate-fade-in">
          {/* Active Filters Summary Chips */}
          {activeFiltersCount > 0 && (
            <div className="crm-active-chips-wrapper" aria-label="Aktiv filtrlər">
              <span className="chips-title">Aktiv süzgəclər:</span>
              <div className="chips-container">
                <span>{data.leads.length} müraciət tapıldı</span>
                {data.filters.stage && (
                  <span className="filter-chip-item">
                    Status: {leadStageLabels[data.filters.stage]}
                    <button type="button" onClick={() => handleQuickFilter("stage", "")}><X size={12} /></button>
                  </span>
                )}
                {data.filters.priority && (
                  <span className="filter-chip-item">
                    Prioritet: {leadPriorityLabels[data.filters.priority]}
                    <button type="button" onClick={() => handleQuickFilter("priority", "")}><X size={12} /></button>
                  </span>
                )}
                {data.filters.followUp !== "all" && (
                  <span className="filter-chip-item">
                    Addım: {followUpLabels[data.filters.followUp]}
                    <button type="button" onClick={() => handleQuickFilter("followUp", "all")}><X size={12} /></button>
                  </span>
                )}
                {data.filters.program && (
                  <span className="filter-chip-item">
                    Proqram: {data.programs.find(p => p.id === data.filters.program)?.name}
                    <button type="button" onClick={() => handleQuickFilter("program", "")}><X size={12} /></button>
                  </span>
                )}
                {data.filters.owner && (
                  <span className="filter-chip-item">
                    Məsul: {data.managers.find(m => m.id === data.filters.owner)?.fullName}
                    <button type="button" onClick={() => handleQuickFilter("owner", "")}><X size={12} /></button>
                  </span>
                )}
                {data.filters.source && (
                  <span className="filter-chip-item">
                    Mənbə: {data.filters.source}
                    <button type="button" onClick={() => handleQuickFilter("source", "")}><X size={12} /></button>
                  </span>
                )}
                {(data.filters.dateFrom || data.filters.dateTo) && (
                  <span className="filter-chip-item">
                    Tarix: {data.filters.dateFrom || "*"} - {data.filters.dateTo || "*"}
                    <button type="button" onClick={() => {
                      const params = new URLSearchParams(searchParams.toString());
                      params.delete("from");
                      params.delete("to");
                      router.push(`/crm?${params.toString()}`);
                    }}><X size={12} /></button>
                  </span>
                )}
                <button type="button" onClick={handleClearFilters} className="clear-all-chips-btn">
                  Hamısını təmizlə
                </button>
              </div>
            </div>
          )}

          {/* Premium Modern Table Panel */}
          <article className="panel table-panel crm-table-panel-redesign">
            <div className="table-panel-header-new">
              <h2>Müraciət Verilənləri Bazası</h2>
              <span className="table-count-indicator">{data.leads.length} Qeyd tapıldı</span>
            </div>

            <div className="data-table-wrap-redesign">
              <table className="data-table-redesign">
                <thead>
                  <tr>
                    <th>Müraciət edən</th>
                    <th>Mənbə</th>
                    <th>Proqram</th>
                    <th>Məsul şəxs</th>
                    <th>Status</th>
                    <th>Prioritet</th>
                    <th>Növbəti addım</th>
                    <th>İzləmə tarixi</th>
                    <th>Əməliyyat</th>
                    <th>Son Qeyd</th>
                  </tr>
                </thead>
                <tbody>
                  {data.leads.length > 0 ? (
                    data.leads.map((lead) => (
                      <tr key={lead.id} className="table-row-interactive">
                        <td>
                          <div className="lead-identity-cell">
                            <LeadDetailDialog
                              lead={lead}
                              managers={data.managers}
                              programs={data.programs}
                              sourceOptions={data.sourceOptions}
                              returnTo={data.returnTo}
                            />
                            <span className="lead-phone-display">{lead.phone}</span>
                          </div>
                        </td>
                        <td>
                          <span className="lead-source-tag">{lead.source}</span>
                        </td>
                        <td>
                          <div className="lead-program-cell">
                            <strong>{lead.program}</strong>
                          </div>
                        </td>
                        <td>
                          <div className="lead-owner-cell">
                            <User size={12} className="owner-avatar-icon" />
                            <span>{lead.manager}</span>
                          </div>
                        </td>
                        <td>
                          <StatusChip tone={lead.stageTone}>{lead.stageLabel}</StatusChip>
                        </td>
                        <td>
                          <StatusChip tone={lead.priorityTone}>{lead.priorityLabel}</StatusChip>
                        </td>
                        <td>
                          <span className="lead-action-badge">{lead.nextActionTypeLabel}</span>
                        </td>
                        <td>
                          <div className="lead-date-cell">
                            <Calendar size={12} className="date-calendar-icon" />
                            <span className={lead.nextActionTypeLabel === "Gecikib" ? "text-danger-strong" : ""}>
                              {lead.nextFollowUpAt}
                            </span>
                          </div>
                        </td>
                        <td>
                          <form action={convertLeadToStudentAction} className="convert-form">
                            <input type="hidden" name="leadId" value={lead.id} />
                            <input type="hidden" name="returnTo" value={data.returnTo} />
                            <Button
                              type="submit"
                              variant={lead.canConvert ? "default" : "ghost"}
                              size="sm"
                              className={`convert-student-btn ${lead.canConvert ? "is-convertible" : ""}`}
                              disabled={!lead.canConvert || !data.access.canConvertLead}
                              aria-disabled={!lead.canConvert || !data.access.canConvertLead}
                              title={lead.canConvert ? "Tələbə kimi qeydiyyata al" : lead.conversionLabel}
                            >
                              {lead.canConvert ? <CheckCircle2 size={14} className="check-icon" /> : null}
                              <span>{lead.conversionLabel}</span>
                            </Button>
                          </form>
                        </td>
                        <td>
                          <div className="lead-note-tooltip-cell">
                            <span className="lead-latest-note">{lead.latestNote || "Qeyd yoxdur"}</span>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10}>
                        <div className="empty-state-redesign">
                          <AlertCircle size={40} className="empty-icon" />
                          <h3>Müraciət Tapılmadı</h3>
                          <p>Seçilmiş filtrlərə uyğun heç bir namizəd tapılmadı. Süzgəcləri dəyişərək yenidən yoxlayın.</p>
                          <button type="button" onClick={handleClearFilters} className="ui-button ui-button-secondary ui-button-sm">
                            Filtrləri təmizlə
                          </button>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      )}
    </section>
  );
}

/* Beautiful Focus Panel Helper Component */
function FocusPanelRedesign({
  title,
  emptyText,
  items,
  icon,
  onItemClick,
}: {
  title: string;
  emptyText: string;
  items: CrmData["attentionFocus"];
  icon: React.ReactNode;
  onItemClick: (leadId: string) => void;
}) {
  return (
    <article className="panel crm-focus-panel-redesign">
      <div className="panel-head-redesign">
        <div className="focus-panel-title-area">
          {icon}
          <h2>{title}</h2>
        </div>
        <span className="focus-count-tag">{items.length} müraciət</span>
      </div>
      <div className="crm-focus-list-redesign">
        {items.length > 0 ? (
          items.map((item) => (
            <div
              key={item.id}
              onClick={() => onItemClick(item.name)}
              className="crm-focus-row-redesign"
              title="Bu müraciəti axtar"
            >
              <div className="focus-lead-info">
                <strong>{item.name}</strong>
                <span>{item.phone} • Məsul: {item.manager}</span>
              </div>
              <div className="focus-lead-meta">
                {item.reasonLabels.length > 0 ? (
                  <div className="crm-focus-reason-list">
                    {item.reasonLabels.map((reason) => (
                      <span key={reason}>{reason}</span>
                    ))}
                  </div>
                ) : null}
                <StatusChip tone={item.priorityTone}>{item.priorityLabel}</StatusChip>
                <div className="focus-next-action-tag">
                  <Clock size={10} />
                  <span>{item.nextActionTypeLabel}</span>
                </div>
                <small className="focus-date-time">{item.nextFollowUpAt}</small>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state compact">{emptyText}</div>
        )}
      </div>
    </article>
  );
}

/* Beautiful Statistical Breakdown List Helper Component */
function BreakdownListRedesign({
  title,
  subtitle,
  icon,
  items,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  items: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="crm-breakdown-card-redesign">
      <div className="breakdown-card-header">
        <div className="breakdown-title-wrapper">
          {icon}
          <h3>{title}</h3>
        </div>
        <span className="breakdown-subtitle">{subtitle}</span>
      </div>
      <div className="breakdown-card-content">
        {items.length > 0 ? (
          items.map((item) => (
            <div className="breakdown-row-redesign" key={`${title}-${item.label}`}>
              <span className="breakdown-row-label">{item.label}</span>
              <b className="breakdown-row-value">{item.value}</b>
            </div>
          ))
        ) : (
          <span className="crm-breakdown-empty">Məlumat mövcud deyil</span>
        )}
      </div>
    </div>
  );
}
