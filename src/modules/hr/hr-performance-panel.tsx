"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  CalendarDays,
  CircleDollarSign,
  CheckCircle2,
  Gauge,
  GraduationCap,
  LineChart,
  Pencil,
  PhoneCall,
  PhoneIncoming,
  Plus,
  RefreshCcw,
  Save,
  Search,
  Sparkles,
  Table2,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  Trophy,
  UsersRound,
  WalletCards,
  Clock,
  TimerReset,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusChip } from "@/components/ui/status-chip";
import { cx } from "@/components/ui/cx";
import { EmployeeCrud } from "@/modules/hr/employee-crud";
import { TeacherDirectoryPanel } from "@/modules/hr/teacher-directory-panel";
import {
  HrCompactChip,
  HrEmptyState,
  HrFunnelBand,
  HrInspector,
  HrMetricTile,
  HrPanel,
  HrPanelHeader,
  HrScoreBar,
  HrSparkline,
  HrTabs,
  HrToolbar,
  type HrTone,
} from "@/modules/hr/hr-ui";
import type {
  HrExcelCellValue,
  HrExcelTable,
  HrExcelTableRow,
  HrPerformanceData,
  HrPerformanceMetric,
  HrWeeklyFeedbackRow,
} from "@/modules/hr/performance-data";
import type { TeacherDirectoryData } from "@/modules/hr/teacher-directory-data";

type HrTabId = "overview" | "employees" | "teachers" | "daily" | "performance" | "feedback" | "targets";
type TableRowsSetter = Dispatch<SetStateAction<WorkspaceState>>;

type WorkspaceState = {
  dashboardSections: HrExcelTable[];
  monthlyTables: HrExcelTable[];
  dailyRows: HrExcelTableRow[];
  weeklyRows: HrWeeklyFeedbackRow[];
  generalRows: HrExcelTableRow[];
};

type ManagerSummary = {
  manager: string;
  days: number;
  hours: number;
  calls: number;
  answered: number;
  invites: number;
  liveConsults: number;
  sales: number;
  revenue: number;
  conversion: number;
  answerRate: number;
  revenuePerHour: number;
  callsPerHour: number;
  qualityScore: number;
  kpiBreakdown: {
    revenueTarget: number;
    salesTarget: number;
    conversion: number;
    efficiency: number;
    activity: number;
    quality: number;
  };
  score: number;
  tone: "success" | "warning" | "danger" | "info" | "neutral";
  status: string;
};

const allFilterValue = "__all";
const monthlyKpiTargets = {
  revenue: 3000,
  sales: 35,
  conversion: 0.12,
  revenuePerHour: 45,
  callsPerHour: 4,
  quality: 80,
};

const tabs: Array<{ id: HrTabId; label: string; icon: LucideIcon }> = [
  { id: "overview", label: "İcmal", icon: Activity },
  { id: "employees", label: "İşçilər", icon: UsersRound },
  { id: "teachers", label: "Müəllimlər", icon: GraduationCap },
  { id: "daily", label: "Gündəlik", icon: Table2 },
  { id: "performance", label: "Performans", icon: LineChart },
  { id: "feedback", label: "İnkişaf", icon: Sparkles },
  { id: "targets", label: "Aylıq nəticə", icon: Target },
];

const metricIcons: Record<string, LucideIcon> = {
  Gəlir: CircleDollarSign,
  Satış: BadgeCheck,
  Zəng: PhoneIncoming,
  "İş saatı": TimerReset,
};

const metricToneMap: Record<HrPerformanceMetric["tone"], HrTone> = {
  blue: "info",
  coral: "danger",
  yellow: "warning",
  mint: "success",
};

export function HrPerformancePanel({
  data,
  teacherData,
  teacherAccountAction,
}: {
  data: HrPerformanceData;
  teacherData: TeacherDirectoryData;
  teacherAccountAction: (formData: FormData) => Promise<void>;
}) {
  const initialWorkspace = useMemo(() => createWorkspaceState(data), [data]);
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [activeTab, setActiveTab] = useState<HrTabId>("overview");
  const [managerFilter, setManagerFilter] = useState(data.filters.manager);
  const [monthFilter, setMonthFilter] = useState(data.filters.month);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const metrics = useMemo(
    () => buildOverviewMetrics(workspace.dashboardSections[2]?.rows ?? data.dashboard.sections[2]?.rows ?? []),
    [data.dashboard.sections, workspace.dashboardSections]
  );
  const managerSummaries = useMemo(
    () => buildManagerSummaries(workspace.dashboardSections[2]?.rows ?? [], workspace.weeklyRows),
    [workspace.dashboardSections, workspace.weeklyRows]
  );
  const visibleManagerSummaries = useMemo(
    () =>
      managerFilter
        ? managerSummaries.filter((summary) => summary.manager === managerFilter)
        : managerSummaries,
    [managerFilter, managerSummaries]
  );
  const filteredDailyRows = useMemo(
    () => filterRows(workspace.dailyRows, managerFilter, monthFilter, dateFrom, dateTo),
    [dateFrom, dateTo, managerFilter, monthFilter, workspace.dailyRows]
  );
  const filteredWeeklyRows = useMemo(
    () => filterRows(workspace.weeklyRows, managerFilter, monthFilter, dateFrom, dateTo),
    [dateFrom, dateTo, managerFilter, monthFilter, workspace.weeklyRows]
  );
  const visibleRowCount =
    activeTab === "daily"
      ? filteredDailyRows.length
      : activeTab === "feedback"
        ? filteredWeeklyRows.length
        : dateFrom || dateTo
          ? filteredDailyRows.length
          : visibleManagerSummaries.length;
  const activePeriodLabel =
    data.monthOptions.find((option) => option.value === monthFilter)?.label ?? "Bütün dövr";
  const activeDateLabel =
    dateFrom || dateTo
      ? `${dateFrom || "Başlanğıc"} - ${dateTo || "Son tarix"}`
      : activePeriodLabel;

  return (
    <section className="page-stack hr-page hr-redesign-page">
      <div className="crm-unified-filter-panel hr-unified-command-panel">
        <div className="student-header-compact hr-redesign-header" style={{ marginBottom: 0 }}>
          <div className="header-title-wrapper-compact">
            <div className="crm-eyebrow-compact">
              <span className="eyebrow-pill pill-primary">Artmonia HR</span>
              <span className="eyebrow-pill pill-date">{activeDateLabel}</span>
            </div>
            <div className="title-row-compact">
              <h1>HR idarəetmə paneli</h1>
            </div>
            <p className="crm-header-desc" style={{ marginBottom: 0 }}>
              İşçi bazası, gündəlik aktivlik, performans analitikası və inkişaf qeydləri eyni əməliyyat ritmində görünür.
            </p>
          </div>

          <div className="header-actions-wrapper-compact">
            <div className="financial-summary-badge-compact hr-summary-badge">
              <Clock size={14} className="text-tone-primary" />
              <span className="label-text">Son yenilənmə:</span>
              <strong className="value-text">{data.labels.latestUpdate}</strong>
            </div>
          </div>
        </div>

        <div className="filter-header-divider" />

        <FilterBar
          data={data}
          managerFilter={managerFilter}
          monthFilter={monthFilter}
          dateFrom={dateFrom}
          dateTo={dateTo}
          rowCount={visibleRowCount}
          setManagerFilter={setManagerFilter}
          setMonthFilter={setMonthFilter}
          setDateFrom={setDateFrom}
          setDateTo={setDateTo}
        />
      </div>

      <HrTabs tabs={tabs} activeTab={activeTab} onSelect={setActiveTab} />

      {activeTab === "overview" && (
        <OverviewTab
          data={data}
          managerSummaries={visibleManagerSummaries}
          metrics={metrics}
          weeklyRows={workspace.weeklyRows}
        />
      )}
      {activeTab === "employees" && <EmployeeCrud />}
      {activeTab === "teachers" && <TeacherDirectoryPanel data={teacherData} teacherAccountAction={teacherAccountAction} />}
      {activeTab === "daily" && (
        <DailyTab
          data={data}
          rows={filteredDailyRows}
          workspace={workspace}
          initialWorkspace={initialWorkspace}
          setWorkspace={setWorkspace}
        />
      )}
      {activeTab === "performance" && (
        <PerformanceTab
          managerSummaries={visibleManagerSummaries}
          monthlyTables={workspace.monthlyTables}
          onOpenTargets={() => setActiveTab("targets")}
        />
      )}
      {activeTab === "feedback" && (
        <FeedbackTab
          managerSummaries={visibleManagerSummaries}
          rows={filteredWeeklyRows}
          workspace={workspace}
          initialWorkspace={initialWorkspace}
          setWorkspace={setWorkspace}
        />
      )}
      {activeTab === "targets" && (
        <TargetsTab
          managerSummaries={visibleManagerSummaries}
          workspace={workspace}
        />
      )}
    </section>
  );
}

function OverviewTab({
  data,
  metrics,
  managerSummaries,
  weeklyRows,
}: {
  data: HrPerformanceData;
  metrics: HrPerformanceMetric[];
  managerSummaries: ManagerSummary[];
  weeklyRows: HrWeeklyFeedbackRow[];
}) {
  const topRevenue = managerSummaries[0];
  const bestConversion = [...managerSummaries].sort((first, second) => second.conversion - first.conversion)[0];
  const riskManager = [...managerSummaries].sort((first, second) => first.score - second.score)[0];
  const feedbackCount = weeklyRows.reduce(
    (count, row) => count + row.wins.length + row.challenges.length + row.problems.length,
    0
  );

  return (
    <div className="hr-tab-content">
      <HrCommandCenter metrics={metrics} />

      <div className="hr-overview-grid">
        <HrPanel className="hr-decision-panel" as="article">
          <HrPanelHeader
            icon={BarChart3}
            eyebrow={`${data.daily.totalRows} gündəlik qeyd`}
            title="Qərar mərkəzi"
            description="Komandanın cari vəziyyəti, diqqət nöqtələri və növbəti əməliyyat addımları."
          />

          <div className="hr-decision-list">
            <DecisionItem
              icon={WalletCards}
              tone="success"
              label="Ən güclü nəticə"
              title={topRevenue ? topRevenue.manager : "Məlumat yoxdur"}
              description={
                topRevenue
                  ? `${formatNumber(topRevenue.revenue, 0)} AZN gəlir, ${formatNumber(topRevenue.revenuePerHour, 1)} AZN / saat`
                  : "Gəlir göstəricisi formalaşmayıb."
              }
            />
            <DecisionItem
              icon={Gauge}
              tone="info"
              label="Ən yaxşı konversiya"
              title={bestConversion ? bestConversion.manager : "Məlumat yoxdur"}
              description={
                bestConversion
                  ? `${formatNumber(bestConversion.conversion * 100, 1)}% zəngdən satışa dönüş`
                  : "Konversiya göstəricisi formalaşmayıb."
              }
            />
            <DecisionItem
              icon={AlertTriangle}
              tone={riskManager?.tone === "danger" ? "danger" : "warning"}
              label="Diqqət tələb edir"
              title={riskManager ? riskManager.manager : "Risk yoxdur"}
              description={
                riskManager
                  ? `${riskManager.score}/100 performans balı. Rəy və fəaliyyət planı izlənməlidir.`
                  : "Komanda üzrə risk siqnalı yoxdur."
              }
            />
            <DecisionItem
              icon={Sparkles}
              tone="neutral"
              label="Rəy həcmi"
              title={`${feedbackCount} qeyd`}
              description="Həftəlik müşahidələr inkişaf bölməsində fəaliyyət planı kimi idarə olunur."
            />
          </div>
        </HrPanel>

        <HrPanel className="hr-manager-board" as="article">
          <HrPanelHeader
            icon={UsersRound}
            eyebrow="Komanda icmalı"
            title="Menecer performansı"
            description="Bal, gəlir, satış və səmərəlilik üzrə müqayisəli görünüş."
          />

          <div className="hr-manager-list">
            {managerSummaries.map((summary) => (
              <ManagerScoreRow key={summary.manager} summary={summary} />
            ))}
          </div>
        </HrPanel>

        <HrPanel className="hr-overview-chart-panel" as="article">
          <HrPanelHeader
            icon={LineChart}
            eyebrow="Mikro trend"
            title="Komanda siqnalları"
            description="Zəng, dəvət, satış və gəlir ritmi yalnız icmal səviyyəsində göstərilir."
          />
          <div className="hr-signal-list">
            {managerSummaries.map((summary) => (
              <div className="hr-signal-row" key={summary.manager}>
                <div>
                  <strong>{summary.manager}</strong>
                  <span>{summary.status}</span>
                </div>
                <HrSparkline
                  tone={summary.tone}
                  values={[summary.calls, summary.answered, summary.invites, summary.sales, summary.revenuePerHour]}
                  label={`${summary.manager} mikro trend`}
                />
                <HrCompactChip tone={summary.tone}>{summary.score}/100</HrCompactChip>
              </div>
            ))}
          </div>
        </HrPanel>
      </div>
    </div>
  );
}

function HrCommandCenter({ metrics }: { metrics: HrPerformanceMetric[] }) {
  return (
    <section className="hr-command-center" aria-label="HR icmal göstəriciləri">
      <div className="hr-metric-grid" aria-label="HR icmal göstəriciləri">
        {metrics.map((item) => (
          <HrMetricTile
            key={item.label}
            icon={metricIcons[item.label] ?? BarChart3}
            label={item.label}
            value={item.value}
            helper={item.helper}
            tone={metricToneMap[item.tone]}
          />
        ))}
      </div>
    </section>
  );
}

function DailyTab({
  data,
  rows,
  workspace,
  initialWorkspace,
  setWorkspace,
}: {
  data: HrPerformanceData;
  rows: HrExcelTableRow[];
  workspace: WorkspaceState;
  initialWorkspace: WorkspaceState;
  setWorkspace: TableRowsSetter;
}) {
  const [selectedRowId, setSelectedRowId] = useState<string | null>(rows[0]?.id ?? null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<HrExcelTableRow | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const selectedRow = rows.find((r) => r.id === selectedRowId) || rows[0] || null;

  const filteredRows = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((row) =>
      row.cells.some((c) => String(c ?? "").toLowerCase().includes(query))
    );
  }, [rows, searchQuery]);

  const managers = useMemo(() => {
    return Array.from(new Set(workspace.dailyRows.map((r) => r.cells[1] as string).filter(Boolean)));
  }, [workspace.dailyRows]);

  const handleOpenCreate = () => {
    setEditingRow(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (row: HrExcelTableRow) => {
    setEditingRow(row);
    setDialogOpen(true);
  };

  const handleSaveDaily = (rawCells: HrExcelCellValue[]) => {
    const computedCells = calculateDailyCells(rawCells, data.daily.headers);
    if (editingRow) {
      setWorkspace((current) => {
        const nextRows = current.dailyRows.map((row) =>
          row.id === editingRow.id ? buildRowFromCells(computedCells, data.daily.headers, editingRow.id) : row
        );
        return {
          ...current,
          dailyRows: nextRows,
        };
      });
    } else {
      const nextRow = buildRowFromCells(computedCells, data.daily.headers);
      setWorkspace((current) => ({
        ...current,
        dailyRows: [nextRow, ...current.dailyRows],
      }));
      setSelectedRowId(nextRow.id);
    }
    setEditingRow(null);
  };

  const handleDeleteDaily = (rowId: string) => {
    setWorkspace((current) => ({
      ...current,
      dailyRows: current.dailyRows.filter((r) => r.id !== rowId),
    }));
    if (selectedRowId === rowId) {
      setSelectedRowId(null);
    }
  };

  const handleResetDaily = () => {
    setWorkspace((current) => ({
      ...current,
      dailyRows: cloneRows(initialWorkspace.dailyRows),
    }));
  };

  return (
    <HrPanel className="hr-sheet-panel hr-workspace-panel hr-daily-workspace" as="article">
      <SectionHead
        icon={Table2}
        eyebrow={`${filteredRows.length} / ${workspace.dailyRows.length} qeyd göstərilir`}
        title="Gündəlik aktivlik"
        description="İş saatı, zəng, dəvət, satış və gəlir qeydləri KPI hesablamasına bağlanır."
        meta="Məlumat girişi"
      />

      <HrToolbar className="hr-data-toolbar">
        <label className="table-search hr-data-search">
          <Search size={15} />
          <span className="sr-only">Cədvəldə axtar</span>
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Tarix, işçi və qeyd üzrə axtar..."
          />
        </label>
        <div className="hr-data-actions">
          <Button type="button" variant="outline" size="sm" onClick={handleResetDaily}>
            <RefreshCcw data-icon="inline-start" />
            Jurnalı sıfırla
          </Button>
          <Button type="button" size="sm" onClick={handleOpenCreate}>
            <Plus data-icon="inline-start" />
            Gündəlik qeyd əlavə et
          </Button>
        </div>
      </HrToolbar>

      <div className="hr-employee-layout">
        <div className="data-table-wrap hr-excel-table-wrap">
          <table className="data-table hr-excel-table hr-daily-compact-table">
            <thead>
              <tr>
                <th>Tarix</th>
                <th>Menecer</th>
                <th>İş Saatı</th>
                <th>Zəng</th>
                <th>Satış</th>
                <th>Gəlir (AZN)</th>
                <th>Qeyd</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.length > 0 ? (
                filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className={cx(row.id === selectedRow?.id && "is-selected")}
                    aria-selected={row.id === selectedRow?.id}
                    onClick={() => setSelectedRowId(row.id)}
                  >
                    <td>
                      <span className="hr-table-date">{formatCell(row.cells[0], "Tarix")}</span>
                    </td>
                    <td>
                      <div className="hr-table-person">
                        <span className="hr-table-avatar">{getInitials(getText(row.cells[1])) || "HR"}</span>
                        <div>
                          <strong>{getText(row.cells[1]) || "-"}</strong>
                          <small>{getText(row.cells[2]) || "--:--"} - {getText(row.cells[3]) || "--:--"}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="hr-table-pill is-hours">{formatCell(row.cells[4], "İş Saatı")} saat</span>
                    </td>
                    <td>
                      <span className="hr-table-pill is-info">{formatCell(row.cells[5], "Zəng (total)")}</span>
                    </td>
                    <td>
                      <span className={cx("hr-table-pill", toNumber(row.cells[10]) > 0 ? "is-success" : "is-muted")}>
                        {formatCell(row.cells[10], "Satış")}
                      </span>
                    </td>
                    <td>
                      <strong className="hr-table-money">{formatCell(row.cells[11], "Gəlir (AZN)")}</strong>
                    </td>
                    <td className="is-long-text">
                      <span className="hr-table-note">{getText(row.cells[12]) || "Qeyd yoxdur"}</span>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7}>
                    <HrEmptyState>Qeyd tapılmadı</HrEmptyState>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <DailyDetailCard
          row={selectedRow}
          onEdit={() => selectedRow && handleOpenEdit(selectedRow)}
          onDelete={() => selectedRow && handleDeleteDaily(selectedRow.id)}
        />
      </div>

      <DailyFormDialog
        key={editingRow ? editingRow.id : (dialogOpen ? "open" : "closed")}
        isOpen={dialogOpen}
        setIsOpen={setDialogOpen}
        editingRow={editingRow}
        managers={managers}
        onSave={handleSaveDaily}
      />
    </HrPanel>
  );
}

function DailyDetailCard({
  row,
  onEdit,
  onDelete,
}: {
  row: HrExcelTableRow | null;
  onEdit: () => void;
  onDelete: () => void;
}) {
  if (!row) {
    return (
      <HrInspector className="hr-employee-detail empty">
        <HrEmptyState>Seçilmiş qeyd yoxdur</HrEmptyState>
      </HrInspector>
    );
  }

  const getVal = (idx: number) => row.cells[idx] ?? null;

  return (
    <HrInspector className="hr-employee-detail hr-daily-detail-panel">
      <div className="hr-detail-top">
        <span className="hr-detail-avatar">{getInitials(getText(getVal(1)))}</span>
        <div>
          <strong>{getText(getVal(1))}</strong>
          <span>{formatDateValue(getText(getVal(0)))}</span>
        </div>
      </div>

      <div className="hr-detail-status-row">
        <StatusChip tone={toNumber(getVal(10)) > 2 ? "success" : "info"}>
          {toNumber(getVal(10)) > 0 ? "Satış var" : "Aktivlik"}
        </StatusChip>
        <span>Saatda Gəlir: {formatCell(getVal(18), "Saatda Gəlir")}</span>
      </div>

      <div className="hr-detail-list">
        <div className="hr-detail-item">
          <Clock size={15} />
          <div>
            <span>İş Saatı</span>
            <strong>{formatCell(getVal(4), "İş Saatı")} saat ({getText(getVal(2)) || "-"} - {getText(getVal(3)) || "-"})</strong>
          </div>
        </div>
        <div className="hr-detail-item">
          <PhoneCall size={15} />
          <div>
            <span>Zəng (total) / Cavab</span>
            <strong>{formatCell(getVal(5), "Zəng (total)")} / {formatCell(getVal(6), "Cavab Verilən")}</strong>
          </div>
        </div>
        <div className="hr-detail-item">
          <UsersRound size={15} />
          <div>
            <span>Dəvət / Canlı / Birbaşa</span>
            <strong>{formatCell(getVal(7), "Kons Dəvəti")} / {formatCell(getVal(8), "Canlı Kons/Sınaq")} / {formatCell(getVal(9), "Birbaşa Gəliş")}</strong>
          </div>
        </div>
        <div className="hr-detail-item">
          <WalletCards size={15} />
          <div>
            <span>Satış / Gəlir</span>
            <strong>{formatCell(getVal(10), "Satış")} / {formatCell(getVal(11), "Gəlir (AZN)")}</strong>
          </div>
        </div>
      </div>

      <div className="hr-detail-payroll">
        <span>Performans Göstəriciləri</span>
        <div className="hr-daily-kpi-subgrid">
          <div><small>Dəvət %</small> <b>{formatCell(getVal(13), "Dəvət %")}</b></div>
          <div><small>Konv %</small> <b>{formatCell(getVal(14), "Konv %")}</b></div>
          <div><small>Orta Çek</small> <b>{formatCell(getVal(15), "Orta Çek")}</b></div>
          <div><small>Saatda Satış</small> <b>{formatCell(getVal(16), "Saatda Satış")}</b></div>
          <div><small>Saatda Zəng</small> <b>{formatCell(getVal(17), "Saatda Zəng")}</b></div>
        </div>
      </div>

      <p className="hr-detail-note">{getText(getVal(12)) || "Qeyd daxil edilməyib"}</p>

      <div className="hr-detail-actions-row">
        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <Pencil data-icon="inline-start" />
          Redaktə
        </Button>
        <Button type="button" variant="ghost" size="sm" className="hr-delete-button" onClick={onDelete}>
          <Trash2 size={15} />
          Sil
        </Button>
      </div>
    </HrInspector>
  );
}

function DailyFormDialog({
  isOpen,
  setIsOpen,
  editingRow,
  managers,
  onSave,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  editingRow: HrExcelTableRow | null;
  managers: string[];
  onSave: (cells: HrExcelCellValue[]) => void;
}) {
  const [date, setDate] = useState(editingRow ? getText(editingRow.cells[0]) : "2026-06-17");
  const [manager, setManager] = useState(editingRow ? (getText(editingRow.cells[1]) || managers[0] || "") : (managers[0] || ""));
  const [startTime, setStartTime] = useState(editingRow ? getText(editingRow.cells[2]) : "13:00");
  const [endTime, setEndTime] = useState(editingRow ? getText(editingRow.cells[3]) : "19:00");
  const [hours, setHours] = useState(editingRow ? toNumber(editingRow.cells[4]) : 6);
  const [calls, setCalls] = useState(editingRow ? toNumber(editingRow.cells[5]) : 0);
  const [answered, setAnswered] = useState(editingRow ? toNumber(editingRow.cells[6]) : 0);
  const [invites, setInvites] = useState(editingRow ? toNumber(editingRow.cells[7]) : 0);
  const [live, setLive] = useState(editingRow ? toNumber(editingRow.cells[8]) : 0);
  const [visits, setVisits] = useState(editingRow ? toNumber(editingRow.cells[9]) : 0);
  const [sales, setSales] = useState(editingRow ? toNumber(editingRow.cells[10]) : 0);
  const [revenue, setRevenue] = useState(editingRow ? toNumber(editingRow.cells[11]) : 0);
  const [note, setNote] = useState(editingRow ? getText(editingRow.cells[12]) : "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cells: HrExcelCellValue[] = [
      date,
      manager,
      startTime || null,
      endTime || null,
      hours,
      calls,
      answered,
      invites,
      live,
      visits,
      sales,
      revenue,
      note || null,
      0,
      0,
      0,
      0,
      0,
      0,
    ];
    onSave(cells);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="hr-employee-dialog hr-daily-form-dialog">
        <DialogHeader>
          <DialogTitle>{editingRow ? "Gündəlik qeydi redaktə et" : "Yeni gündəlik qeyd əlavə et"}</DialogTitle>
          <DialogDescription>Gündəlik iş saatı, zəng və satış fəaliyyətini daxil edin.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="crm-form crm-form-dialog hr-daily-form">
          <div className="field-grid">
            <label className="form-field">
              <span>Tarix</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>
            <label className="form-field">
              <span>Menecer</span>
              <select value={manager} onChange={(e) => setManager(e.target.value)} required>
                {managers.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="field-grid">
            <label className="form-field">
              <span>Başlama saatı</span>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </label>
            <label className="form-field">
              <span>Bitmə saatı</span>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </label>
            <label className="form-field">
              <span>İş saatı</span>
              <input type="number" step="0.1" min="0" value={hours} onChange={(e) => setHours(Number(e.target.value))} required />
            </label>
          </div>

          <div className="field-grid">
            <label className="form-field">
              <span>Zəng (total)</span>
              <input type="number" min="0" value={calls} onChange={(e) => setCalls(Number(e.target.value))} />
            </label>
            <label className="form-field">
              <span>Cavab verilən</span>
              <input type="number" min="0" value={answered} onChange={(e) => setAnswered(Number(e.target.value))} />
            </label>
            <label className="form-field">
              <span>Kons dəvəti</span>
              <input type="number" min="0" value={invites} onChange={(e) => setInvites(Number(e.target.value))} />
            </label>
          </div>

          <div className="field-grid">
            <label className="form-field">
              <span>Canlı kons/Sınaq</span>
              <input type="number" min="0" value={live} onChange={(e) => setLive(Number(e.target.value))} />
            </label>
            <label className="form-field">
              <span>Birbaşa gəliş</span>
              <input type="number" min="0" value={visits} onChange={(e) => setVisits(Number(e.target.value))} />
            </label>
            <label className="form-field">
              <span>Satış</span>
              <input type="number" min="0" value={sales} onChange={(e) => setSales(Number(e.target.value))} />
            </label>
            <label className="form-field">
              <span>Gəlir (AZN)</span>
              <input type="number" min="0" value={revenue} onChange={(e) => setRevenue(Number(e.target.value))} />
            </label>
          </div>

          <label className="form-field">
            <span>Qeyd</span>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Əlavə qeydlər..." />
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Ləğv et</Button>
            <Button type="submit"><Save data-icon="inline-start" /> Saxla</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PerformanceTab({
  monthlyTables,
  managerSummaries,
  onOpenTargets,
}: {
  monthlyTables: HrExcelTable[];
  managerSummaries: ManagerSummary[];
  onOpenTargets: () => void;
}) {
  const funnelRows = monthlyTables[1]?.rows ?? [];
  const hourlyRows = monthlyTables[2]?.rows ?? [];
  const trendRows = monthlyTables[3]?.rows ?? [];
  const topScore = managerSummaries[0]?.score ?? 0;

  return (
    <div className="hr-performance-layout">
      <HrPanel className="hr-performance-focus" as="article">
        <SectionHead
          icon={TrendingUp}
          eyebrow="Hesablanan göstəricilər"
          title="Performans analitikası"
          description="Sıralama, konversiya və saat səmərəliliyi yalnız oxunan analiz kimi göstərilir."
          meta={`${topScore}/100 ən yüksək bal`}
        />

        <div className="hr-rank-list-modern">
          {managerSummaries.map((summary, index) => (
            <PerformanceRankRow key={summary.manager} summary={summary} index={index} />
          ))}
        </div>

        <KpiFormulaPanel summaries={managerSummaries} />
      </HrPanel>

      <HrPanel className="hr-funnel-panel-modern" as="article">
        <PanelTitle
          icon={BarChart3}
          title="Satış hunisi"
          description="Zəngdən satışa qədər itki nöqtələri."
        />
        <div className="hr-funnel-board">
          {funnelRows.map((row) => (
            <FunnelPerson key={row.id} row={row} />
          ))}
        </div>
      </HrPanel>

      <HrPanel className="hr-efficiency-panel" as="article">
        <PanelTitle
          icon={Gauge}
          title="Saat səmərəliliyi"
          description="İş saatı üzrə gəlir, zəng və satış sıxlığı."
        />
        <div className="hr-efficiency-grid">
          {hourlyRows.map((row) => (
            <EfficiencyCard key={row.id} row={row} />
          ))}
        </div>
      </HrPanel>

      <HrPanel className="hr-trend-panel-modern" as="article">
        <PanelTitle
          icon={LineChart}
          title="Həftəlik trend"
          description="Satış və konversiya dinamikası."
          action={
            <Button type="button" variant="outline" size="sm" onClick={onOpenTargets}>
              <Target data-icon="inline-start" />
              Hədəflərə bax
            </Button>
          }
        />
        <div className="hr-trend-board">
          {trendRows.map((row) => (
            <TrendRow key={row.id} row={row} />
          ))}
        </div>
      </HrPanel>
    </div>
  );
}

function FeedbackTab({
  managerSummaries,
  rows,
  workspace,
  initialWorkspace,
  setWorkspace,
}: {
  managerSummaries: ManagerSummary[];
  rows: HrWeeklyFeedbackRow[];
  workspace: WorkspaceState;
  initialWorkspace: WorkspaceState;
  setWorkspace: TableRowsSetter;
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<HrWeeklyFeedbackRow | null>(null);

  const managers = useMemo(() => {
    return Array.from(new Set(workspace.dailyRows.map((r) => r.cells[1] as string).filter(Boolean)));
  }, [workspace.dailyRows]);

  const handleOpenCreate = () => {
    setEditingRow(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (row: HrWeeklyFeedbackRow) => {
    setEditingRow(row);
    setDialogOpen(true);
  };

  const handleSaveFeedback = (draft: Partial<HrWeeklyFeedbackRow>) => {
    if (draft.id && !draft.id.startsWith("temp-")) {
      setWorkspace((current) => ({
        ...current,
        weeklyRows: current.weeklyRows.map((row) =>
          row.id === draft.id ? ({ ...row, ...draft } as HrWeeklyFeedbackRow) : row
        ),
      }));
    } else {
      const newRow: HrWeeklyFeedbackRow = {
        id: `weekly-${Date.now()}`,
        cells: draft.cells || [],
        date: draft.week || "",
        week: draft.week || "",
        weekLabel: draft.week ? formatDateValue(draft.week) : "-",
        manager: draft.manager || "",
        wins: draft.wins || [],
        challenges: draft.challenges || [],
        problems: draft.problems || [],
      };
      setWorkspace((current) => ({
        ...current,
        weeklyRows: [newRow, ...current.weeklyRows],
      }));
    }
    setEditingRow(null);
  };

  const handleDeleteFeedback = (rowId: string) => {
    setWorkspace((current) => ({
      ...current,
      weeklyRows: current.weeklyRows.filter((r) => r.id !== rowId),
    }));
  };

  const handleResetFeedback = () => {
    setWorkspace((current) => ({
      ...current,
      weeklyRows: cloneWeeklyRows(initialWorkspace.weeklyRows),
    }));
  };

  return (
    <HrPanel className="hr-sheet-panel hr-workspace-panel" as="article">
      <SectionHead
        icon={Sparkles}
        eyebrow={`${rows.length} / ${workspace.weeklyRows.length} inkişaf qeydi`}
        title="İnkişaf qeydləri və fəaliyyət planı"
        description="Həftəlik güclü tərəf, çətinlik və problem qeydləri kartlarla izlənir."
        meta="İnkişaf jurnalı"
      />

      <FeedbackInsightPanel summaries={managerSummaries} rows={rows} />

      <HrToolbar className="hr-data-toolbar">
        <div><strong>Həftəlik Rəylər</strong></div>
        <div className="hr-data-actions">
          <Button type="button" variant="outline" size="sm" onClick={handleResetFeedback}>
            <RefreshCcw data-icon="inline-start" />
            Sıfırla
          </Button>
          <Button type="button" size="sm" onClick={handleOpenCreate}>
            <Plus data-icon="inline-start" />
            Rəy yaz
          </Button>
        </div>
      </HrToolbar>

      <div className="hr-feedback-command hr-feedback-grid-container">
        {rows.length > 0 ? (
          rows.map((row) => (
            <WeeklyCard
              key={row.id}
              row={row}
              onEdit={() => handleOpenEdit(row)}
              onDelete={() => handleDeleteFeedback(row.id)}
            />
          ))
        ) : (
          <HrEmptyState>Uyğun inkişaf rəyi tapılmadı</HrEmptyState>
        )}
      </div>

      <FeedbackFormDialog
        key={editingRow ? editingRow.id : (dialogOpen ? "open" : "closed")}
        isOpen={dialogOpen}
        setIsOpen={setDialogOpen}
        editingRow={editingRow}
        managers={managers}
        onSave={handleSaveFeedback}
      />
    </HrPanel>
  );
}

function FeedbackInsightPanel({
  summaries,
  rows,
}: {
  summaries: ManagerSummary[];
  rows: HrWeeklyFeedbackRow[];
}) {
  const top = summaries[0];
  const risk = [...summaries].sort((first, second) => first.score - second.score)[0];
  const issueCount = rows.reduce((sum, row) => sum + row.challenges.length + row.problems.length, 0);
  const autoInsights = [
    top ? `${top.manager} ən yüksək ümumi KPI balındadır: ${top.score}/100.` : "Ən yaxşı performans üçün məlumat yoxdur.",
    risk ? `${risk.manager} üçün fəaliyyət planı izlənməlidir: ${risk.status}.` : "Risk siqnalı yoxdur.",
    `${issueCount} çətinlik/problem qeydi əl ilə baxış gözləyir.`,
  ];
  const manualItems = ["Güclü tərəf", "Problem səbəbi", "Gələn həftə fəaliyyət planı", "Təlim ehtiyacı", "Risk qeydi"];

  return (
    <div className="hr-feedback-insights">
      <div>
        <PanelTitle
          icon={Activity}
          title="Avtomatik siqnallar"
          description="Sistem KPI və rəy qeydlərindən idarəetmə siqnalları çıxarır."
        />
        <ul>
          {autoInsights.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
      <div>
        <PanelTitle
          icon={Pencil}
          title="Menecer qərarı"
          description="Bu sahələr insan qiymətləndirməsi kimi əl ilə idarə olunur."
        />
        <div className="hr-manual-chip-list">
          {manualItems.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function TargetsTab({
  managerSummaries,
  workspace,
}: {
  managerSummaries: ManagerSummary[];
  workspace: WorkspaceState;
}) {
  const topManager = managerSummaries[0];
  const bonusEligible = managerSummaries.filter((summary) => summary.score >= 68).length;

  return (
    <HrPanel className="hr-sheet-panel hr-workspace-panel" as="article">
      <SectionHead
        icon={Target}
        eyebrow="Ay sonu bağlanış"
        title="Aylıq nəticə və bonus qərarı"
        description="Sistem KPI nəticəsini bağlayır, bonus uyğunluğunu hesablayır, final təsdiq əl ilə qalır."
        meta={`${workspace.generalRows.length} ay`}
      />

      <div className="hr-target-layout">
        <TargetInsight
          icon={CalendarDays}
          label="Cari dövr"
          value={workspace.generalRows[workspace.generalRows.length - 1]?.cells[0]?.toString() ?? "-"}
          helper="aylıq KPI bağlanışı"
        />
        <TargetInsight
          icon={PhoneCall}
          label="Zəng"
          value={formatNumber(sumColumn(workspace.generalRows, 2), 0)}
          helper="ümumi aktivlik"
        />
        <TargetInsight
          icon={CheckCircle2}
          label="Satış"
          value={formatNumber(sumColumn(workspace.generalRows, 6), 0)}
          helper="aylıq nəticə"
        />
        <TargetInsight
          icon={WalletCards}
          label="Gəlir"
          value={`${formatNumber(sumColumn(workspace.generalRows, 7), 0)} AZN`}
          helper="finance təsdiqi"
        />
      </div>

      <div className="hr-monthly-closeout">
        <MonthlyDecisionCard
          icon={Trophy}
          label="Sıralama"
          title={topManager ? `${topManager.manager} · ${topManager.score}/100` : "Sıralama formalaşmayıb"}
          description="KPI balı performans tabındakı formula ilə avtomatik hesablanır."
          tone="success"
        />
        <MonthlyDecisionCard
          icon={WalletCards}
          label="Bonus uyğunluğu"
          title={`${bonusEligible} işçi uyğun`}
          description="İlkin bonus uyğunluğu sistem hesablamasıdır; final təsdiq rəhbərlikdə qalır."
          tone="info"
        />
        <MonthlyDecisionCard
          icon={AlertTriangle}
          label="Əl ilə qərarlar"
          title="Maaş, bonus, deaktivasiya"
          description="Maaş dəyişikliyi, işdən çıxarma və final bonus təsdiqi əl ilə verilən qərardır."
          tone="warning"
        />
      </div>
    </HrPanel>
  );
}

function DecisionItem({
  icon: Icon,
  tone,
  label,
  title,
  description,
}: {
  icon: LucideIcon;
  tone: "success" | "warning" | "danger" | "info" | "neutral";
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div className={cx("hr-decision-item", `is-${tone}`)}>
      <span className="hr-decision-icon">
        <Icon size={17} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
    </div>
  );
}

function ManagerScoreRow({ summary }: { summary: ManagerSummary }) {
  return (
    <div className="hr-manager-score-row">
      <div className="hr-manager-score-head">
        <div>
          <strong>{summary.manager}</strong>
          <span>
            {formatNumber(summary.sales, 0)} satış · {formatNumber(summary.revenue, 0)} AZN
          </span>
        </div>
        <StatusChip tone={summary.tone}>{summary.status}</StatusChip>
      </div>
      <HrScoreBar value={summary.score} tone={summary.tone} label={`${summary.manager} performans balı`} />
      <div className="hr-manager-score-metrics">
        <small>{summary.score}/100 bal</small>
        <small>{formatNumber(summary.conversion * 100, 1)}% konv.</small>
        <small>{formatNumber(summary.callsPerHour, 1)} zəng/saat</small>
      </div>
    </div>
  );
}

function PerformanceRankRow({ summary, index }: { summary: ManagerSummary; index: number }) {
  return (
    <div className="hr-rank-row-modern">
      <span className="hr-rank-number">{index + 1}</span>
      <div>
        <strong>{summary.manager}</strong>
        <small>
          {formatNumber(summary.revenue, 0)} AZN · {formatNumber(summary.revenuePerHour, 1)} AZN / saat
        </small>
      </div>
      <HrScoreBar value={summary.score} tone={summary.tone} />
      <StatusChip tone={summary.tone}>{summary.score}/100</StatusChip>
    </div>
  );
}

function KpiFormulaPanel({ summaries }: { summaries: ManagerSummary[] }) {
  const selected = summaries[0];
  const items = selected
    ? [
        { label: "Gəlir hədəfi", weight: "30%", value: selected.kpiBreakdown.revenueTarget },
        { label: "Satış hədəfi", weight: "20%", value: selected.kpiBreakdown.salesTarget },
        { label: "Konversiya", weight: "15%", value: selected.kpiBreakdown.conversion },
        { label: "Saat effektivliyi", weight: "15%", value: selected.kpiBreakdown.efficiency },
        { label: "Aktivlik", weight: "10%", value: selected.kpiBreakdown.activity },
        { label: "Keyfiyyət", weight: "10%", value: selected.kpiBreakdown.quality },
      ]
    : [];

  return (
    <div className="hr-kpi-formula">
      <div>
        <strong>KPI balı necə hesablanır?</strong>
        <span>
          Başlanğıc model: 30% gəlir, 20% satış, 15% konversiya, 15% saat effektivliyi,
          10% aktivlik, 10% rəy keyfiyyəti.
        </span>
      </div>
      <div className="hr-kpi-breakdown">
        {items.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.weight}</strong>
            <small>{formatNumber(item.value, 0)}%</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function FunnelPerson({ row }: { row: HrExcelTableRow }) {
  const manager = getText(row.cells[0]);
  const calls = toNumber(row.cells[1]);
  const answered = toNumber(row.cells[2]);
  const invites = toNumber(row.cells[4]);
  const live = toNumber(row.cells[6]);
  const sales = toNumber(row.cells[8]);
  const steps: Array<{ label: string; value: number; base: number; tone: HrTone }> = [
    { label: "Cavab", value: answered, base: calls, tone: "info" },
    { label: "Dəvət", value: invites, base: answered, tone: "success" },
    { label: "Canlı", value: live, base: invites, tone: "warning" },
    { label: "Satış", value: sales, base: live || invites, tone: "danger" },
  ];
  const funnelSteps = steps.map((step) => ({
    label: step.label,
    value: Math.min(100, divide(step.value, step.base) * 100),
    tone: step.tone,
  }));

  return (
    <div className="hr-funnel-person">
      <div className="hr-funnel-person-head">
        <strong>{manager}</strong>
        <span>{formatNumber(calls, 0)} zəng</span>
      </div>
      <HrFunnelBand steps={funnelSteps} />
    </div>
  );
}

function EfficiencyCard({ row }: { row: HrExcelTableRow }) {
  const manager = getText(row.cells[0]);
  const hours = toNumber(row.cells[1]);
  const revenue = toNumber(row.cells[2]);
  const revenuePerHour = toNumber(row.cells[3]);
  const callsPerHour = toNumber(row.cells[4]);
  const salesPerHour = toNumber(row.cells[5]);

  return (
    <div className="hr-efficiency-card">
      <strong>{manager}</strong>
      <span>{formatNumber(hours, 1)} saat</span>
      <div>
        <small>Gəlir</small>
        <b>{formatNumber(revenue, 0)} AZN</b>
      </div>
      <div>
        <small>Saatda gəlir</small>
        <b>{formatNumber(revenuePerHour, 1)} AZN</b>
      </div>
      <div>
        <small>Saatda zəng</small>
        <b>{formatNumber(callsPerHour, 1)}</b>
      </div>
      <div>
        <small>Saatda satış</small>
        <b>{formatNumber(salesPerHour, 2)}</b>
      </div>
    </div>
  );
}

function TrendRow({ row }: { row: HrExcelTableRow }) {
  const manager = getText(row.cells[0]);
  const trendCells = row.cells.slice(1).map((cell) => getText(cell));
  const trendValues = trendCells.map((cell) => Number(cell.match(/^\d+/)?.[0] ?? 0));
  const trendDirection = getTrendDirection(trendCells);
  const DirectionIcon = trendDirection >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="hr-trend-modern-row">
      <div className="hr-trend-modern-head">
        <strong>{manager}</strong>
        <span className={trendDirection >= 0 ? "is-up" : "is-down"}>
          <DirectionIcon size={14} />
          {trendDirection >= 0 ? "artım" : "azalma"}
        </span>
      </div>
      <HrSparkline
        values={trendValues}
        tone={trendDirection >= 0 ? "success" : "danger"}
        label={`${manager} həftəlik trend`}
      />
      <div className="hr-trend-lines">
        {trendCells.map((cell, index) => (
          <span className="hr-trend-pill" key={`${row.id}-${index}`}>
            {cell || "-"}
          </span>
        ))}
      </div>
    </div>
  );
}

function TargetInsight({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="hr-target-insight">
      <Icon size={17} />
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </div>
  );
}

function MonthlyDecisionCard({
  icon: Icon,
  label,
  title,
  description,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  title: string;
  description: string;
  tone: "success" | "warning" | "danger" | "info" | "neutral";
}) {
  return (
    <div className={cx("hr-monthly-decision-card", `is-${tone}`)}>
      <span className="hr-monthly-decision-icon" aria-hidden="true">
        <Icon size={17} />
      </span>
      <div className="hr-monthly-decision-copy">
        <span>{label}</span>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>
    </div>
  );
}

function PanelTitle({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="hr-panel-title">
      <div>
        <span className="hr-section-icon">
          <Icon size={17} />
        </span>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      </div>
      {action}
    </div>
  );
}

function FilterBar({
  data,
  managerFilter,
  monthFilter,
  dateFrom,
  dateTo,
  rowCount,
  setManagerFilter,
  setMonthFilter,
  setDateFrom,
  setDateTo,
}: {
  data: HrPerformanceData;
  managerFilter: string;
  monthFilter: string;
  dateFrom: string;
  dateTo: string;
  rowCount: number;
  setManagerFilter: (value: string) => void;
  setMonthFilter: (value: string) => void;
  setDateFrom: (value: string) => void;
  setDateTo: (value: string) => void;
}) {
  return (
    <div className="hr-filter-strip hr-redesign-filter">
      <div className="hr-filter-main-row">
        <label>
          <span>İşçi</span>
        <select
          value={managerFilter || allFilterValue}
          onChange={(event) =>
            setManagerFilter(event.target.value === allFilterValue ? "" : event.target.value)
          }
        >
          <option value={allFilterValue}>Bütün işçilər</option>
          {data.managerOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Dövr</span>
        <select
          value={monthFilter || allFilterValue}
          onChange={(event) =>
            setMonthFilter(event.target.value === allFilterValue ? "" : event.target.value)
          }
        >
          <option value={allFilterValue}>Bütün dövr</option>
          {data.monthOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      <div className="hr-date-range-fields">
        <DatePicker
          name="hr-from"
          value={dateFrom}
          onValueChange={(nextValue) => {
            setDateFrom(nextValue);
            if (nextValue) {
              setMonthFilter("");
            }
          }}
          placeholder="Başlanğıc"
          aria-label="Başlanğıc tarixi"
          popoverPlacement="floating"
        />
        <DatePicker
          name="hr-to"
          value={dateTo}
          onValueChange={(nextValue) => {
            setDateTo(nextValue);
            if (nextValue) {
              setMonthFilter("");
            }
          }}
          placeholder="Son tarix"
          aria-label="Son tarix"
          popoverPlacement="floating"
        />
      </div>

      <div className="hr-filter-count">
        <strong>{rowCount}</strong>
        {" "}
        <span>qeyd</span>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => {
          setManagerFilter("");
          setMonthFilter("");
          setDateFrom("");
          setDateTo("");
        }}
      >
        <RefreshCcw data-icon="inline-start" />
        Filtrləri təmizlə
      </Button>
      </div>

      <div className="hr-calendar-quick-row" aria-label="Sürətli dövr seçimi">
        {data.monthOptions.map((option) => (
          <button
            type="button"
            key={option.value}
            className={cx("period-quick-btn", monthFilter === option.value && !dateFrom && !dateTo && "is-active")}
            onClick={() => {
              setMonthFilter(option.value);
              setDateFrom("");
              setDateTo("");
            }}
          >
            <Clock size={13} className="text-tone-warning" />
            <span>{option.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function SectionHead({
  icon: Icon,
  eyebrow,
  title,
  description,
  meta,
}: {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  meta?: string;
}) {
  return (
    <div className="hr-sheet-head hr-modern-section-head">
      <div className="hr-section-title">
        <span className="hr-section-icon">
          <Icon size={18} />
        </span>
        <div>
          <p className="eyeless-label">{eyebrow}</p>
          <h2>{title}</h2>
          <small>{description}</small>
        </div>
      </div>
      {meta ? <StatusChip tone="info">{meta}</StatusChip> : null}
    </div>
  );
}

function WeeklyCard({
  row,
  onEdit,
  onDelete,
}: {
  row: HrWeeklyFeedbackRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const issueCount = row.challenges.length + row.problems.length;
  const tone = issueCount > 2 ? "warning" : row.wins.length > 0 ? "success" : "neutral";

  return (
    <article className="hr-feedback-card hr-weekly-card">
      <div className="hr-feedback-card-head">
        <div>
          <strong>{row.manager || "İşçi seçilməyib"}</strong>
          <span>{row.weekLabel}</span>
        </div>
        <div className="hr-feedback-card-actions">
          <StatusChip tone={tone}>{issueCount > 0 ? `${issueCount} action` : "stabil"}</StatusChip>
          <button className="icon-button mini" type="button" title="Redaktə et" onClick={onEdit}>
            <Pencil size={13} />
          </button>
          <button className="icon-button mini hr-delete-btn" type="button" title="Sil" onClick={onDelete}>
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <FeedbackList title="Uğurlar" items={row.wins} empty="Uğur qeydi yoxdur" />
      <FeedbackList title="Çətinliklər" items={row.challenges} empty="Çətinlik qeydi yoxdur" />
      <FeedbackList title="Problemlər" items={row.problems} empty="Problem qeydi yoxdur" />
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

function FeedbackFormDialog({
  isOpen,
  setIsOpen,
  editingRow,
  managers,
  onSave,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  editingRow: HrWeeklyFeedbackRow | null;
  managers: string[];
  onSave: (row: Partial<HrWeeklyFeedbackRow>) => void;
}) {
  const [week, setWeek] = useState(editingRow ? (editingRow.week || "2026-06-15") : "2026-06-15");
  const [manager, setManager] = useState(editingRow ? (editingRow.manager || managers[0] || "") : (managers[0] || ""));
  const [wins, setWins] = useState(editingRow ? editingRow.wins.join("\n") : "");
  const [challenges, setChallenges] = useState(editingRow ? editingRow.challenges.join("\n") : "");
  const [problems, setProblems] = useState(editingRow ? editingRow.problems.join("\n") : "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const winList = wins.split("\n").map((s) => s.trim()).filter(Boolean);
    const challengeList = challenges.split("\n").map((s) => s.trim()).filter(Boolean);
    const problemList = problems.split("\n").map((s) => s.trim()).filter(Boolean);

    const cells: HrExcelCellValue[] = [
      week,
      manager,
      winList[0] || null,
      winList[1] || null,
      winList[2] || null,
      challengeList[0] || null,
      challengeList[1] || null,
      challengeList[2] || null,
      problemList[0] || null,
      problemList[1] || null,
      problemList[2] || null,
    ];

    onSave({
      id: editingRow?.id,
      week,
      manager,
      cells,
      wins: winList,
      challenges: challengeList,
      problems: problemList,
    });
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="hr-employee-dialog hr-feedback-form-dialog">
        <DialogHeader>
          <DialogTitle>{editingRow ? "İnkişaf qeydini redaktə et" : "Yeni inkişaf rəyi yaz"}</DialogTitle>
          <DialogDescription>Həftəlik inkişaf, uğur və problemləri qeyd edin (hər sətirdə bir qeyd).</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="crm-form crm-form-dialog hr-feedback-form">
          <div className="field-grid">
            <label className="form-field">
              <span>Həftə (Başlama tarixi)</span>
              <input type="date" value={week} onChange={(e) => setWeek(e.target.value)} required />
            </label>
            <label className="form-field">
              <span>Menecer</span>
              <select value={manager} onChange={(e) => setManager(e.target.value)} required>
                {managers.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="form-field">
            <span>Uğurlar (Hər sətirdə 1 dənə, max 3)</span>
            <textarea rows={3} value={wins} onChange={(e) => setWins(e.target.value)} placeholder="Məs: Dialoq qurmaq bacarığı" />
          </label>
          <label className="form-field">
            <span>Çətinliklər (Hər sətirdə 1 dənə, max 3)</span>
            <textarea rows={3} value={challenges} onChange={(e) => setChallenges(e.target.value)} placeholder="Məs: Uzun müddət gözləyənlər var" />
          </label>
          <label className="form-field">
            <span>Problemlər (Hər sətirdə 1 dənə, max 3)</span>
            <textarea rows={3} value={problems} onChange={(e) => setProblems(e.target.value)} placeholder="Məs: Tələsmək zəng keyfiyyətini salır" />
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)}>Ləğv et</Button>
            <Button type="submit"><Save data-icon="inline-start" /> Saxla</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function createWorkspaceState(data: HrPerformanceData): WorkspaceState {
  return {
    dashboardSections: data.dashboard.sections.map(cloneTable),
    monthlyTables: [
      cloneTable(data.monthlyAnalysis.ranking),
      cloneTable(data.monthlyAnalysis.funnel),
      cloneTable(data.monthlyAnalysis.hourly),
      cloneTable(data.monthlyAnalysis.weeklyTrend),
    ],
    dailyRows: cloneRows(data.daily.rows),
    weeklyRows: cloneWeeklyRows(data.weekly.rows),
    generalRows: cloneRows(data.generalIndicators.rows),
  };
}

function buildOverviewMetrics(rows: HrExcelTableRow[]): HrPerformanceMetric[] {
  const totals = rows.reduce(
    (sum, row) => ({
      hours: sum.hours + toNumber(row.cells[2]),
      calls: sum.calls + toNumber(row.cells[3]),
      answered: sum.answered + toNumber(row.cells[4]),
      sales: sum.sales + toNumber(row.cells[7]),
      revenue: sum.revenue + toNumber(row.cells[8]),
    }),
    { hours: 0, calls: 0, answered: 0, sales: 0, revenue: 0 }
  );

  return [
    {
      label: "Gəlir",
      value: `${formatNumber(totals.revenue, 0)} AZN`,
      helper: `${formatNumber(divide(totals.revenue, totals.hours), 1)} AZN / saat`,
      tone: "blue",
    },
    {
      label: "Satış",
      value: formatNumber(totals.sales, 0),
      helper: `${formatNumber(divide(totals.sales, totals.calls) * 100, 1)}% konversiya`,
      tone: "mint",
    },
    {
      label: "Zəng",
      value: formatNumber(totals.calls, 0),
      helper: `${formatNumber(divide(totals.answered, totals.calls) * 100, 1)}% cavab`,
      tone: "yellow",
    },
    {
      label: "İş saatı",
      value: `${formatNumber(totals.hours, 1)} saat`,
      helper: `${formatNumber(divide(totals.calls, totals.hours), 1)} zəng / saat`,
      tone: "coral",
    },
  ];
}

function buildManagerSummaries(rows: HrExcelTableRow[], weeklyRows: HrWeeklyFeedbackRow[]): ManagerSummary[] {
  const raw = rows.map((row) => {
    const hours = toNumber(row.cells[2]);
    const calls = toNumber(row.cells[3]);
    const answered = toNumber(row.cells[4]);
    const invites = toNumber(row.cells[5]);
    const liveConsults = toNumber(row.cells[6]);
    const sales = toNumber(row.cells[7]);
    const revenue = toNumber(row.cells[8]);
    const manager = getText(row.cells[0]) || "Adsız işçi";
    const qualityScore = buildQualityScore(manager, weeklyRows);

    return {
      manager,
      days: toNumber(row.cells[1]),
      hours,
      calls,
      answered,
      invites,
      liveConsults,
      sales,
      revenue,
      conversion: divide(sales, invites || answered || calls),
      answerRate: divide(answered, calls),
      revenuePerHour: divide(revenue, hours),
      callsPerHour: divide(calls, hours),
      qualityScore,
    };
  });

  return raw
    .map((row) => {
      const kpiBreakdown = {
        revenueTarget: ratioScore(row.revenue, monthlyKpiTargets.revenue),
        salesTarget: ratioScore(row.sales, monthlyKpiTargets.sales),
        conversion: ratioScore(row.conversion, monthlyKpiTargets.conversion),
        efficiency: ratioScore(row.revenuePerHour, monthlyKpiTargets.revenuePerHour),
        activity: ratioScore(row.callsPerHour, monthlyKpiTargets.callsPerHour),
        quality: ratioScore(row.qualityScore, monthlyKpiTargets.quality),
      };
      const score = Math.min(
        100,
        Math.round(
          kpiBreakdown.revenueTarget * 0.3 +
            kpiBreakdown.salesTarget * 0.2 +
            kpiBreakdown.conversion * 0.15 +
            kpiBreakdown.efficiency * 0.15 +
            kpiBreakdown.activity * 0.1 +
            kpiBreakdown.quality * 0.1
        )
      );
      const tone: ManagerSummary["tone"] =
        score >= 85 ? "success" : score >= 68 ? "info" : score >= 50 ? "warning" : "danger";
      const status =
        score >= 85 ? "Əla" : score >= 68 ? "Stabil" : score >= 50 ? "Diqqət lazımdır" : "Riskdə";

      return { ...row, kpiBreakdown, score, tone, status };
    })
    .sort((first, second) => second.score - first.score);
}

function buildQualityScore(manager: string, weeklyRows: HrWeeklyFeedbackRow[]) {
  const reviews = weeklyRows.filter((row) => row.manager === manager);

  if (reviews.length === 0) {
    return 72;
  }

  const wins = reviews.reduce((sum, row) => sum + row.wins.length, 0);
  const issues = reviews.reduce((sum, row) => sum + row.challenges.length + row.problems.length, 0);

  return clamp(72 + wins * 5 - issues * 4, 35, 100);
}

function ratioScore(value: number, target: number) {
  return clamp(divide(value, target) * 100, 0, 120);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function cloneTable(table: HrExcelTable | undefined): HrExcelTable {
  return {
    title: table?.title ?? "Bölmə",
    headers: [...(table?.headers ?? [])],
    rows: cloneRows(table?.rows ?? []),
  };
}

function cloneRows<T extends HrExcelTableRow>(rows: T[]): HrExcelTableRow[] {
  return rows.map((row) => ({
    ...row,
    cells: [...row.cells],
  }));
}

function cloneWeeklyRows(rows: HrWeeklyFeedbackRow[]): HrWeeklyFeedbackRow[] {
  return toWeeklyRows(rows);
}

function toWeeklyRows(rows: HrExcelTableRow[]): HrWeeklyFeedbackRow[] {
  return rows.map((row, index) => {
    const week = typeof row.cells[0] === "string" ? row.cells[0] : "";
    const manager = typeof row.cells[1] === "string" ? row.cells[1] : "";
    const wins = extractTextCells(row.cells.slice(2, 5));
    const challenges = extractTextCells(row.cells.slice(5, 8));
    const problems = extractTextCells(row.cells.slice(8, 11));

    return {
      ...row,
      id: row.id || `weekly-${week || "new"}-${index}`,
      date: week,
      week,
      weekLabel: week ? formatDateValue(week) : "-",
      manager,
      month: week ? getMonthKey(week) : undefined,
      wins,
      challenges,
      problems,
    };
  });
}

function buildRowFromCells(cells: HrExcelCellValue[], headers: string[], id = createRowId()) {
  const manager = getManagerFromCells(headers, cells);
  const date = getDateFromCells(headers, cells);

  return {
    id,
    cells,
    manager,
    date,
    month: date ? getMonthKey(date) : undefined,
  };
}

function filterRows<T extends HrExcelTableRow>(
  rows: T[],
  manager: string,
  month: string,
  dateFrom = "",
  dateTo = ""
) {
  return rows.filter(
    (row) =>
      (!manager || row.manager === manager) &&
      (!month || row.month === month) &&
      isWithinDateRange(row.date, dateFrom, dateTo)
  );
}

function isWithinDateRange(value: string | undefined, from: string, to: string) {
  if (!from && !to) {
    return true;
  }

  if (!value) {
    return false;
  }

  return (!from || value >= from) && (!to || value <= to);
}

function calculateDailyCells(cells: HrExcelCellValue[], headers: string[]) {
  const nextCells = [...cells];
  const get = (header: string) => toNumber(nextCells[headers.indexOf(header)]);
  const set = (header: string, value: number) => {
    const index = headers.indexOf(header);

    if (index >= 0) {
      nextCells[index] = value;
    }
  };
  const hours = get("İş Saatı");
  const answered = get("Cavab Verilən");
  const invites = get("Kons Dəvəti");
  const sales = get("Satış");
  const revenue = get("Gəlir (AZN)");
  const calls = get("Zəng (total)");

  set("Dəvət %", divide(invites, answered));
  set("Konv %", divide(sales, invites || answered));
  set("Orta Çek", divide(revenue, sales));
  set("Saatda Satış", divide(sales, hours));
  set("Saatda Zəng", divide(calls, hours));
  set("Saatda Gəlir", divide(revenue, hours));

  return nextCells;
}

function formatCell(value: HrExcelCellValue, header: string) {
  if (value === null || value === "") {
    return "-";
  }

  if (typeof value === "string") {
    if (header === "Tarix" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return formatDateValue(value);
    }

    return value;
  }

  if (header.includes("%")) {
    return `${formatNumber(value * 100, 1)}%`;
  }

  if (header.includes("Gəlir") || header.includes("Orta Çek")) {
    return `${formatNumber(value, 2)} AZN`;
  }

  if (header.includes("Saat") || header.startsWith("Saatda")) {
    return formatNumber(value, 1);
  }

  return Number.isInteger(value) ? formatNumber(value, 0) : formatNumber(value, 1);
}

// Helper: Get Manager
function getManagerFromCells(headers: string[], cells: HrExcelCellValue[]) {
  const index = headers.findIndex((header) => header === "Menecer");
  const value = cells[index];

  return typeof value === "string" ? value : undefined;
}

// Helper: Get Date
function getDateFromCells(headers: string[], cells: HrExcelCellValue[]) {
  const index = headers.findIndex((header) => header === "Tarix" || header === "Ay" || header.startsWith("Həftə"));
  const value = cells[index];

  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

function extractTextCells(cells: HrExcelCellValue[]) {
  return cells.filter((cell): cell is string => typeof cell === "string" && cell.trim().length > 0);
}

function toNumber(value: HrExcelCellValue) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getText(value: HrExcelCellValue) {
  return typeof value === "string" ? value : "";
}

function sumColumn(rows: HrExcelTableRow[], columnIndex: number) {
  return rows.reduce((sum, row) => sum + toNumber(row.cells[columnIndex]), 0);
}

function divide(numerator: number, denominator: number) {
  return denominator > 0 ? numerator / denominator : 0;
}

function formatDateValue(value: string) {
  const [year, month, day] = value.split("-");

  return `${day}.${month}.${year}`;
}

function formatNumber(value: number, maximumFractionDigits: number) {
  const fixed = value.toFixed(maximumFractionDigits);
  const [integerPart, fractionPart = ""] = fixed.split(".");
  const normalizedFraction = fractionPart.replace(/0+$/, "");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return normalizedFraction ? `${groupedInteger},${normalizedFraction}` : groupedInteger;
}

function getMonthKey(value: string) {
  return value.slice(0, 7);
}

function getTrendDirection(cells: string[]) {
  const values = cells
    .map((cell) => Number(cell.match(/\(([-\d.]+)%\)/)?.[1] ?? NaN))
    .filter((value) => Number.isFinite(value));

  if (values.length < 2) {
    return 0;
  }

  return values[values.length - 1] - values[0];
}

function createRowId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `hr-row-${Date.now().toString(36)}`;
}

function getInitials(value: string) {
  return value
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
