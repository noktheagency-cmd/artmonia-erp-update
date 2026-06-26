"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { 
  GraduationCap, 
  List, 
  BarChart3, 
  SlidersHorizontal, 
  Sparkles, 
  AlertCircle, 
  Calendar, 
  User, 
  X, 
  Wallet, 
  DollarSign, 
  TrendingUp, 
  Activity,
  ArrowRight,
  Percent,
  Layers,
  Users
} from "lucide-react";
import { StatusChip } from "@/components/ui/status-chip";
import { createStudentAction } from "@/modules/students/actions";
import { StudentCreateDialogClient } from "@/modules/students/student-create-dialog-client";
import { StudentFilterForm } from "@/modules/students/student-filter-form";
import type { StudentListData } from "@/modules/students/queries";

const visibleStatuses = [
  "ACTIVE",
  "DEBT",
  "GROUP_WAITING",
  "FROZEN",
  "STOPPED",
  "DECLINED",
] as const;

export function StudentList({ data }: { data: StudentListData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Tab state synchronized with URL search parameter 'tab'
  const tabParam = searchParams.get("tab");
  const activeTab = tabParam === "list" ? "list" : "overview";

  function handleTabChange(tab: "overview" | "list") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    router.push(`/students?${params.toString()}`);
  }

  function handleQuickFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set("tab", "list"); // Switch to list tab to view filtered table
    router.push(`/students?${params.toString()}`);
  }

  function handleMetricCardClick(index: number) {
    const statusVal = visibleStatuses[index];
    handleQuickFilter("status", statusVal);
  }

  function handleClearFilters() {
    const params = new URLSearchParams();
    params.set("tab", activeTab);
    router.push(`/students?${params.toString()}`);
  }

  const activeFiltersCount = data.filters.activeCount;

  // --- Live Statistics Calculations from the Dataset ---
  const totalStudentsCount = data.total;
  const debtStudentsCount = parseInt(data.statusSummary[1]?.value.replace(/\D/g, "") || "0");
  const activeStudentsCount = parseInt(data.statusSummary[0]?.value.replace(/\D/g, "") || "0");
  const waitingStudentsCount = parseInt(data.statusSummary[2]?.value.replace(/\D/g, "") || "0");
  const frozenStudentsCount = parseInt(data.statusSummary[3]?.value.replace(/\D/g, "") || "0");
  const stoppedStudentsCount = parseInt(data.statusSummary[4]?.value.replace(/\D/g, "") || "0");
  const declinedStudentsCount = parseInt(data.statusSummary[5]?.value.replace(/\D/g, "") || "0");

  let paidCount = 0;
  let debtCount = 0;
  let totalDebt = 0;
  
  const programCounts: Record<string, number> = {};
  const teacherCounts: Record<string, number> = {};
  const topDebtors: typeof data.students = [];

  data.students.forEach(student => {
    const isDebt = student.paymentTone === "danger" || student.paymentTone === "warning";
    const balanceVal = parseFloat(student.balance.replace(/[^0-9.]/g, "")) || 0;
    
    if (isDebt) {
      debtCount++;
      totalDebt += balanceVal;
      if (balanceVal > 0) {
        topDebtors.push(student);
      }
    } else {
      paidCount++;
    }

    // Program grouping
    if (student.program) {
      programCounts[student.program] = (programCounts[student.program] || 0) + 1;
    }
    // Teacher grouping
    if (student.teacher) {
      teacherCounts[student.teacher] = (teacherCounts[student.teacher] || 0) + 1;
    }
  });

  // Sort top debtors by balance descending
  topDebtors.sort((a, b) => {
    const aVal = parseFloat(a.balance.replace(/[^0-9.]/g, "")) || 0;
    const bVal = parseFloat(b.balance.replace(/[^0-9.]/g, "")) || 0;
    return bVal - aVal;
  });

  const collectionRate = totalStudentsCount > 0 ? Math.round((paidCount / totalStudentsCount) * 100) : 100;

  // Donut chart calculations
  const radius = 38;
  const circumference = 2 * Math.PI * radius; // ~238.76159
  const dashOffset = circumference - (collectionRate / 100) * circumference;

  const SEGMENT_COLORS = [
    "#2b58f0", // Royal Blue
    "#ff4757", // Coral Red
    "#f59e0b", // Amber Yellow
    "#10b981", // Neon Mint
    "#a855f7", // Purple
    "#3b82f6", // Sky Blue
    "#ec4899", // Pink
    "#f97316", // Orange
  ];

  // Program segments
  const programEntries = Object.entries(programCounts);
  const totalProgramStudents = programEntries.reduce((sum, [_, count]) => sum + count, 0);
  let cumulativeOffset = 0;
  const programSegments = programEntries.map(([name, count], index) => {
    const percentage = totalProgramStudents > 0 ? (count / totalProgramStudents) * 100 : 0;
    const strokeLength = (percentage / 100) * circumference;
    const strokeSpace = circumference - strokeLength;
    const offset = cumulativeOffset;
    cumulativeOffset += strokeLength;

    return {
      name,
      count,
      percentage: Math.round(percentage),
      strokeDasharray: `${strokeLength} ${strokeSpace}`,
      strokeDashoffset: -offset,
      color: SEGMENT_COLORS[index % SEGMENT_COLORS.length]
    };
  });

  // Teacher segments
  const teacherEntries = Object.entries(teacherCounts);
  const totalTeacherStudents = teacherEntries.reduce((sum, [_, count]) => sum + count, 0);
  let cumulativeTeacherOffset = 0;
  const teacherSegments = teacherEntries.map(([name, count], index) => {
    const percentage = totalTeacherStudents > 0 ? (count / totalTeacherStudents) * 100 : 0;
    const strokeLength = (percentage / 100) * circumference;
    const strokeSpace = circumference - strokeLength;
    const offset = cumulativeTeacherOffset;
    cumulativeTeacherOffset += strokeLength;

    return {
      name,
      count,
      percentage: Math.round(percentage),
      strokeDasharray: `${strokeLength} ${strokeSpace}`,
      strokeDashoffset: -offset,
      color: SEGMENT_COLORS[(index + 3) % SEGMENT_COLORS.length]
    };
  });

  // Formatting date range label
  const dateFromText = data.filters.dateFrom || "Başlanğıc";
  const dateToText = data.filters.dateTo || "Son tarix";
  const activeDateRangeLabel = data.filters.dateFrom || data.filters.dateTo 
    ? `${dateFromText} - ${dateToText}` 
    : "Bütün dövr";

  return (
    <section className="page-stack operational-page student-redesign-page">
      {/* Navigation transition progress indicator */}
      <div className="route-progress" aria-hidden={!isPending} data-visible={isPending} />

      {/* --- REDESIGNED UNIFIED PANEL (HEADER & FILTERS IN ONE CARD) --- */}
      <div className="crm-unified-filter-panel">
        {/* --- PREMIUM COMPACT HEADER (SCREENSHOT LAYOUT) --- */}
        <div className="student-header-compact" style={{ marginBottom: 0 }}>
          <div className="header-title-wrapper-compact">
            <div className="crm-eyebrow-compact">
              <span className="eyebrow-pill pill-primary">Artmonia ERP</span>
              <span className="eyebrow-pill pill-date">{activeDateRangeLabel}</span>
            </div>
            <div className="title-row-compact">
              <h1>Tələbələr və Balans</h1>
            </div>
            <p className="crm-header-desc" style={{ marginBottom: 0 }}>
              Tələbələrin qeydiyyat, proqram, ödəniş statusu və maliyyə balansları bir yerdə aydın görünür.
            </p>
          </div>
          
          <div className="header-actions-wrapper-compact">
            {/* Compact Financial Summary Badge */}
            <div className="financial-summary-badge-compact">
              <Wallet size={14} className="text-tone-danger" />
              <span className="label-text">Gecikən borc:</span>
              <strong className="value-text">{totalDebt.toLocaleString()} ₼</strong>
            </div>
            
            <StudentCreateDialogClient
              createOptions={data.createOptions}
              canCreateStudent={data.permissions.canCreateStudent}
              canConvertLead={data.permissions.canConvertLead}
              canRecordPayment={data.permissions.canRecordPayment}
              returnTo={data.returnTo}
              createStudentAction={createStudentAction}
            />
          </div>
        </div>

        <div className="filter-header-divider" />

        {/* Redesigned Student Search & Filter Panel (shared across list tab) */}
        <StudentFilterForm
          filterOptions={data.filterOptions}
          filters={data.filters}
          query={data.query}
        />
      </div>

      {/* --- REDESIGNED PREMIUM HORIZONTAL METRICS GRID (6 CARDS, SCREENSHOT STYLE) --- */}
      <div className="metrics-grid-premium" aria-label="Tələbə statistika kartları">
        {data.statusSummary.map((item, index) => {
          const isBlue = item.tone === "blue";
          const isCoral = item.tone === "coral";
          const isYellow = item.tone === "yellow";
          const isMint = item.tone === "mint";

          // Icon assignment
          let Icon = GraduationCap;
          if (index === 1) Icon = DollarSign;
          if (index === 2) Icon = Activity;
          if (index === 3) Icon = Calendar;
          if (index === 4) Icon = AlertCircle;
          if (index === 5) Icon = X;

          return (
            <div
              key={item.label}
              onClick={() => handleMetricCardClick(index)}
              className={`metric-card-premium tone-${item.tone}`}
              title={`${item.label} - Siyahıya bax`}
            >
              <div className="card-top-row">
                <span className="card-label">{item.label}</span>
                <div className="card-icon-square">
                  <Icon size={16} />
                </div>
              </div>
              
              <div className="card-value-row">
                <strong>{item.value}</strong>
              </div>
              
              <div className="card-bottom-row">
                <span>{item.delta}</span>
                <span className="card-action-text">Siyahı →</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* --- PREMIUM SEGMENTED TAB SWITCHER (SCREENSHOT STYLE) --- */}
      <div className="crm-tabs-navigation student-tabs-navigation">
        <div className="tabs-segmented-container">
          <button
            type="button"
            onClick={() => handleTabChange("overview")}
            className={`tab-segmented-item ${activeTab === "overview" ? "is-active" : ""}`}
          >
            <BarChart3 size={15} />
            <span>Balans İcmalı</span>
          </button>
          
          <button
            type="button"
            onClick={() => handleTabChange("list")}
            className={`tab-segmented-item ${activeTab === "list" ? "is-active" : ""}`}
          >
            <List size={15} />
            <span>Tələbə Siyahısı</span>
            <span className="tab-segmented-badge">{data.total}</span>
          </button>
        </div>

        {activeFiltersCount > 0 && (
          <button type="button" onClick={handleClearFilters} className="crm-reset-filters-btn">
            <SlidersHorizontal size={14} />
            <span>Filtrləri sıfırla ({activeFiltersCount})</span>
          </button>
        )}
      </div>

      {/* TAB 1: BALANCE OVERVIEW (DASHBOARD) */}
      {activeTab === "overview" && (
        <div className="crm-dashboard-layout student-dashboard-layout animate-fade-in">
          
          {/* Main Highlights Panels */}
          <div className="student-highlights-grid">
            <div className="student-highlight-main-card-compact">
              <div className="compact-card-body">
                <div className="compact-card-left">
                  <span className="compact-card-title">Cəmi Aktiv Tədris</span>
                  <strong className="compact-card-value">{activeStudentsCount}</strong>
                  <span className="compact-card-footer-text">
                    Ümumi qeydiyyat: <b>{totalStudentsCount} tələbə</b>
                  </span>
                </div>
                <div className="compact-card-right">
                  <div className="compact-card-icon-wrapper">
                    <GraduationCap size={20} />
                  </div>
                </div>
              </div>
            </div>

            <div 
              className="student-highlight-stats-card-compact tone-coral"
              onClick={() => handleQuickFilter("payment", "overdue")}
            >
              <div className="compact-card-body">
                <div className="compact-card-left">
                  <span className="compact-card-title text-tone-danger">Borc Ödəniş İzləməsi</span>
                  <strong className="compact-card-value text-tone-danger">{debtStudentsCount}</strong>
                  <span className="compact-card-action-link text-tone-danger">Gecikənləri göstər →</span>
                </div>
                <div className="compact-card-right">
                  <div className="compact-card-icon-wrapper">
                    <Wallet size={18} />
                  </div>
                </div>
              </div>
            </div>

            <div 
              className="student-highlight-stats-card-compact tone-yellow"
              onClick={() => handleQuickFilter("status", "GROUP_WAITING")}
            >
              <div className="compact-card-body">
                <div className="compact-card-left">
                  <span className="compact-card-title text-tone-warning">Növbədə gözləyənlər</span>
                  <strong className="compact-card-value text-tone-warning">{waitingStudentsCount}</strong>
                  <span className="compact-card-action-link text-tone-warning">Qrupları göstər →</span>
                </div>
                <div className="compact-card-right">
                  <div className="compact-card-icon-wrapper">
                    <Activity size={18} />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Shadcn-style Financial & Academic Analytics Section */}
          <div className="student-dashboard-details-grid">
            {/* Column 1: Financial Health & Critical Debtors */}
            <div className="student-dashboard-column">
              
              {/* Financial Health Shadcn Card */}
              <div className="shadcn-card">
                <div className="shadcn-card-header">
                  <div className="shadcn-card-title-area">
                    <DollarSign size={18} className="text-tone-success" />
                    <h3>Maliyyə Sağlamlığı və Ödəniş Nisbəti</h3>
                  </div>
                  <span className="shadcn-card-badge bg-tone-success">{collectionRate}% Toplanıb</span>
                </div>
                <div className="shadcn-card-content">
                  <div className="donut-card-content">
                    <div className="donut-chart-wrapper">
                      <svg width="110" height="110" viewBox="0 0 100 100" className="donut-chart-svg">
                        <circle cx="50" cy="50" r="38" fill="transparent" stroke="#f1f3f5" strokeWidth="8" />
                        <circle 
                          cx="50" 
                          cy="50" 
                          r="38" 
                          fill="transparent" 
                          stroke="var(--mint)" 
                          strokeWidth="8"
                          strokeDasharray={circumference} 
                          strokeDashoffset={dashOffset}
                          strokeLinecap="round"
                          transform="rotate(-90 50 50)" 
                          style={{ transition: "stroke-dashoffset 0.5s ease" }}
                        />
                        <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fontWeight="800" fontSize="16" fill="var(--ink)">
                          {collectionRate}%
                        </text>
                      </svg>
                    </div>

                    <div className="dashboard-distribution-list-compact">
                      <div className="financial-breakdown-row-compact">
                        <div className="breakdown-label-with-dot">
                          <span className="dot dot-success" />
                          <span className="name">Tam ödəniş edənlər</span>
                        </div>
                        <b className="count">{paidCount} ({collectionRate}%)</b>
                      </div>
                      <div className="financial-breakdown-row-compact">
                        <div className="breakdown-label-with-dot">
                          <span className="dot dot-danger" />
                          <span className="name">Borcu olanlar</span>
                        </div>
                        <b className="count">{debtCount} ({100 - collectionRate}%)</b>
                      </div>
                      <div className="financial-breakdown-row-compact">
                        <div className="breakdown-label-with-dot">
                          <span className="dot dot-warning" />
                          <span className="name">Qrup gözləyənlər</span>
                        </div>
                        <b className="count">{waitingStudentsCount} təl.</b>
                      </div>
                      <div className="financial-breakdown-row-compact">
                        <div className="breakdown-label-with-dot">
                          <span className="dot dot-info" />
                          <span className="name">Dondurulanlar</span>
                        </div>
                        <b className="count">{frozenStudentsCount} təl.</b>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Critical Balances / Top Debtors Card */}
              <div className="shadcn-card">
                <div className="shadcn-card-header">
                  <div className="shadcn-card-title-area">
                    <AlertCircle size={18} className="text-tone-danger" />
                    <h3>Kritik Balans İzləməsi (Top Gecikmələr)</h3>
                  </div>
                  <span className="shadcn-card-badge bg-tone-danger">Top {Math.min(5, topDebtors.length)}</span>
                </div>
                <div className="shadcn-card-content">
                  <div className="top-debtors-list-compact">
                    {topDebtors.length > 0 ? (
                      topDebtors.slice(0, 4).map((student) => (
                        <div 
                          key={student.code} 
                          className="top-debtor-row-compact"
                          onClick={() => handleQuickFilter("q", student.name)}
                          title="Tələbəni siyahıda axtar"
                        >
                          <div className="debtor-info">
                            <strong>{student.name}</strong>
                            <span>{student.code} • {student.program}</span>
                          </div>
                          <div className="debtor-balance-badge-compact">
                            <span>{student.balance}</span>
                            <ArrowRight size={11} className="arrow-icon" />
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="empty-state compact">Borcu olan tələbə yoxdur</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Column 2: Program Distribution & Teacher Load */}
            <div className="student-dashboard-column">
              
              {/* Program Distribution Card */}
              <div className="shadcn-card">
                <div className="shadcn-card-header">
                  <div className="shadcn-card-title-area">
                    <Layers size={18} className="text-primary" />
                    <h3>Təhsil Proqramlarının Paylanması</h3>
                  </div>
                  <span className="shadcn-card-badge bg-primary-light">{Object.keys(programCounts).length} Proqram</span>
                </div>
                <div className="shadcn-card-content">
                  <div className="donut-card-content">
                    <div className="donut-chart-wrapper">
                      <svg width="110" height="110" viewBox="0 0 100 100" className="donut-chart-svg">
                        <circle cx="50" cy="50" r="38" fill="transparent" stroke="#f1f3f5" strokeWidth="8" />
                        {programSegments.map((segment) => (
                          <circle
                            key={segment.name}
                            cx="50"
                            cy="50"
                            r="38"
                            fill="transparent"
                            stroke={segment.color}
                            strokeWidth="8"
                            strokeDasharray={segment.strokeDasharray}
                            strokeDashoffset={segment.strokeDashoffset}
                            transform="rotate(-90 50 50)"
                            style={{ transition: "stroke-dashoffset 0.5s ease" }}
                          />
                        ))}
                        <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fontWeight="800" fontSize="13" fill="var(--ink)">
                          Proqram
                        </text>
                      </svg>
                    </div>

                    <div className="dashboard-distribution-list-compact">
                      {programSegments.slice(0, 4).map((segment) => (
                        <div 
                          key={segment.name} 
                          className="distribution-item-compact"
                          onClick={() => handleQuickFilter("program", data.filterOptions.programs.find(p => p.label === segment.name)?.value || "")}
                          title="Bu proqramı filtrlə"
                        >
                          <span className="dot" style={{ backgroundColor: segment.color }} />
                          <span className="name">{segment.name}</span>
                          <span className="count">{segment.count} ({segment.percentage}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Teacher Workload Card */}
              <div className="shadcn-card">
                <div className="shadcn-card-header">
                  <div className="shadcn-card-title-area">
                    <Users size={18} className="text-tone-warning" />
                    <h3>Müəllimlərin Tələbə Yükü</h3>
                  </div>
                  <span className="shadcn-card-badge bg-warning-light">{Object.keys(teacherCounts).length} Müəllim</span>
                </div>
                <div className="shadcn-card-content">
                  <div className="donut-card-content">
                    <div className="donut-chart-wrapper">
                      <svg width="110" height="110" viewBox="0 0 100 100" className="donut-chart-svg">
                        <circle cx="50" cy="50" r="38" fill="transparent" stroke="#f1f3f5" strokeWidth="8" />
                        {teacherSegments.map((segment) => (
                          <circle
                            key={segment.name}
                            cx="50"
                            cy="50"
                            r="38"
                            fill="transparent"
                            stroke={segment.color}
                            strokeWidth="8"
                            strokeDasharray={segment.strokeDasharray}
                            strokeDashoffset={segment.strokeDashoffset}
                            transform="rotate(-90 50 50)"
                            style={{ transition: "stroke-dashoffset 0.5s ease" }}
                          />
                        ))}
                        <text x="50%" y="54%" dominantBaseline="middle" textAnchor="middle" fontWeight="800" fontSize="13" fill="var(--ink)">
                          Müəllim
                        </text>
                      </svg>
                    </div>

                    <div className="dashboard-distribution-list-compact">
                      {teacherSegments.slice(0, 4).map((segment) => (
                        <div 
                          key={segment.name} 
                          className="distribution-item-compact"
                          onClick={() => handleQuickFilter("teacher", data.filterOptions.teachers.find(t => t.label === segment.name)?.value || "")}
                          title="Bu müəllimi filtrlə"
                        >
                          <span className="dot" style={{ backgroundColor: segment.color }} />
                          <span className="name">{segment.name}</span>
                          <span className="count">{segment.count} ({segment.percentage}%)</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: STUDENT AND BALANCE LIST */}
      {activeTab === "list" && (
        <div className="crm-list-layout student-list-layout animate-fade-in">
          {/* Active Filter Chips Summary */}
          {activeFiltersCount > 0 && (
            <div className="crm-active-chips-wrapper" aria-label="Aktiv filtrlər">
              <span className="chips-title">Aktiv süzgəclər:</span>
              <div className="chips-container">
                <span>{data.students.length} tələbə tapıldı</span>
                {data.filters.status && (
                  <span className="filter-chip-item">
                    Status: {data.filterLabels.status}
                    <button type="button" onClick={() => handleQuickFilter("status", "")}><X size={12} /></button>
                  </span>
                )}
                {data.filters.payment !== "all" && (
                  <span className="filter-chip-item">
                    Ödəniş: {data.filterLabels.payment}
                    <button type="button" onClick={() => handleQuickFilter("payment", "all")}><X size={12} /></button>
                  </span>
                )}
                {data.filters.program && (
                  <span className="filter-chip-item">
                    Proqram: {data.filterLabels.program}
                    <button type="button" onClick={() => handleQuickFilter("program", "")}><X size={12} /></button>
                  </span>
                )}
                {data.filters.teacher && (
                  <span className="filter-chip-item">
                    Müəllim: {data.filterLabels.teacher}
                    <button type="button" onClick={() => handleQuickFilter("teacher", "")}><X size={12} /></button>
                  </span>
                )}
                {(data.filters.dateFrom || data.filters.dateTo) && (
                  <span className="filter-chip-item">
                    Qeydiyyat: {data.filters.dateFrom || "*"} - {data.filters.dateTo || "*"}
                    <button type="button" onClick={() => {
                      const params = new URLSearchParams(searchParams.toString());
                      params.delete("from");
                      params.delete("to");
                      router.push(`/students?${params.toString()}`);
                    }}><X size={12} /></button>
                  </span>
                )}
                <button type="button" onClick={handleClearFilters} className="clear-all-chips-btn">
                  Hamısını təmizlə
                </button>
              </div>
            </div>
          )}

          {/* Premium Modern Student Table Panel */}
          <article className="panel table-panel crm-table-panel-redesign student-table-panel-redesign">
            <div className="table-panel-header-new">
              <h2>Tələbə Məlumatları və Balans Ledger-i</h2>
              <span className="table-count-indicator">{data.students.length} tələbə siyahıdadır</span>
            </div>

            <div className="data-table-wrap-redesign">
              <table className="data-table-redesign student-table-redesign">
                <thead>
                  <tr>
                    <th>Tələbə (Kod / Telefon)</th>
                    <th>Tədris Proqramı</th>
                    <th>Müəllim</th>
                    <th>Növbəti Ödəniş Tarixi</th>
                    <th>Maliyyə Balansı</th>
                    <th>Ödəniş Statusu</th>
                    <th>Lifecycle Statusu</th>
                    <th>Son Əlaqə</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.length > 0 ? (
                    data.students.map((student) => {
                      const hasDebt = student.paymentTone === "danger" || student.paymentTone === "warning";
                      
                      return (
                        <tr key={student.code} className={`table-row-interactive ${hasDebt ? "row-has-debt" : ""}`}>
                          <td>
                            <Link href={`/students/${student.id}` as Route} className="student-open-link-redesign">
                              <div className="student-identity-cell-new">
                                <strong className="student-fullname">{student.name}</strong>
                                <span className="student-subtext">
                                  {student.code} • {student.phone}
                                </span>
                              </div>
                            </Link>
                          </td>
                          <td>
                            <div className="student-program-cell">
                              <strong>{student.program}</strong>
                            </div>
                          </td>
                          <td>
                            <div className="student-teacher-cell">
                              <User size={12} className="teacher-avatar-icon" />
                              <span>{student.teacher}</span>
                            </div>
                          </td>
                          <td>
                            <div className="student-date-cell">
                              <Calendar size={12} className="date-calendar-icon" />
                              <span className={hasDebt ? "text-danger-strong" : ""}>
                                {student.dueDate}
                              </span>
                            </div>
                          </td>
                          <td>
                            <span 
                              className={`student-balance-redesign-tag ${hasDebt ? "is-debt" : "is-paid"}`}
                              data-debt={hasDebt}
                            >
                              {student.balance}
                            </span>
                          </td>
                          <td>
                            <StatusChip tone={student.paymentTone}>
                              {student.paymentStatus}
                            </StatusChip>
                          </td>
                          <td>
                            <StatusChip tone={student.lifecycleTone}>
                              {student.lifecycleStatus}
                            </StatusChip>
                          </td>
                          <td>
                            <span className="student-lastcontact-text">{student.lastContact}</span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={8}>
                        <div className="empty-state-redesign">
                          <AlertCircle size={40} className="empty-icon" />
                          <h3>Tələbə Tapılmadı</h3>
                          <p>Seçilmiş filtrlərə uyğun heç bir tələbə qeydi tapılmadı. Süzgəcləri dəyişərək yenidən yoxlayın.</p>
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
