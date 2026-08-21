"use client";

import { useEffect, useTransition, type CSSProperties } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  Banknote,
  BarChart3,
  BellRing,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  GraduationCap,
  List,
  Snowflake,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createStudentAction, recordStudentPaymentAction } from "@/modules/students/actions";
import { StudentCreateDialogClient } from "@/modules/students/student-create-dialog-client";
import { StudentFilterForm } from "@/modules/students/student-filter-form";
import { StudentOverviewCharts } from "@/modules/students/student-overview-charts";
import { ProgramManager } from "@/modules/students/program-manager";
import { deleteProgramAction, saveProgramAction } from "@/modules/students/program-actions";
import { StudentPaymentDialogClient } from "@/modules/students/student-payment-dialog-client";
import { ExportDialog } from "@/modules/exports/export-dialog";
import type { StudentListData } from "@/modules/students/queries";
import { completeStudentReminderAction } from "@/modules/students/reminder-actions";
import { CompleteStudentReminderButton } from "@/modules/students/student-reminders-client";
import { buildStudentPaginationItems } from "@/modules/students/student-pagination";

type StudentRow = StudentListData["students"][number];
type DashboardTab = "overview" | "list" | "programs";

export function StudentList({ data }: { data: StudentListData }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const activeTab: DashboardTab = searchParams.get("tab") === "list" ? "list" : searchParams.get("tab") === "programs" ? "programs" : "overview";

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    }, data.operations.refreshSeconds * 1000);

    return () => window.clearInterval(timer);
  }, [data.operations.refreshSeconds, router]);

  function navigate(nextUrl: string) {
    startTransition(() => router.push(nextUrl as Route));
  }

  function handleTabChange(tab: DashboardTab) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", tab);
    params.delete("page");
    navigate(`/students?${params.toString()}`);
  }

  function handleQuickFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    if (key === "status" && value) {
      params.delete("churn");
      params.delete("payment");
    }
    if (key === "payment" && value) {
      params.delete("status");
      params.delete("churn");
    }
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    params.set("tab", "list");
    navigate(`/students?${params.toString()}`);
  }

  function handleDebtQuickFilter() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    params.delete("status");
    params.delete("churn");
    params.set("payment", "open");
    params.set("tab", "list");
    navigate(`/students?${params.toString()}`);
  }

  function handleChurnQuickFilter() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    params.delete("status");
    params.delete("payment");
    params.set("churn", "1");
    params.set("tab", "list");
    navigate(`/students?${params.toString()}`);
  }

  function handleClearFilters() {
    navigate(`/students?tab=${activeTab}`);
  }

  function handleClearDateRange() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("page");
    params.delete("from");
    params.delete("to");
    navigate(`/students?${params.toString()}`);
  }

  function handlePageChange(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "list");
    if (page > 1) params.set("page", page.toString());
    else params.delete("page");
    navigate(`/students?${params.toString()}`);
  }

  const visibleStudents = activeTab === "overview" ? data.students.slice(0, 5) : data.students;

  return (
    <section className="students-command-page" aria-labelledby="students-page-title">
      <div className="route-progress" aria-hidden={!isPending} data-visible={isPending} />

      <section className="students-command-shell">
        <header className="students-page-header">
          <div>
            <h1 id="students-page-title">Tələbələr və Balans</h1>
          </div>
          <div className="students-page-actions">
            {data.permissions.canExport ? (
              <ExportDialog
                module="students"
                resultCount={data.total}
                filters={{ q: data.query, status: data.filters.status, program: data.filters.program, teacher: data.filters.teacher, payment: data.filters.payment, from: data.filters.dateFrom, to: data.filters.dateTo }}
                previewRows={data.students.map((student) => ({ code: student.code, name: student.name, phone: student.phone, program: student.program, teacher: student.teacher, lifecycle: student.lifecycleStatus, paymentStatus: student.paymentStatus, balance: student.balance, dueDate: student.dueDate, manager: student.detail.manager, registeredAt: student.detail.registeredAt, billing: student.detail.billingPaused, notes: student.detail.notes, invoices: "", payments: "", timeline: "" }))}
              />
            ) : null}
            <StudentPaymentDialogClient
              students={data.students}
              canRecordPayment={data.permissions.canRecordPayment}
              returnTo={data.returnTo}
              recordPaymentAction={recordStudentPaymentAction}
            />
            <StudentCreateDialogClient
              createOptions={data.createOptions}
              canCreateStudent={data.permissions.canCreateStudent}
              canConvertLead={data.permissions.canConvertLead}
              canRecordPayment={data.permissions.canRecordPayment}
              returnTo={data.returnTo}
              createStudentAction={createStudentAction}
            />
          </div>
        </header>

        <StudentFilterForm
          key={[
            data.query,
            data.filters.status,
            data.filters.program,
            data.filters.teacher,
            data.filters.payment,
            data.filters.dateFrom,
            data.filters.dateTo,
          ].join(":")}
          filterOptions={data.filterOptions}
          filters={data.filters}
          query={data.query}
        />
      </section>

      {activeTab === "overview" ? (
        <StudentAuditControl
          data={data}
          onDebt={handleDebtQuickFilter}
          onOverdue={() => handleQuickFilter("payment", "overdue")}
          onSlotWaiting={() => handleQuickFilter("status", "SLOT_WAITING")}
        />
      ) : null}

      <section className="students-kpi-grid" aria-label="Tələbə statistika kartları">
        <button type="button" className="students-kpi students-kpi-blue students-enter" style={sequenceStyle(0)} onClick={() => handleQuickFilter("status", "ACTIVE")}>
          <div className="students-kpi-head">
            <span>Aktiv tələbələr</span>
            <span className="students-kpi-icon" aria-hidden="true">
              <GraduationCap />
            </span>
          </div>
          <strong>{data.operations.activeCount}</strong>
          <div className="students-kpi-foot">
            <span>Təhsil davam edir</span>
            <ArrowRight aria-hidden="true" />
          </div>
        </button>
        <button type="button" className="students-kpi students-kpi-coral students-enter" style={sequenceStyle(1)} onClick={handleDebtQuickFilter}>
          <div className="students-kpi-head"><span>Qalıq borcu olanlar</span><span className="students-kpi-icon" aria-hidden="true"><CreditCard /></span></div>
          <strong>{data.operations.actionableCount}</strong>
          <div className="students-kpi-foot"><span>{data.operations.actionableAmount}</span><ArrowRight aria-hidden="true" /></div>
        </button>
        <button type="button" className="students-kpi students-kpi-yellow students-enter" style={sequenceStyle(2)} onClick={() => handleQuickFilter("status", "SLOT_WAITING")}>
          <div className="students-kpi-head"><span>Slot gözləyənlər</span><span className="students-kpi-icon" aria-hidden="true"><Activity /></span></div>
          <strong>{data.operations.slotWaitingCount}</strong>
          <div className="students-kpi-foot"><span>Təyinat nəzarəti</span><ArrowRight aria-hidden="true" /></div>
        </button>
        <button type="button" className="students-kpi students-kpi-mint students-enter" style={sequenceStyle(3)} onClick={handleChurnQuickFilter}>
          <div className="students-kpi-head"><span>Dondurulub / dayandırılıb</span><span className="students-kpi-icon" aria-hidden="true"><Snowflake /></span></div>
          <strong>{data.operations.frozenOrStoppedCount}</strong>
          <div className="students-kpi-foot"><span>Qayıdış və arxiv nəzarəti</span><ArrowRight aria-hidden="true" /></div>
        </button>
      </section>

      <div className="students-view-toolbar">
        <div className="students-tabs" role="tablist" aria-label="Tələbə görünüşü">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "overview"}
            data-active={activeTab === "overview"}
            onClick={() => handleTabChange("overview")}
          >
            <BarChart3 />
            <span>Balans İcmalı</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "list"}
            data-active={activeTab === "list"}
            onClick={() => handleTabChange("list")}
          >
            <List />
            <span>Tələbə Siyahısı</span>
            <small>{data.total}</small>
          </button>
          <button type="button" role="tab" aria-selected={activeTab === "programs"} data-active={activeTab === "programs"} onClick={() => handleTabChange("programs")}>
            <CreditCard /><span>Proqramlar</span><small>{data.createOptions.programs.length}</small>
          </button>
        </div>
        {data.filters.activeCount > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={handleClearFilters}>
            <X data-icon="inline-start" />
            Filtrləri sıfırla ({data.filters.activeCount})
          </Button>
        ) : null}
      </div>

      {activeTab === "programs" ? (
        <ProgramManager programs={data.createOptions.programs} canManage={data.permissions.canManagePrograms} saveAction={saveProgramAction} deleteAction={deleteProgramAction} />
      ) : activeTab === "overview" ? (
        <StudentOverviewCharts
          collectionRate={data.operations.collectionRate}
          debtCount={data.operations.actionableCount}
          futureCount={data.operations.futureCount}
          collectedAmount={data.operations.collectedAmount}
          expectedAmount={data.operations.expectedAmount}
          programs={data.operations.programs}
          teachers={data.operations.teachers}
        />
      ) : data.filters.activeCount > 0 ? (
        <ActiveFilterBar
          data={data}
          onQuickFilter={handleQuickFilter}
          onClearDateRange={handleClearDateRange}
          onClearAll={handleClearFilters}
        />
      ) : null}

      <StudentDataTable
        students={visibleStudents}
        total={data.total}
        metrics={data.listMetrics}
        isPreview={activeTab === "overview"}
        pagination={data.pagination}
        isPending={isPending}
        onShowAll={() => handleTabChange("list")}
        onPageChange={handlePageChange}
        onClearFilters={handleClearFilters}
      />
    </section>
  );
}

function StudentAuditControl({
  data,
  onDebt,
  onOverdue,
  onSlotWaiting,
}: {
  data: StudentListData;
  onDebt: () => void;
  onOverdue: () => void;
  onSlotWaiting: () => void;
}) {
  const operations = data.operations;

  return (
    <section className="students-audit-control students-enter" aria-labelledby="students-audit-control-title">
      <header className="students-audit-control-head">
        <div className="students-audit-control-title">
          <span className="students-today-reminders-icon" aria-hidden="true">
            <BellRing />
          </span>
          <div>
            <span>Cari ay nəzarəti</span>
            <h2 id="students-audit-control-title">Audit və xatırlatma mərkəzi</h2>
            <p>{operations.periodLabel} üzrə tələbə əməliyyatları</p>
          </div>
        </div>
        <span className="students-live-badge">
          <i aria-hidden="true" /> Canlı · {operations.refreshSeconds} san.
        </span>
      </header>

      <div className="students-audit-metrics" aria-label="Avtomatik nəzarət bildirişləri">
        <button type="button" data-tone="amber" onClick={onSlotWaiting}>
          <span><Activity /> Slot gözləyir</span>
          <strong>{operations.slotWaitingCount}</strong>
          <small>Təyinat tələb olunur</small>
        </button>
        <button type="button" data-tone="coral" onClick={onDebt}>
          <span><CreditCard /> Qalıq borc</span>
          <strong>{operations.actionableCount}</strong>
          <small>{operations.actionableAmount}</small>
        </button>
        <button type="button" data-tone="danger" onClick={onOverdue}>
          <span><AlertCircle /> Gecikmiş</span>
          <strong>{operations.overdueCount}</strong>
          <small>{operations.overdueAmount}</small>
        </button>
        <Link data-tone="blue" href="/finance?type=debts">
          <span><CalendarClock /> Planlı ödəniş</span>
          <strong>{operations.futureCount}</strong>
          <small>{operations.futureAmount} · Maliyyə</small>
        </Link>
        <div data-tone="mint">
          <span><BellRing /> Bugünkü xatırlatma</span>
          <strong>{data.todayReminders.items.length}</strong>
          <small>{data.todayReminders.dateLabel}</small>
        </div>
      </div>

      <div className="students-audit-notices">
        <div>
          <strong>{operations.unscheduledCount}</strong>
          <span>tələbədə ödəniş tarixi yoxdur</span>
        </div>
        <div>
          <strong>{operations.dueTodayCount}</strong>
          <span>ödəniş bu gün alınmalıdır</span>
        </div>
        <div>
          <strong>{operations.activeWithoutTeacherCount}</strong>
          <span>aktiv tələbədə müəllim təyin edilməyib</span>
        </div>
        <div>
          <strong>{operations.collectedAmount}</strong>
          <span>{operations.expectedAmount} planın {operations.collectionRate}%-i toplanıb</span>
        </div>
      </div>

      <div className="students-today-reminders-row" aria-label="Bugünkü fərdi xatırlatmalar">
        {data.todayReminders.items.length > 0 ? data.todayReminders.items.map((reminder) => (
          <article className="students-today-reminder-card" data-kind={reminder.kind.toLowerCase()} key={reminder.id}>
            <span className="students-today-reminder-kind" aria-hidden="true">
              {reminder.kind === "PAYMENT" ? <Banknote /> : <BellRing />}
            </span>
            <div className="students-today-reminder-copy">
              <span>{reminder.kindLabel}</span>
              <Link href={`/students/${reminder.studentId}` as Route}>
                {reminder.studentName}
                <small>{reminder.studentCode}</small>
              </Link>
              <p>{reminder.note}</p>
            </div>
            {reminder.canComplete ? (
              <CompleteStudentReminderButton reminderId={reminder.id} studentId={reminder.studentId} action={completeStudentReminderAction} compact />
            ) : null}
          </article>
        )) : (
          <div className="students-audit-reminder-empty">
            <span className="students-today-reminders-icon" aria-hidden="true">
              <BellRing />
            </span>
            <div>
              <strong>Bu gün üçün fərdi xatırlatma yoxdur</strong>
              <p>Avtomatik audit göstəriciləri yuxarıda işləməyə davam edir.</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function StudentDataTable({
  students,
  total,
  metrics,
  isPreview,
  pagination,
  isPending,
  onShowAll,
  onPageChange,
  onClearFilters,
}: {
  students: StudentRow[];
  total: number;
  metrics: StudentListData["listMetrics"];
  isPreview: boolean;
  pagination: StudentListData["pagination"];
  isPending: boolean;
  onShowAll: () => void;
  onPageChange: (page: number) => void;
  onClearFilters: () => void;
}) {
  return (
    <article className="students-table-panel students-enter" style={sequenceStyle(9)}>
      <header className="students-table-heading">
        {isPreview ? (
          <div>
            <h2>Tələbə siyahısı</h2>
            <p>{`Son qeydlər · ümumilikdə ${total} tələbə`}</p>
          </div>
        ) : (
          <div className="students-list-metrics" aria-label="Filtrlənmiş tələbə ödəniş statistikası">
            <div className="students-list-metric is-clv">
              <span>CLV</span>
              <strong>{metrics.totalPaid}</strong>
            </div>
            <div className="students-list-metric is-expected">
              <span>Qalıq məbləğ</span>
              <strong>{metrics.expectedPayment}</strong>
            </div>
            <div className="students-list-metric is-overdue">
              <span>Gecikən ödəniş</span>
              <strong>{metrics.overduePayment}</strong>
            </div>
          </div>
        )}
        {isPreview ? (
          <Button type="button" variant="outline" size="sm" onClick={onShowAll}>
            Tam siyahı
            <ArrowRight data-icon="inline-end" />
          </Button>
        ) : null}
      </header>

      {students.length > 0 ? (
        <Table className="students-data-table">
          <TableHeader>
            <TableRow>
              <TableHead>Tələbə</TableHead>
              <TableHead>Proqram və müəllim</TableHead>
              <TableHead>Lifecycle statusu</TableHead>
              <TableHead>Ödəniş vəziyyəti</TableHead>
              <TableHead>Növbəti ödəniş</TableHead>
              <TableHead>CLV</TableHead>
              <TableHead aria-label="Əməliyyat" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {students.map((student) => {
              const hasDebt = student.paymentTone === "danger" || student.paymentTone === "warning";
              return (
                <TableRow key={student.code} data-debt={hasDebt}>
                  <TableCell>
                    <Link href={`/students/${student.id}` as Route} className="students-identity-link">
                      <span className="students-avatar" aria-hidden="true">{getInitials(student.name)}</span>
                      <span>
                        <strong>{student.name}</strong>
                        <small>{student.code} · {student.phone}</small>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>
                    <div className="students-table-stack">
                      <strong>{student.program}</strong>
                      <small>{student.teacher}</small>
                    </div>
                  </TableCell>
                  <TableCell>
                    <StatusChip tone={student.lifecycleTone}>{student.lifecycleStatus}</StatusChip>
                  </TableCell>
                  <TableCell>
                    <div className="students-payment-cell">
                      <StatusChip tone={student.paymentTone}>{student.paymentStatus}</StatusChip>
                      <small data-debt={hasDebt}>
                        {student.paymentTone === "success"
                          ? `Ödənən: ${student.paidThisMonth}`
                          : student.balance}
                      </small>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="students-date-cell">
                      <CalendarClock aria-hidden="true" />
                      <span>
                        <strong>{student.dueDate}</strong>
                        <small>{student.overdueDays > 0 ? `${student.overdueDays} gün gecikib` : student.lastContact}</small>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="students-table-stack">
                      <strong>{student.clv.totalPaid}</strong>
                      <small>{student.clv.paidMonths} ödəniş ayı</small>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/students/${student.id}` as Route}
                      className="students-row-action"
                      aria-label={`${student.name} profilini aç`}
                    >
                      <ArrowRight />
                    </Link>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : (
        <div className="students-empty-state">
          <span aria-hidden="true"><AlertCircle /></span>
          <h3>Tələbə tapılmadı</h3>
          <p>Seçilmiş filtrlərə uyğun tələbə qeydi yoxdur.</p>
          <Button type="button" variant="outline" size="sm" onClick={onClearFilters}>
            Filtrləri təmizlə
          </Button>
        </div>
      )}
      {!isPreview && students.length > 0 && pagination.totalPages > 1 ? (
        <StudentPagination
          pagination={pagination}
          total={total}
          isPending={isPending}
          onPageChange={onPageChange}
        />
      ) : null}
    </article>
  );
}

function StudentPagination({
  pagination,
  total,
  isPending,
  onPageChange,
}: {
  pagination: StudentListData["pagination"];
  total: number;
  isPending: boolean;
  onPageChange: (page: number) => void;
}) {
  const items = buildStudentPaginationItems(pagination.page, pagination.totalPages);

  return (
    <nav className="students-pagination" aria-label="Tələbə siyahısı səhifələri">
      <span className="students-pagination-summary">
        {pagination.from}–{pagination.to} / {total} tələbə
      </span>
      <div className="students-pagination-controls">
        <button
          type="button"
          className="students-pagination-button is-direction"
          disabled={isPending || pagination.page === 1}
          onClick={() => onPageChange(pagination.page - 1)}
          aria-label="Əvvəlki səhifə"
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        {items.map((item) =>
          typeof item === "number" ? (
            <button
              type="button"
              className="students-pagination-button"
              data-active={item === pagination.page}
              disabled={isPending || item === pagination.page}
              onClick={() => onPageChange(item)}
              aria-current={item === pagination.page ? "page" : undefined}
              aria-label={`${item}-ci səhifə`}
              key={item}
            >
              {item}
            </button>
          ) : (
            <span className="students-pagination-ellipsis" aria-hidden="true" key={item}>…</span>
          ),
        )}
        <button
          type="button"
          className="students-pagination-button is-direction"
          disabled={isPending || pagination.page === pagination.totalPages}
          onClick={() => onPageChange(pagination.page + 1)}
          aria-label="Növbəti səhifə"
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}

function ActiveFilterBar({
  data,
  onQuickFilter,
  onClearDateRange,
  onClearAll,
}: {
  data: StudentListData;
  onQuickFilter: (key: string, value: string) => void;
  onClearDateRange: () => void;
  onClearAll: () => void;
}) {
  return (
    <div className="students-active-filters" aria-label="Aktiv filtrlər">
      <span>{data.total} nəticə</span>
      {data.filters.status ? (
        <FilterChip label={`Status: ${data.filterLabels.status}`} onRemove={() => onQuickFilter("status", "")} />
      ) : null}
      {data.filters.churn ? (
        <FilterChip label="Churn: bütün əlaqəli tələbələr" onRemove={() => onQuickFilter("churn", "")} />
      ) : null}
      {data.filters.payment !== "all" ? (
        <FilterChip label={`Ödəniş: ${data.filterLabels.payment}`} onRemove={() => onQuickFilter("payment", "all")} />
      ) : null}
      {data.filters.program ? (
        <FilterChip label={`Proqram: ${data.filterLabels.program}`} onRemove={() => onQuickFilter("program", "")} />
      ) : null}
      {data.filters.teacher ? (
        <FilterChip label={`Müəllim: ${data.filterLabels.teacher}`} onRemove={() => onQuickFilter("teacher", "")} />
      ) : null}
      {data.filters.dateFrom || data.filters.dateTo ? (
        <FilterChip
          label={`Qeydiyyat: ${data.filters.dateFrom || "*"} – ${data.filters.dateTo || "*"}`}
          onRemove={onClearDateRange}
        />
      ) : null}
      <button type="button" onClick={onClearAll}>Hamısını təmizlə</button>
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="students-filter-chip">
      {label}
      <button type="button" onClick={onRemove} aria-label={`${label} filtrini sil`}><X /></button>
    </span>
  );
}

function getInitials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function sequenceStyle(index: number) {
  return { "--students-sequence": index } as CSSProperties;
}
