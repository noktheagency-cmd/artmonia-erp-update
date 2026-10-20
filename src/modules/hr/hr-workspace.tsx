"use client";

import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { useMemo, useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Cell, Pie, PieChart, Tooltip } from "recharts";
import {
  BriefcaseBusiness,
  Archive,
  Download,
  GraduationCap,
  LoaderCircle,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer } from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { HrEmployeeData, HrEmployeeRow } from "@/modules/hr/employee-data";
import type { TeacherDirectoryData } from "@/modules/hr/teacher-directory-data";
import type { HrBonusData } from "@/modules/hr/bonus-data";
import { BonusWorkspace } from "@/modules/hr/bonus-workspace";
import type { CorporateCustomerData, CorporateCustomerRow } from "@/modules/hr/corporate-customer-data";
import type { CompanyKpiData } from "@/modules/hr/company-kpi-data";
import { CompanyKpiWorkspace } from "@/modules/hr/company-kpi-workspace";
import {
  CorporateContactAccountsDialog,
  CorporateCustomerDeleteDialog,
  CorporateCustomerDialog,
  CorporateCustomerWorkspace,
} from "@/modules/hr/corporate-customers";
import { exportHrExcel } from "@/modules/hr/hr-excel-export";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";
import { unwrapActionResult } from "@/lib/action-result";
import "./hr.css";
import "./hr-payroll.css";
import "./staff.css";

type View = "overview" | "employees" | "archive" | "teachers" | "corporate" | "bonus" | "company-kpi";
type Action = (formData: FormData) => Promise<unknown>;
const statusMeta = {
  ACTIVE: { label: "Aktiv", color: "#22a06b", className: "active" },
  PROBATION: { label: "Sınaq müddəti", color: "#f0a33a", className: "warning" },
  ON_LEAVE: { label: "Məzuniyyətdə", color: "#6f7bd9", className: "leave" },
  INACTIVE: { label: "Deaktiv", color: "#a2a9b7", className: "muted" },
} as const;

export function HrWorkspace({
  teacherData,
  employeeData,
  bonusData,
  corporateData,
  companyKpiData,
  initialView,
  actions,
}: {
  teacherData: TeacherDirectoryData;
  employeeData: HrEmployeeData;
  bonusData: HrBonusData;
  corporateData: CorporateCustomerData;
  companyKpiData: CompanyKpiData;
  initialView?: "company-kpi";
  actions: {
    create: Action;
    update: Action;
    remove: Action;
    updateTeacherSalary: Action;
    updateTeacher: Action;
    deleteTeacher: Action;
    createBonus: Action;
    adjustBonus: Action;
    approveBonus: Action;
    postBonus: Action;
    cancelBonus: Action;
    deleteBonus: Action;
    refreshBonuses: Action;
    createCorporate: Action;
    updateCorporate: Action;
    deleteCorporate: Action;
    createCorporateAccount: Action;
    saveCompanyKpi: Action;
    saveCompanyKpiPlan: Action;
  };
}) {
  const router = useRouter();
  const [view, setView] = useState<View>(() =>
    initialView === "company-kpi" && companyKpiData.permissions.canRead
      ? "company-kpi"
      : employeeData.permissions.canRead
      ? "overview"
      : teacherData.permissions.canReadTeachers
        ? "teachers"
        : corporateData.permissions.canRead
          ? "corporate"
          : "bonus",
  );
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");
  const [editor, setEditor] = useState<HrEmployeeRow | "new" | null>(null);
  const [newStaffType, setNewStaffType] = useState<"EMPLOYEE" | "TEACHER">("EMPLOYEE");
  const [deleting, setDeleting] = useState<HrEmployeeRow | null>(null);
  const [salaryTeacher, setSalaryTeacher] = useState<
    TeacherDirectoryData["teachers"][number] | null
  >(null);
  const [teacherEditor, setTeacherEditor] = useState<
    TeacherDirectoryData["teachers"][number] | "new" | null
  >(null);
  const [deletingTeacher, setDeletingTeacher] = useState<
    TeacherDirectoryData["teachers"][number] | null
  >(null);
  const [corporateEditor, setCorporateEditor] = useState<CorporateCustomerRow | "new" | null>(null);
  const [deletingCorporate, setDeletingCorporate] = useState<CorporateCustomerRow | null>(null);
  const [corporateAccountCustomer, setCorporateAccountCustomer] = useState<CorporateCustomerRow | null>(null);
  const [notice, setNotice] = useState("");
  const [exporting, setExporting] = useState(false);
  const [pending, startTransition] = useTransition();
  const departments = useMemo(
    () =>
      [
        ...new Set(employeeData.employees.map((item) => item.department)),
      ].sort(),
    [employeeData.employees],
  );
  const employees = useMemo(
    () =>
      employeeData.employees.filter((item) => {
        const needle = query.trim().toLocaleLowerCase("az");
        return (
          (!needle ||
            `${item.fullName} ${item.position} ${item.department} ${item.email} ${item.phone} ${item.address}`
              .toLocaleLowerCase("az")
              .includes(needle)) &&
          (department === "all" || item.department === department) &&
          (status === "all" || item.status === status)
        );
      }),
    [department, employeeData.employees, query, status],
  );
  const archivedEmployees = useMemo(
    () =>
      employeeData.archivedEmployees.filter((item) => {
        const needle = query.trim().toLocaleLowerCase("az");
        return (
          (!needle ||
            `${item.fullName} ${item.position} ${item.department} ${item.email} ${item.phone} ${item.exitReason}`
              .toLocaleLowerCase("az")
              .includes(needle)) &&
          (department === "all" || item.department === department)
        );
      }),
    [department, employeeData.archivedEmployees, query],
  );
  const teachers = useMemo(
    () =>
      teacherData.teachers.filter(
        (item) =>
          !query.trim() ||
          `${item.fullName} ${item.phone ?? ""}`
            .toLocaleLowerCase("az")
            .includes(query.trim().toLocaleLowerCase("az")),
      ),
    [query, teacherData.teachers],
  );

  function run(action: () => Promise<unknown>, message: string) {
    startTransition(
      () =>
        void action()
          .then((result) => {
            unwrapActionResult(result);
            setNotice(message);
            setEditor(null);
            setDeleting(null);
            setSalaryTeacher(null);
            setTeacherEditor(null);
            setDeletingTeacher(null);
            setCorporateEditor(null);
            setDeletingCorporate(null);
            setCorporateAccountCustomer(null);
            router.refresh();
          })
          .catch((error) =>
            setNotice(notifyCaughtError(error, "Əməliyyat tamamlanmadı")),
          ),
    );
  }
  function clearFilters() {
    setQuery("");
    setDepartment("all");
    setStatus("all");
  }
  async function exportRows() {
    if (view === "bonus" || view === "company-kpi" || exporting) return;
    setExporting(true);
    setNotice("");
    try {
      await exportHrExcel({
        view,
        employees: view === "archive" ? archivedEmployees : employees,
        teachers,
        corporateData,
      });
      notifySuccess("Excel ixracı hazırdır", "Peşəkar formatlı Excel faylı uğurla yaradıldı.");
    } catch (error) {
      setNotice(notifyCaughtError(error, "Excel ixracı hazırlanmadı.", "İxrac alınmadı"));
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="hr-command" aria-busy={pending}>
      <Tabs value={view} onValueChange={(value) => setView(value as View)}>
        <header className="hr-command-header">
          <div>
            <h1>İnsan resursları</h1>
          </div>
          <div className="hr-command-actions">
            {view !== "bonus" && view !== "company-kpi" && (view === "corporate" ? corporateData.permissions.canExport : view === "teachers" ? teacherData.permissions.canExport : employeeData.permissions.canExport) ? (
              <Button variant="outline" disabled={exporting} onClick={() => void exportRows()}>
                {exporting ? <LoaderCircle className="export-spin" data-icon="inline-start" /> : <Download data-icon="inline-start" />}
                {exporting ? "Hazırlanır..." : "Excel ixrac et"}
              </Button>
            ) : null}
            {view !== "bonus" && view !== "company-kpi" ? <Button
              variant="outline"
              size="icon"
              aria-label="Məlumatları yenilə"
              onClick={() => router.refresh()}
            >
              <RefreshCw />
            </Button> : null}
            {view === "corporate" && corporateData.permissions.canManage ? (
              <Button onClick={() => setCorporateEditor("new")}>
                <Plus data-icon="inline-start" /> Şirkət əlavə et
              </Button>
            ) : view !== "bonus" && view !== "company-kpi" && view !== "corporate" && view !== "archive" && employeeData.permissions.canManage ? (
              <Button onClick={() => {
                setNewStaffType(view === "teachers" ? "TEACHER" : "EMPLOYEE");
                setEditor("new");
              }}>
                <Plus data-icon="inline-start" /> {view === "teachers" ? "Müəllim əlavə et" : "Əməkdaş yarat"}
              </Button>
            ) : null}
          </div>
        </header>
        <TabsList variant="line" className="hr-command-tabs">
          {employeeData.permissions.canRead ? <TabsTrigger value="overview">İcmal</TabsTrigger> : null}
          {employeeData.permissions.canRead ? <TabsTrigger value="employees">Əməkdaşlar</TabsTrigger> : null}
          {employeeData.permissions.canRead ? <TabsTrigger value="archive">Komanda arxivi</TabsTrigger> : null}
          {teacherData.permissions.canReadTeachers ? <TabsTrigger value="teachers">Müəllim göstəriciləri</TabsTrigger> : null}
          {corporateData.permissions.canRead ? <TabsTrigger value="corporate">Korporativ müştərilər</TabsTrigger> : null}
          {companyKpiData.permissions.canRead ? <TabsTrigger value="company-kpi">Şirkət KPI</TabsTrigger> : null}
          {bonusData.permissions.canManage || bonusData.actorEmployeeId || bonusData.permissions.canSeeAll ? <TabsTrigger value="bonus">Bonus</TabsTrigger> : null}
        </TabsList>
        {view !== "bonus" && view !== "company-kpi" && view !== "corporate" ? <div className="hr-filter-band">
          <label className="hr-search">
            <Search />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={
                view === "teachers"
                  ? "Müəllim axtar..."
                  : "Ad, vəzifə və ya e-poçt axtar..."
              }
            />
          </label>
          {view !== "teachers" ? (
            <>
              <FormSelect
                name="hrDepartment"
                aria-label="Departament"
                value={department}
                onValueChange={setDepartment}
                emptyLabel="Bütün departamentlər"
                emptyValue="all"
                options={departments.map((item) => ({ value: item, label: item }))}
                className="hr-filter-select"
              />
              {view !== "archive" ? (
                <FormSelect
                  name="hrStatus"
                  aria-label="Status"
                  value={status}
                  onValueChange={setStatus}
                  emptyLabel="Bütün statuslar"
                  emptyValue="all"
                  options={Object.entries(statusMeta).map(([value, meta]) => ({
                    value,
                    label: meta.label,
                  }))}
                  className="hr-filter-select"
                />
              ) : null}
            </>
          ) : null}
          <Button variant="ghost" onClick={clearFilters}>
            <SlidersHorizontal data-icon="inline-start" /> Təmizlə
          </Button>
          <span className="hr-result-count">
            {view === "teachers" ? teachers.length : view === "archive" ? archivedEmployees.length : employees.length} nəticə
          </span>
        </div> : null}
        {notice ? (
          <div className="hr-notice" role="status">
            {notice}
            <button onClick={() => setNotice("")} aria-label="Bildirişi bağla">
              ×
            </button>
          </div>
        ) : null}
        <TabsContent value="overview">
          <HrOverview
            employees={employeeData.employees}
            teachers={teacherData.teachers}
            onEmployees={() => setView("employees")}
          />
        </TabsContent>
        <TabsContent value="employees">
          <EmployeeTable
            employees={employees}
            canManage={employeeData.permissions.canManage}
            onEdit={setEditor}
            onDelete={setDeleting}
          />
        </TabsContent>
        <TabsContent value="archive">
          <ArchiveTable
            employees={archivedEmployees}
            allTimeEmployeeCount={employeeData.allTimeEmployeeCount}
          />
        </TabsContent>
        <TabsContent value="teachers">
          <TeacherTable
            teachers={teachers}
            canManage={teacherData.permissions.canManageTeacherRules}
            onEdit={setTeacherEditor}
            onEditSalary={setSalaryTeacher}
            onDelete={setDeletingTeacher}
          />
        </TabsContent>
        <TabsContent value="corporate">
          <CorporateCustomerWorkspace
            data={corporateData}
            onCreate={() => setCorporateEditor("new")}
            onEdit={setCorporateEditor}
            onDelete={setDeletingCorporate}
            onManageAccounts={setCorporateAccountCustomer}
          />
        </TabsContent>
        <TabsContent value="bonus">
          <BonusWorkspace
            data={bonusData}
            actions={{
              create: actions.createBonus,
              adjust: actions.adjustBonus,
              approve: actions.approveBonus,
              post: actions.postBonus,
              cancel: actions.cancelBonus,
              remove: actions.deleteBonus,
              refresh: actions.refreshBonuses,
            }}
          />
        </TabsContent>
        <TabsContent value="company-kpi">
          <CompanyKpiWorkspace
            key={companyKpiData.periodMonth}
            data={companyKpiData}
            saveAction={actions.saveCompanyKpi}
            savePlanAction={actions.saveCompanyKpiPlan}
          />
        </TabsContent>
      </Tabs>
      {corporateEditor ? (
        <CorporateCustomerDialog
          customer={corporateEditor === "new" ? undefined : corporateEditor}
          pending={pending}
          onClose={() => setCorporateEditor(null)}
          onSubmit={(formData) =>
            run(
              () => corporateEditor === "new"
                ? actions.createCorporate(formData)
                : actions.updateCorporate(formData),
              corporateEditor === "new"
                ? "Şirkət yaradıldı."
                : "Şirkət məlumatları yeniləndi.",
            )
          }
        />
      ) : null}
      {deletingCorporate ? (
        <CorporateCustomerDeleteDialog
          customer={deletingCorporate}
          pending={pending}
          onClose={() => setDeletingCorporate(null)}
          onConfirm={() => {
            const form = new FormData();
            form.set("id", deletingCorporate.id);
            run(() => actions.deleteCorporate(form), "Şirkət silindi.");
          }}
        />
      ) : null}
      {corporateAccountCustomer ? (
        <CorporateContactAccountsDialog
          customer={corporateAccountCustomer}
          roleOptions={corporateData.accountRoleOptions}
          pending={pending}
          onClose={() => setCorporateAccountCustomer(null)}
          onSubmit={(formData) => run(() => actions.createCorporateAccount(formData), "Korporativ əlaqəli şəxs üçün giriş hesabı yaradıldı.")}
        />
      ) : null}
      {editor ? (
        <EmployeeDialog
          employee={editor === "new" ? undefined : editor}
          today={employeeData.today}
          lookups={employeeData.lookups}
          initialStaffType={newStaffType}
          pending={pending}
          onClose={() => setEditor(null)}
          onSubmit={(formData) =>
            run(
              () =>
                editor === "new"
                  ? actions.create(formData)
                  : actions.update(formData),
              editor === "new"
                ? "Əməkdaş yaradıldı."
                : "Əməkdaş məlumatları yeniləndi.",
            )
          }
        />
      ) : null}
      {salaryTeacher ? (
        <TeacherSalaryDialog
          teacher={salaryTeacher}
          pending={pending}
          onClose={() => setSalaryTeacher(null)}
          onSubmit={(formData) =>
            run(
              () => actions.updateTeacherSalary(formData),
              "Müəllim maaş faizi və cari bordro yeniləndi.",
            )
          }
        />
      ) : null}
      {teacherEditor && teacherEditor !== "new" ? (
        <TeacherProfileDialog
          teacher={teacherEditor}
          pending={pending}
          onClose={() => setTeacherEditor(null)}
          onSubmit={(formData) =>
            run(
              () => actions.updateTeacher(formData),
              "Müəllim profili yeniləndi.",
            )
          }
        />
      ) : null}
      {deleting ? (
        <Dialog open onOpenChange={(open) => !open && setDeleting(null)}>
          <DialogContent className="hr-confirm-dialog">
            <DialogHeader>
              <DialogTitle>İşçini arxivə göndərmək?</DialogTitle>
              <DialogDescription>
                {deleting.fullName} cari komandadan çıxarılacaq, giriş hüquqları bağlanacaq,
                lakin iş və maliyyə tarixçəsi komanda arxivində qorunacaq.
              </DialogDescription>
            </DialogHeader>
            <form
              className="hr-archive-form"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                form.set("id", deleting.id);
                run(() => actions.remove(form), "İşçi komanda arxivinə göndərildi.");
              }}
            >
              <label>
                <span>İşdən çıxma tarixi</span>
                <Input name="employmentEndedAt" type="date" defaultValue={employeeData.today} required />
              </label>
              <label>
                <span>Səbəb</span>
                <textarea name="exitReason" rows={3} minLength={3} maxLength={500} required placeholder="Məsələn: əmək müqaviləsinə xitam verildi" />
              </label>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setDeleting(null)}>
                  Ləğv et
                </Button>
                <Button type="submit" variant="destructive" disabled={pending}>
                  Arxivə göndər
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      {deletingTeacher ? (
        <Dialog open onOpenChange={(open) => !open && setDeletingTeacher(null)}>
          <DialogContent className="hr-confirm-dialog">
            <DialogHeader>
              <DialogTitle>Müəllim profilini silmək?</DialogTitle>
              <DialogDescription>
                {deletingTeacher.fullName} artıq müəllim kimi görünməyəcək.
                Əməkdaş və istifadəçi hesabı qorunacaq. Aktiv tələbə/slot təyinatı
                və ya maliyyə-davamiyyət tarixçəsi varsa silinmə bloklanacaq.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeletingTeacher(null)}
              >
                Ləğv et
              </Button>
              <Button
                variant="destructive"
                disabled={pending}
                onClick={() => {
                  const form = new FormData();
                  form.set("id", deletingTeacher.id);
                  run(
                    () => actions.deleteTeacher(form),
                    "Müəllim profili silindi; digər rollar qorundu.",
                  );
                }}
              >
                Müəllimlikdən sil
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </section>
  );
}

function HrOverview({
  employees,
  teachers,
  onEmployees,
}: {
  employees: HrEmployeeRow[];
  teachers: TeacherDirectoryData["teachers"];
  onEmployees: () => void;
}) {
  const active = employees.filter((item) => item.status === "ACTIVE").length;
  const probation = employees.filter(
    (item) => item.status === "PROBATION",
  ).length;
  const statusData = Object.entries(statusMeta)
    .map(([key, meta]) => ({
      name: meta.label,
      value: employees.filter((item) => item.status === key).length,
      fill: meta.color,
    }))
    .filter((item) => item.value);
  const departments = [...new Set(employees.map((item) => item.department))]
    .map((name) => ({
      name,
      value: employees.filter((item) => item.department === name).length,
    }))
    .sort((a, b) => b.value - a.value);
  const capacity = teachers.reduce(
    (sum, item) => sum + (item.capacity ?? 0),
    0,
  );
  const assigned = teachers.reduce(
    (sum, item) => sum + item.activeStudentCount,
    0,
  );
  return (
    <div className="hr-overview">
      <div className="hr-kpi-grid">
        <Kpi
          icon={UsersRound}
          label="İşçilər"
          value={employees.length}
          detail="Ümumi komanda"
          tone="blue"
        />
        <Kpi
          icon={ShieldCheck}
          label="Aktiv"
          value={active}
          detail={`${employees.length ? Math.round((active / employees.length) * 100) : 0}% aktivlik`}
          tone="green"
        />
        <Kpi
          icon={GraduationCap}
          label="Müəllimlər"
          value={teachers.length}
          detail={`${teachers.filter((item) => item.isActive).length} aktiv müəllim`}
          tone="violet"
        />
        <Kpi
          icon={BriefcaseBusiness}
          label="Sınaq müddəti"
          value={probation}
          detail="İzlənməli profil"
          tone="amber"
        />
      </div>
      <div className="hr-analytics-grid">
        <section className="hr-surface hr-status-panel">
          <PanelTitle title="Komanda statusu" detail="İşçi bölgüsü" />
          <div className="hr-donut-wrap">
            {statusData.length ? (
              <div className="hr-donut">
                <ChartContainer
                  config={{ value: { label: "İşçi" } }}
                  className="hr-donut-chart"
                >
                  <PieChart>
                    <Pie
                      data={statusData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={58}
                      outerRadius={78}
                      paddingAngle={3}
                      stroke="none"
                    >
                      {statusData.map((item) => (
                        <Cell key={item.name} fill={item.fill} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} işçi`, ""]} />
                  </PieChart>
                </ChartContainer>
                <div>
                  <strong>{employees.length}</strong>
                  <span>işçi</span>
                </div>
              </div>
            ) : (
              <Empty text="Status məlumatı işçi əlavə etdikdən sonra görünəcək." />
            )}
            <div className="hr-legend">
              {Object.entries(statusMeta).map(([key, meta]) => (
                <span key={key}>
                  <i style={{ background: meta.color }} />
                  {meta.label}
                  <b>
                    {employees.filter((item) => item.status === key).length}
                  </b>
                </span>
              ))}
            </div>
          </div>
        </section>
        <section className="hr-surface">
          <PanelTitle title="Departamentlər" detail="Komanda strukturu" />
          {departments.length ? (
            <div className="hr-department-bars">
              {departments.slice(0, 6).map((item) => (
                <div key={item.name}>
                  <span>{item.name}</span>
                  <i>
                    <b
                      style={{
                        width: `${(item.value / departments[0].value) * 100}%`,
                      }}
                    />
                  </i>
                  <strong>{item.value}</strong>
                </div>
              ))}
            </div>
          ) : (
            <Empty text="Departament bölgüsü burada görünəcək." />
          )}
        </section>
        <section className="hr-surface hr-teacher-summary">
          <PanelTitle title="Müəllim yükü" detail="Cari tutum" />
          <div className="hr-teacher-value">
            <strong>{assigned}</strong>
            <span>/ {capacity || "—"} tələbə</span>
          </div>
          <div className="hr-capacity-track">
            <b
              style={{
                width: `${capacity ? Math.min((assigned / capacity) * 100, 100) : 0}%`,
              }}
            />
          </div>
          <div className="hr-teacher-list">
            {teachers.slice(0, 3).map((item) => (
              <span key={item.id}>
                <i>{initials(item.fullName)}</i>
                <b>{item.fullName}</b>
                <em>
                  {item.activeStudentCount}/{item.capacity || "—"}
                </em>
              </span>
            ))}
          </div>
        </section>
      </div>
      <section className="hr-surface hr-recent">
        <div className="hr-recent-head">
          <PanelTitle
            title="Son yenilənən işçilər"
            detail="Komandadakı son dəyişikliklər"
          />
          <Button variant="outline" onClick={onEmployees}>
            Bütün işçilər
          </Button>
        </div>
        <EmployeeTable
          employees={employees.slice(0, 5)}
          canManage={false}
          compact
        />
      </section>
    </div>
  );
}

function Kpi({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof UsersRound;
  label: string;
  value: number;
  detail: string;
  tone: string;
}) {
  return (
    <article className={`hr-kpi is-${tone}`}>
      <span>
        <Icon />
      </span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{detail}</p>
      </div>
    </article>
  );
}
function PanelTitle({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="hr-panel-title">
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="hr-empty">
      <UsersRound />
      <span>{text}</span>
    </div>
  );
}

function EmployeeTable({
  employees,
  canManage,
  onEdit,
  onDelete,
  compact = false,
}: {
  employees: HrEmployeeRow[];
  canManage: boolean;
  onEdit?: (employee: HrEmployeeRow) => void;
  onDelete?: (employee: HrEmployeeRow) => void;
  compact?: boolean;
}) {
  return (
    <section
      className={
        compact ? "hr-table-section is-compact" : "hr-surface hr-table-section"
      }
    >
      <div className="hr-table-scroll" data-erp-table-scroll="">
        <table data-erp-table="" data-erp-sticky-first="">
          <thead>
            <tr>
              <th>Əməkdaş</th>
              <th>Tip / vəzifə</th>
              <th>Departament</th>
              <th>Maaş</th>
              <th>Status</th>
              <th>İşə başlama</th>
              {canManage ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {employees.length ? (
              employees.map((employee) => (
                <tr key={employee.id}>
                  <td>
                    <Link href={`/hr/${employee.id}` as Route} className="hr-person hr-person-link">
                      <span>{initials(employee.fullName)}</span>
                      <div>
                        <strong>{employee.fullName}</strong>
                        <small>
                          {employee.email ||
                            employee.phone ||
                            "Əlaqə qeyd edilməyib"}
                        </small>
                      </div>
                    </Link>
                  </td>
                  <td>
                    <Badge
                      variant={
                        employee.staffType === "TEACHER"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {employee.staffType === "TEACHER" ? "Müəllim" : "İşçi"}
                    </Badge>
                    <small className="hr-salary-mode">
                      {employee.position}
                    </small>
                  </td>
                  <td>
                    <Badge variant="secondary">{employee.department}</Badge>
                  </td>
                  <td>
                    <strong className="hr-salary-cell">
                      {employee.salaryMode === "PERCENT"
                        ? `${employee.salaryPercent}%`
                        : formatMoney(employee.salaryAmount)}
                    </strong>
                    <small className="hr-salary-mode">
                      {employee.salaryMode === "PERCENT" ? "Faizlə" : "Statik"}
                    </small>
                  </td>
                  <td>
                    <Badge
                      variant="outline"
                      className={`hr-status is-${statusMeta[employee.status].className}`}
                    >
                      <i />
                      {statusMeta[employee.status].label}
                    </Badge>
                  </td>
                  <td>{formatDate(employee.hireDate)}</td>
                  {canManage ? (
                    <td>
                      <div className="hr-row-actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit?.(employee)}
                        >
                          Düzəliş
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${employee.fullName} sil`}
                          onClick={() => onDelete?.(employee)}
                        >
                          <MoreHorizontal />
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={canManage ? 7 : 6}>
                  <Empty text="Filtrə uyğun əməkdaş yoxdur. Yeni əməkdaş yaradaraq başlayın." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ArchiveTable({
  employees,
  allTimeEmployeeCount,
}: {
  employees: HrEmployeeRow[];
  allTimeEmployeeCount: number;
}) {
  return (
    <section className="hr-surface hr-table-section hr-archive-section">
      <div className="hr-archive-summary">
        <span aria-hidden="true"><Archive /></span>
        <div>
          <strong>{employees.length} arxiv qeydi</strong>
          <small>Şirkətdə indiyədək {allTimeEmployeeCount} əməkdaş profili olub.</small>
        </div>
      </div>
      <div className="hr-table-scroll" data-erp-table-scroll="">
        <table data-erp-table="" data-erp-sticky-first="">
          <thead>
            <tr>
              <th>Əməkdaş</th>
              <th>Son vəzifə</th>
              <th>İşə başlama</th>
              <th>İşdən çıxma</th>
              <th>Səbəb</th>
              <th>Arxivləşdirən</th>
            </tr>
          </thead>
          <tbody>
            {employees.length ? employees.map((employee) => (
              <tr key={employee.id}>
                <td>
                  <Link href={`/hr/${employee.id}` as Route} className="hr-person hr-person-link">
                    <span>{initials(employee.fullName)}</span>
                    <div><strong>{employee.fullName}</strong><small>{employee.email || employee.phone || "Əlaqə qeyd edilməyib"}</small></div>
                  </Link>
                </td>
                <td><strong>{employee.position}</strong><small className="hr-salary-mode">{employee.department}</small></td>
                <td>{formatDate(employee.hireDate)}</td>
                <td>{employee.employmentEndedAt ? formatDate(employee.employmentEndedAt) : "—"}</td>
                <td><span className="hr-archive-reason">{employee.exitReason || "Qeyd edilməyib"}</span></td>
                <td>{employee.archivedByName || "Sistem"}</td>
              </tr>
            )) : (
              <tr><td colSpan={6}><Empty text="Komanda arxivində qeyd yoxdur." /></td></tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function TeacherTable({
  teachers,
  canManage,
  onEdit,
  onEditSalary,
  onDelete,
}: {
  teachers: TeacherDirectoryData["teachers"];
  canManage: boolean;
  onEdit: (teacher: TeacherDirectoryData["teachers"][number]) => void;
  onEditSalary: (teacher: TeacherDirectoryData["teachers"][number]) => void;
  onDelete: (teacher: TeacherDirectoryData["teachers"][number]) => void;
}) {
  return (
    <section className="hr-surface hr-table-section">
      <div className="hr-table-scroll" data-erp-table-scroll="">
        <table data-erp-table="" data-erp-sticky-first="">
          <thead>
            <tr>
              <th>Müəllim</th>
              <th>Davamiyyət</th>
              <th>Ödəniş bazası</th>
              <th>Faiz</th>
              <th>Cari hesablanan maaş</th>
              {canManage ? <th /> : null}
            </tr>
          </thead>
          <tbody>
            {teachers.length ? (
              teachers.map((teacher) => (
                <tr key={teacher.id}>
                  <td>
                    <Link href={(teacher.hrEmployeeId ? `/hr/${teacher.hrEmployeeId}` : "/hr") as Route} className="hr-person hr-person-link">
                      <span>{initials(teacher.fullName)}</span>
                      <div>
                        <strong>{teacher.fullName}</strong>
                        <small>{teacher.activeStudentCount} aktiv tələbə</small>
                      </div>
                    </Link>
                  </td>
                  <td>
                    <strong>{teacher.attendedLessons} gəldi</strong>
                    <small className="hr-salary-mode">
                      {teacher.absentLessons} gəlmədi · {teacher.plannedLessons || 0} plan
                    </small>
                  </td>
                  <td>
                    <strong>{formatMoney(teacher.eligibleRevenue)}</strong>
                    <small className="hr-salary-mode">
                      {formatMoney(teacher.paidRevenue)} ödənişdən
                    </small>
                  </td>
                  <td>
                    <Badge variant="secondary">
                      {teacher.salaryMode === "STATIC"
                        ? "Statik maaş"
                        : teacher.salaryPercent
                        ? `${teacher.salaryPercent}%`
                        : "Təyin edilməyib"}
                    </Badge>
                  </td>
                  <td>
                    <strong className="hr-salary-cell">
                      {formatMoney(teacher.estimatedSalary)}
                    </strong>
                  </td>
                  {canManage ? (
                    <td>
                      <div className="hr-row-actions">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit(teacher)}
                        >
                          Profil
                        </Button>
                        {!teacher.hrEmployeeId && teacher.salaryMode === "PERCENT" ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => onEditSalary(teacher)}
                          >
                            Faiz
                          </Button>
                        ) : null}
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`${teacher.fullName} müəllimlik statusunu sil`}
                          onClick={() => onDelete(teacher)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={canManage ? 6 : 5}>
                  <Empty text="Müəllim məlumatı yoxdur." />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function EmployeeDialog({
  employee,
  today,
  lookups,
  initialStaffType,
  pending,
  onClose,
  onSubmit,
}: {
  employee?: HrEmployeeRow;
  today: string;
  lookups: HrEmployeeData["lookups"];
  initialStaffType: "EMPLOYEE" | "TEACHER";
  pending: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  const [staffType, setStaffType] = useState<"EMPLOYEE" | "TEACHER">(
    employee?.staffType ?? initialStaffType,
  );
  const [salaryMode, setSalaryMode] = useState<"STATIC" | "PERCENT">(
    employee?.salaryMode ?? "STATIC",
  );
  const [photoPreview, setPhotoPreview] = useState(employee?.profilePhotoUrl ?? "");
  const [photoError, setPhotoError] = useState("");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }
  function changeStaffType(value: "EMPLOYEE" | "TEACHER") {
    setStaffType(value);
    if (value === "TEACHER") setSalaryMode("PERCENT");
  }
  function changeProfilePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    setPhotoError("");
    if (!file) {
      setPhotoPreview(employee?.profilePhotoUrl ?? "");
      return;
    }
    if (!(["image/jpeg", "image/png", "image/webp"].includes(file.type)) || file.size > 5 * 1024 * 1024) {
      event.currentTarget.value = "";
      setPhotoPreview(employee?.profilePhotoUrl ?? "");
      setPhotoError("JPEG, PNG və ya WebP seçin; maksimum ölçü 5 MB-dır.");
      return;
    }
    const reader = new FileReader();
    reader.addEventListener("load", () => setPhotoPreview(String(reader.result ?? "")), { once: true });
    reader.readAsDataURL(file);
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="hr-employee-dialog hr-unified-staff-dialog">
        <DialogHeader>
          <DialogTitle>
            {employee ? "Əməkdaş profilini yenilə" : "Əməkdaş yarat"}
          </DialogTitle>
          <DialogDescription>
            Əməkdaş tipini və iş məlumatlarını vahid profildə idarə edin.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="hr-employee-form">
          {employee ? (
            <input type="hidden" name="id" value={employee.id} />
          ) : null}
          <div className="hr-profile-photo-field is-wide">
            <div className="hr-profile-photo-preview" aria-hidden="true">
              {photoPreview ? (
                <Image src={photoPreview} alt="" fill sizes="84px" unoptimized />
              ) : (
                <UsersRound />
              )}
            </div>
            <label>
              <span>Profil şəkli</span>
              <input name="profilePhoto" type="file" accept="image/jpeg,image/png,image/webp" onChange={changeProfilePhoto} />
              <small>JPEG, PNG və ya WebP · maksimum 5 MB. Şəkil dashboard-un sol-alt hissəsində görünəcək.</small>
              {photoError ? <em role="alert">{photoError}</em> : null}
            </label>
          </div>
          <label className="is-wide">
            <span>Əməkdaş tipi</span>
            <select
              name="staffType"
              value={staffType}
              onChange={(event) =>
                changeStaffType(event.target.value as "EMPLOYEE" | "TEACHER")
              }
            >
              <option value="EMPLOYEE">İşçi / inzibati əməkdaş</option>
              <option value="TEACHER">Müəllim</option>
            </select>
          </label>
          <label>
            <span>Ad soyad</span>
            <Input name="fullName" defaultValue={employee?.fullName} required />
          </label>
          <label>
            <span>Əlaqə e-poçtu</span>
            <Input name="email" type="email" defaultValue={employee?.email} />
          </label>
          <label>
            <span>Telefon</span>
            <Input name="phone" type="tel" defaultValue={employee?.phone} />
          </label>
          <label className="is-wide">
            <span>Ünvan</span>
            <Input
              name="address"
              defaultValue={employee?.address}
              maxLength={240}
              placeholder="Yaşayış ünvanı"
            />
          </label>
          <CreatableLookup
            name="department"
            label="Departament"
            kind="DEPARTMENT"
            initialValue={
              employee?.department ??
              (staffType === "TEACHER" ? "Tədris" : undefined)
            }
            options={lookups.departments}
          />
          {staffType === "TEACHER" ? (
            <>
              <input type="hidden" name="position" value="Müəllim" />
              <label>
                <span>Tələbə tutumu</span>
                <Input
                  name="teacherCapacity"
                  type="number"
                  min="1"
                  max="500"
                  defaultValue={employee?.teacherCapacity || 20}
                  required
                />
              </label>
            </>
          ) : (
            <>
              <CreatableLookup
                name="position"
                label="Vəzifə"
                kind="POSITION"
                initialValue={employee?.position}
                options={lookups.positions}
              />
              <input type="hidden" name="teacherCapacity" value="0" />
            </>
          )}
          <label>
            <span>İşə başlama</span>
            <Input
              name="hireDate"
              type="date"
              defaultValue={
                employee?.hireDate ?? today
              }
              required
            />
          </label>
          <label>
            <span>Status</span>
            <select name="status" defaultValue={employee?.status ?? "ACTIVE"}>
              {Object.entries(statusMeta).map(([value, meta]) => (
                <option value={value} key={value}>
                  {meta.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Müqavilə</span>
            <select
              name="contractType"
              defaultValue={
                employee?.contractType ??
                (staffType === "TEACHER" ? "PART_TIME" : "FULL_TIME")
              }
            >
              <option value="FULL_TIME">Tam ştat</option>
              <option value="PART_TIME">Yarım ştat</option>
              <option value="CONTRACTOR">Müqaviləli</option>
            </select>
          </label>
          <label>
            <span>Maaş növü</span>
            <select
              name="salaryMode"
              value={salaryMode}
              onChange={(event) =>
                setSalaryMode(event.target.value as "STATIC" | "PERCENT")
              }
            >
              <option value="STATIC">Statik maaş</option>
              <option value="PERCENT">Faizlə maaş</option>
            </select>
          </label>
          {salaryMode === "STATIC" ? (
            <label>
              <span>Aylıq maaş (AZN)</span>
              <Input
                name="salaryAmount"
                type="number"
                min="0.01"
                step="0.01"
                defaultValue={employee?.salaryAmount || ""}
                required
              />
              <input type="hidden" name="salaryPercent" value="0" />
            </label>
          ) : (
            <label>
              <span>Maaş faizi</span>
              <Input
                name="salaryPercent"
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                defaultValue={employee?.salaryPercent || ""}
                required
              />
              <input type="hidden" name="salaryAmount" value="0" />
            </label>
          )}
          <DialogFooter className="is-wide">
            <Button type="button" variant="outline" onClick={onClose}>
              Ləğv et
            </Button>
            <Button type="submit" disabled={pending}>
              {employee ? "Yadda saxla" : staffType === "TEACHER" ? "Müəllimi əlavə et" : "Əməkdaşı yarat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CreatableLookup({
  name,
  label,
  kind,
  initialValue,
  options,
}: {
  name: string;
  label: string;
  kind: "DEPARTMENT" | "POSITION";
  initialValue?: string;
  options: string[];
}) {
  const normalizedOptions = initialValue && !options.includes(initialValue)
    ? [initialValue, ...options]
    : options;
  return (
    <label>
      <span>{label}</span>
      <FormSelect
        name={name}
        defaultValue={initialValue ?? normalizedOptions[0] ?? ""}
        options={normalizedOptions.map((option) => ({ value: option, label: option }))}
        searchable
        searchPlaceholder={`${label} axtar...`}
        catalogKey={kind === "DEPARTMENT" ? "HR_DEPARTMENT" : "HR_POSITION"}
        createLabel={`Yeni ${label.toLocaleLowerCase("az")} əlavə et`}
        required
      />
    </label>
  );
}

function TeacherSalaryDialog({
  teacher,
  pending,
  onClose,
  onSubmit,
}: {
  teacher: TeacherDirectoryData["teachers"][number];
  pending: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="hr-confirm-dialog">
        <DialogHeader>
          <DialogTitle>{teacher.fullName} · maaş faizi</DialogTitle>
          <DialogDescription>
            Cari ay üçün hər “Gəldi” dərsin ödəniş payı həmin dərsin müəlliminə
            və onun faizinə görə hesablanacaq. “Gəlmədi” maaş bazasına daxil deyil.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="hr-teacher-salary-form">
          <input type="hidden" name="teacherId" value={teacher.id} />
          <label>
            <span>Maaş faizi</span>
            <Input
              name="salaryPercent"
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              defaultValue={teacher.salaryPercent || ""}
              required
            />
          </label>
          <div className="hr-formula-preview">
            <span>Ödəniş</span>
            <strong>{formatMoney(teacher.paidRevenue)}</strong>
            <span>Davamiyyət bazası</span>
            <strong>{formatMoney(teacher.eligibleRevenue)}</strong>
            <span>Jurnal</span>
            <strong>{teacher.attendedLessons} gəldi · {teacher.absentLessons} gəlmədi</strong>
            <span>Cari hesab</span>
            <strong>{formatMoney(teacher.estimatedSalary)}</strong>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Ləğv et
            </Button>
            <Button type="submit" disabled={pending}>
              Faizi saxla və hesabla
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function TeacherProfileDialog({
  teacher,
  pending,
  onClose,
  onSubmit,
}: {
  teacher?: TeacherDirectoryData["teachers"][number];
  pending: boolean;
  onClose: () => void;
  onSubmit: (form: FormData) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="hr-confirm-dialog">
        <DialogHeader>
          <DialogTitle>
            {teacher ? "Müəllim profilini yenilə" : "Yeni müəllim"}
          </DialogTitle>
          <DialogDescription>
            Profil və tutum yenilənəcək
            {teacher?.salaryMode === "PERCENT" ? "; maaş faizi də eyni əməliyyatda saxlanacaq." : "."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="hr-teacher-salary-form">
          {teacher ? (
            <input type="hidden" name="id" value={teacher.id} />
          ) : null}
          <label>
            <span>Ad soyad</span>
            <Input name="fullName" defaultValue={teacher?.fullName} required />
          </label>
          <label>
            <span>Telefon</span>
            <Input name="phone" type="tel" defaultValue={teacher?.phone} />
          </label>
          <label>
            <span>Tələbə tutumu</span>
            <Input
              name="capacity"
              type="number"
              min="1"
              max="500"
              defaultValue={teacher?.capacity || 20}
              required
            />
          </label>
          {teacher?.salaryMode !== "STATIC" ? (
            <label>
              <span>Maaş faizi</span>
              <Input
                name="salaryPercent"
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                defaultValue={teacher?.salaryPercent || ""}
                required
              />
            </label>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Ləğv et
            </Button>
            <Button type="submit" disabled={pending}>
              {teacher ? "Yadda saxla" : "Müəllim yarat"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("az"))
    .join("");
}
function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  const months = [
    "yan",
    "fev",
    "mar",
    "apr",
    "may",
    "iyn",
    "iyl",
    "avq",
    "sen",
    "okt",
    "noy",
    "dek",
  ];
  return `${day} ${months[Number(month) - 1] ?? month} ${year}`;
}
function formatMoney(value: number) {
  return `${value.toFixed(2)} ₼`;
}
