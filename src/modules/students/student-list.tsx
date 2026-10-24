"use client";

import { useContext, useEffect, useRef, useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { HeaderActionsContext } from "@/components/layout/header-actions-context";
import Link from "next/link";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { StudentRiskPanel } from "@/modules/students/student-risk-panel";
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Banknote,
  BarChart3,
  BellRing,
  BookOpen,
  CalendarCheck2,
  CalendarClock,
  CheckCircle2,
  CirclePause,
  CircleX,
  CreditCard,
  GraduationCap,
  List,
  Search,
  Snowflake,
  UserRoundCheck,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/ui/select";
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
import { deleteProgramAction, saveProgramAction, setProgramArchivedAction } from "@/modules/students/program-actions";
import { StudentPaymentDialogClient } from "@/modules/students/student-payment-dialog-client";
import { ExportDialog } from "@/modules/exports/export-dialog";
import type { StudentListData } from "@/modules/students/queries";
import { completeStudentReminderAction } from "@/modules/students/reminder-actions";
import { CompleteStudentReminderButton } from "@/modules/students/student-reminders-client";
import { TablePagination } from "@/components/ui/table-pagination";
import { EMPTY_SELECT_VALUE } from "@/modules/shared/form-values";

type StudentRow = StudentListData["students"][number];
type DashboardTab = "overview" | "list" | "programs";

const metricIcons: readonly LucideIcon[] = [
  GraduationCap,
  CreditCard,
  Activity,
  Snowflake,
  CirclePause,
  CircleX,
  UserRoundCheck,
  Banknote,
];

export function StudentList({ data }: { data: StudentListData }) {
  const headerActionsTarget = useContext(HeaderActionsContext);
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
      params.delete("attention");
      params.delete("ids");
      params.delete("from");
      params.delete("to");
    }
    if (key === "payment" && value) {
      params.delete("status");
      params.delete("churn");
      params.delete("attention");
      params.delete("ids");
      if (["open", "overdue", "archive"].includes(value)) {
        params.delete("from");
        params.delete("to");
      }
    }
    if (key === "attention" && value) {
      params.delete("status");
      params.delete("churn");
      params.delete("payment");
      params.delete("ids");
      params.delete("from");
      params.delete("to");
      params.delete("q");
    }
    if (key === "ids" && value) {
      params.delete("status");
      params.delete("churn");
      params.delete("payment");
      params.delete("attention");
      params.delete("from");
      params.delete("to");
      params.delete("program");
      params.delete("teacher");
      params.delete("q");
      params.set("dates", "all");
    }
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
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
    // Default ay filtrinin yenidən tətbiq olunmaması üçün
    params.set("dates", "all");
    params.set("tab", "list");
    navigate(`/students?${params.toString()}`);
  }

  function handlePageChange(page: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "list");
    if (page > 1) params.set("page", page.toString());
    else params.delete("page");
    navigate(`/students?${params.toString()}`);
  }

  function handlePageSizeChange(pageSize: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", "list");
    params.delete("page");
    if (pageSize === 15) params.delete("pageSize");
    else params.set("pageSize", pageSize.toString());
    navigate(`/students?${params.toString()}`);
  }

  const visibleStudents = activeTab === "overview" ? data.students.slice(0, 5) : data.students;

  return (
    <section className="students-command-page" aria-labelledby="students-page-title">
      <div className="route-progress" aria-hidden={!isPending} data-visible={isPending} />

      <h1 id="students-page-title" className="sr-only">Tələbələr və Balans</h1>
      {headerActionsTarget ? createPortal(
          <div className="students-toolbar-actions">
            <StudentFilterForm filterOptions={data.filterOptions} filters={data.filters} />
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
          </div>,
          headerActionsTarget,
        ) : null}

      <section className="students-kpi-grid" aria-label="Tələbə statistika kartları">
        {data.statusSummary.map((item, index) => {
          const Icon = metricIcons[index] ?? UserRoundCheck;
          return (
            <button
              type="button"
              className={`students-kpi students-kpi-${item.tone} students-enter`}
              style={sequenceStyle(index)}
              onClick={() => handleQuickFilter(item.filter.key, item.filter.value)}
              key={item.label}
              aria-label={`${item.label} siyahısını aç`}
            >
              <div className="students-kpi-head">
                <span>{item.label}</span>
                <span className="students-kpi-icon" aria-hidden="true">
                  <Icon />
                </span>
              </div>
              <strong>{item.value}</strong>
              <div className="students-kpi-foot">
                <span>{item.delta}</span>
                <ArrowRight aria-hidden="true" />
              </div>
            </button>
          );
        })}
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
        <ProgramManager programs={data.managedPrograms} archiveAction={setProgramArchivedAction} canManage={data.permissions.canManagePrograms} saveAction={saveProgramAction} deleteAction={deleteProgramAction} />
      ) : activeTab === "overview" ? (
        <>
          <StudentOverviewCharts
            canReadAttendance={data.permissions.canReadAttendance}
            programs={data.operations.programs}
            teachers={data.operations.teachers}
          />
          <StudentAttentionAudit
            data={data}
            onOverdue={() => handleQuickFilter("payment", "overdue")}
            // onFirstLessonMissed={() => handleQuickFilter("attention", "first_lesson")}
            onUnassigned={() => handleQuickFilter("teacher", "unassigned")}
          />
        </>
      ) : data.filters.activeCount > 0 ? (
        <ActiveFilterBar
          data={data}
          onQuickFilter={handleQuickFilter}
          onClearDateRange={handleClearDateRange}
          onClearAll={handleClearFilters}
        />
      ) : null}

      {activeTab === "programs" ? null : (
        <StudentDataTable
          students={visibleStudents}
          total={data.total}
          metrics={data.listMetrics}
          isPreview={activeTab === "overview"}
          pagination={data.pagination}
          isPending={isPending}
          toolbar={activeTab === "list" ? (
            <StudentListToolbar
              query={data.query}
              status={data.filters.status}
              program={data.filters.program}
              teacher={data.filters.teacher}
              statuses={data.filterOptions.statuses}
              programs={data.filterOptions.programs}
              teachers={data.filterOptions.teachers}
              onFilter={handleQuickFilter}
            />
          ) : null}
          onShowAll={() => handleTabChange("list")}
          onPageChange={handlePageChange}
          onPageSizeChange={handlePageSizeChange}
          onClearFilters={handleClearFilters}
        />
      )}
    </section>
  );
}

function StudentAttentionAudit({
  data,
  onOverdue,
  // onFirstLessonMissed,
  onUnassigned,
}: {
  data: StudentListData;
  onOverdue: () => void;
  // onFirstLessonMissed: () => void;
  onUnassigned: () => void;
}) {
  const operations = data.operations;
  const reminders = data.todayReminders.items;
  const dueTodayStudents = operations.dueTodayStudents ?? [];
  const overdueStudents = operations.overdueStudents ?? [];
  // const firstLessonMissedStudents = operations.firstLessonMissedStudents ?? [];
  const todayAttentionCount = operations.dueTodayCount + reminders.length;
  const attentionTotal = todayAttentionCount + operations.overdueCount
    + data.riskPanel.dangerCount + data.riskPanel.warningCount;

  return (
    <section className="students-attention-audit students-enter" aria-labelledby="students-attention-title">
      <header className="students-attention-heading">
        <span className="students-attention-heading-icon" aria-hidden="true">
          <BellRing />
        </span>
        <div>
          <h2 id="students-attention-title">Ümumi xatırlatmalar və qayıblar</h2>
          <p>{data.todayReminders.dateLabel} üçün tələbə əməliyyatları</p>
        </div>
        {/* <span className="students-attention-meta">
          <i aria-hidden="true" /> Canlı · {attentionTotal} qeyd
        </span> */}
      </header>

      <div className="students-attention-split">
        <section className="students-first-lesson-alert students-manual-notices" aria-labelledby="students-notices-title">
          <header className="students-first-lesson-alert-head">
            <span aria-hidden="true"><BellRing /></span>
            <div>
              <h3 id="students-notices-title">Manual bildirişlər</h3>
              <p>Tələbə profilində “Bildiriş yarat” ilə əlavə edilənlər · bu günün xatırlatmaları</p>
            </div>
            <strong>{reminders.length}</strong>
          </header>
          <div className="students-first-lesson-alert-list">
            {reminders.map((reminder) => (
              <StudentReminderAttentionRow reminder={reminder} key={`reminder-${reminder.id}`} />
            ))}
            {reminders.length === 0 ? (
              <StudentAttentionEmpty>Aktiv manual bildiriş yoxdur</StudentAttentionEmpty>
            ) : null}
          </div>
        </section>
        <StudentRiskPanel riskPanel={data.riskPanel} />
      </div>

      <div className="students-attention-groups">
        <StudentAttentionGroup
          title="Bu gün"
          description="Ödəniş günü və bugünkü xatırlatmalar"
          tone="today"
          count={todayAttentionCount}
        >
          {dueTodayStudents.map((student) => (
            <StudentPaymentAttentionRow student={student} tone="today" key={`payment-${student.id}`} />
          ))}
          {reminders.map((reminder) => (
            <StudentReminderAttentionRow reminder={reminder} key={`reminder-${reminder.id}`} />
          ))}
          {todayAttentionCount === 0 ? (
            <StudentAttentionEmpty>Bu gün üçün ödəniş və xatırlatma yoxdur</StudentAttentionEmpty>
          ) : null}
          {operations.dueTodayCount > dueTodayStudents.length ? (
            <p className="students-attention-list-note">
              Daha {operations.dueTodayCount - dueTodayStudents.length} ödəniş qeydi siyahıda göstərilmir.
            </p>
          ) : null}
        </StudentAttentionGroup>

        <StudentAttentionGroup
          title="Gecikənlər"
          description="Ödəniş tarixi keçmiş tələbələr"
          tone="overdue"
          count={operations.overdueCount}
        >
          {overdueStudents.map((student) => (
            <StudentPaymentAttentionRow student={student} tone="overdue" key={student.id} />
          ))}
          {operations.overdueCount === 0 ? (
            <StudentAttentionEmpty>Gecikən tələbə ödənişi yoxdur</StudentAttentionEmpty>
          ) : null}
          {operations.overdueCount > overdueStudents.length ? (
            <p className="students-attention-list-note">
              Daha {operations.overdueCount - overdueStudents.length} gecikən qeyd siyahıda göstərilmir.
            </p>
          ) : null}
          {operations.overdueCount > 0 ? (
            <button type="button" className="students-attention-more" onClick={onOverdue}>
              Bütün gecikənləri aç <ArrowRight aria-hidden="true" />
            </button>
          ) : null}
        </StudentAttentionGroup>
      </div>

      <footer className="students-attention-footer">
        <span><CalendarClock aria-hidden="true" /> {operations.unscheduledCount} tələbədə növbəti ödəniş tarixi yoxdur.</span>
        <button type="button" onClick={onUnassigned}>
          <GraduationCap aria-hidden="true" /> {operations.activeWithoutTeacherCount} tələbədə müəllim təyin edilməyib.
        </button>
      </footer>
    </section>
  );
}

function StudentAttentionGroup({
  title,
  description,
  tone,
  count,
  children,
}: {
  title: string;
  description: string;
  tone: "today" | "overdue";
  count: number;
  children: ReactNode;
}) {
  const Icon = tone === "today" ? CalendarCheck2 : AlertTriangle;

  return (
    <section className={`students-attention-group is-${tone}`}>
      <header className="students-attention-group-heading">
        <span aria-hidden="true"><Icon /></span>
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <strong>{count}</strong>
      </header>
      <div className="students-attention-list">{children}</div>
    </section>
  );
}

function StudentPaymentAttentionRow({
  student,
  tone,
}: {
  student: StudentListData["operations"]["dueTodayStudents"][number];
  tone: "today" | "overdue";
}) {
  return (
    <Link
      href={`/students/${student.id}` as Route}
      className="students-attention-row"
      data-kind="payment"
      aria-label={`${student.name}: ${student.balance} ödəniş, ${student.dueDate}`}
    >
      <span className="students-attention-avatar" aria-hidden="true">{getInitials(student.name)}</span>
      <span className="students-attention-person">
        <strong>{student.name}</strong>
        <small>{student.code} · {student.program}</small>
      </span>
      <StatusChip tone={tone === "overdue" ? "danger" : "warning"}>{student.balance}</StatusChip>
      <span className="students-attention-action">
        <strong><Banknote aria-hidden="true" /> Ödəniş alınmalıdır</strong>
        <small><CalendarClock aria-hidden="true" /> {tone === "overdue" ? `${student.overdueDays} gün gecikir · ` : ""}{student.dueDate}</small>
      </span>
      <ArrowRight className="students-attention-open" aria-hidden="true" />
    </Link>
  );
}

function StudentReminderAttentionRow({
  reminder,
}: {
  reminder: StudentListData["todayReminders"]["items"][number];
}) {
  return (
    <article className="students-attention-row is-reminder" data-kind={reminder.kind.toLowerCase()}>
      <span className="students-attention-avatar is-reminder" aria-hidden="true"><BellRing /></span>
      <span className="students-attention-person">
        <Link href={`/students/${reminder.studentId}` as Route}>{reminder.studentName}</Link>
        <small>{reminder.studentCode} · {reminder.ownerName}</small>
      </span>
      <StatusChip tone="info">{reminder.kindLabel}</StatusChip>
      <span className="students-attention-action">
        <strong>{reminder.note}</strong>
        <small><CalendarClock aria-hidden="true" /> Xatırlatma günü: {reminder.dueDate}</small>
      </span>
      {reminder.canComplete ? (
        <CompleteStudentReminderButton
          reminderId={reminder.id}
          studentId={reminder.studentId}
          action={completeStudentReminderAction}
          compact
        />
      ) : null}
    </article>
  );
}

function StudentAttentionEmpty({ children }: { children: ReactNode }) {
  return (
    <div className="students-attention-empty">
      <CheckCircle2 aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function StudentListToolbar({
  query,
  status,
  program,
  teacher,
  statuses,
  programs,
  teachers,
  onFilter,
}: {
  query: string;
  status: string;
  program: string;
  teacher: string;
  statuses: StudentListData["filterOptions"]["statuses"];
  programs: StudentListData["filterOptions"]["programs"];
  teachers: StudentListData["filterOptions"]["teachers"];
  onFilter: (key: string, value: string) => void;
}) {
  const [searchValue, setSearchValue] = useState(query);
  const onFilterRef = useRef(onFilter);
  const searchValueRef = useRef(searchValue);
  const submittedQueryRef = useRef(query);
  onFilterRef.current = onFilter;
  searchValueRef.current = searchValue;

  useEffect(() => {
    const typed = searchValueRef.current.trim();
    if (typed !== submittedQueryRef.current && typed !== query) return;
    submittedQueryRef.current = query;
    setSearchValue(query);
  }, [query]);

  useEffect(() => {
    const next = searchValue.trim();
    if (next === query) return;
    const timer = window.setTimeout(() => {
      submittedQueryRef.current = next;
      onFilterRef.current("q", next);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, searchValue]);

  function applySelect(key: "status" | "program" | "teacher", value: string) {
    const next = value === EMPTY_SELECT_VALUE ? "" : value;
    const current = key === "status" ? status : key === "program" ? program : teacher;
    if (next === current) return;
    onFilter(key, next);
  }

  return (
    <div className="students-list-toolbar" role="search">
      <label className="students-list-search">
        <Search aria-hidden="true" />
        <span className="sr-only">Tələbə axtar</span>
        <input
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          placeholder="Ad, kod və ya telefon üzrə axtar"
        />
        {searchValue ? (
          <button
            type="button"
            className="students-list-search-clear"
            aria-label="Axtarışı təmizlə"
            onClick={() => {
              setSearchValue("");
              submittedQueryRef.current = "";
              onFilterRef.current("q", "");
            }}
          >
            <X aria-hidden="true" />
          </button>
        ) : null}
      </label>
      <FormSelect
        name="listStatus"
        aria-label="Status"
        value={status}
        onValueChange={(value) => applySelect("status", value)}
        emptyLabel="Bütün statuslar"
        options={statuses}
        icon={Activity}
      />
      <FormSelect
        name="listProgram"
        aria-label="Proqram"
        value={program}
        onValueChange={(value) => applySelect("program", value)}
        emptyLabel="Bütün proqramlar"
        options={programs}
        icon={BookOpen}
        searchable
        searchPlaceholder="Proqram axtar..."
      />
      <FormSelect
        name="listTeacher"
        aria-label="Müəllim"
        value={teacher}
        onValueChange={(value) => applySelect("teacher", value)}
        emptyLabel="Bütün müəllimlər"
        options={teachers}
        icon={Users}
        searchable
        searchPlaceholder="Müəllim axtar..."
      />
    </div>
  );
}

function StudentDataTable({
  students,
  total,
  metrics,
  isPreview,
  pagination,
  isPending,
  toolbar,
  onShowAll,
  onPageChange,
  onPageSizeChange,
  onClearFilters,
}: {
  students: StudentRow[];
  total: number;
  metrics: StudentListData["listMetrics"];
  isPreview: boolean;
  pagination: StudentListData["pagination"];
  isPending: boolean;
  toolbar?: ReactNode;
  onShowAll: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
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
              <span>Cari borc</span>
              <strong>{metrics.expectedPayment}</strong>
            </div>
            <div className="students-list-metric is-future">
              <span>Gələcək ödəniş</span>
              <strong>{metrics.futurePayment}</strong>
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
      {toolbar}

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
              const hasActivationAlert = Boolean(student.activationWarning);
              const riskLevel = student.riskLevel;
              return (
                <TableRow
                  key={student.code}
                  data-debt={hasDebt}
                  data-activation-alert={hasActivationAlert || undefined}
                  data-risk={riskLevel ?? undefined}
                >
                  <TableCell>
                    <Link href={`/students/${student.id}` as Route} className="students-identity-link">
                      <span className="students-avatar" data-alert={hasActivationAlert || undefined} aria-hidden="true">
                        {hasActivationAlert ? <AlertTriangle /> : getInitials(student.name)}
                      </span>
                      <span>
                        <strong>{student.name}</strong>
                        <small>{student.code} · {student.phone}</small>
                        {hasActivationAlert ? (
                          <small className="students-activation-warning" title={student.activationWarning ?? undefined}>
                            İlk dərsə gəlməyib
                          </small>
                        ) : null}
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
                    <div className="students-status-cell">
                      <StatusChip tone={student.lifecycleTone}>{student.lifecycleStatus}</StatusChip>
                      {riskLevel ? (
                        <span title={`Ardıcıl ${student.riskStreak} dərs qayıb`}>
                          <StatusChip tone={riskLevel}>Riskli</StatusChip>
                        </span>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="students-payment-cell">
                      <StatusChip tone={student.paymentTone}>{student.paymentStatus}</StatusChip>
                      <small data-debt={hasDebt}>
                        {student.paymentStatusCode === "ADVANCE_PAID"
                          ? student.advancePaid
                          : student.paymentStatusCode === "ADVANCE_REFUNDED"
                            ? student.advanceRefunded
                            : student.paymentTone === "success"
                            ? `Ödənən: ${student.paidThisMonth}`
                            : student.hasDueDebt
                              ? `Borc: ${student.dueDebt}`
                              : `Gələcək: ${student.futureReceivable}`}
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
      {!isPreview && students.length > 0 ? (
        <TablePagination
          page={pagination.page}
          pageSize={pagination.pageSize}
          total={total}
          disabled={isPending}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
          label="Tələbə siyahısı səhifələri"
        />
      ) : null}
    </article>
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
      {data.query ? (
        <FilterChip label={`Axtarış: ${data.query}`} onRemove={() => onQuickFilter("q", "")} />
      ) : null}
      {data.filters.status ? (
        <FilterChip label={`Status: ${data.filterLabels.status}`} onRemove={() => onQuickFilter("status", "")} />
      ) : null}
      {data.filters.churn ? (
        <FilterChip label="Churn: bütün əlaqəli tələbələr" onRemove={() => onQuickFilter("churn", "")} />
      ) : null}
      {data.filters.payment !== "all" ? (
        <FilterChip label={`Ödəniş: ${data.filterLabels.payment}`} onRemove={() => onQuickFilter("payment", "all")} />
      ) : null}
      {data.filters.sale ? (
        <FilterChip label={`Satış: ${data.filterLabels.sale}`} onRemove={() => onQuickFilter("sale", "")} />
      ) : null}
      {data.filters.attention ? (
        <FilterChip label={data.filterLabels.attention} onRemove={() => onQuickFilter("attention", "")} />
      ) : null}
      {data.filterLabels.ids ? (
        <FilterChip label={data.filterLabels.ids} onRemove={() => onQuickFilter("ids", "")} />
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
