"use client";

import type { Dispatch, FormEvent, ReactNode, SetStateAction } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  BriefcaseBusiness,
  Mail,
  Pencil,
  Phone,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import { cx } from "@/components/ui/cx";

type EmployeeStatus = "ACTIVE" | "PROBATION" | "ON_LEAVE" | "INACTIVE";
type ContractType = "FULL_TIME" | "PART_TIME" | "CONTRACTOR";

type Employee = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  department: string;
  position: string;
  manager: string;
  hireDate: string;
  salary: number;
  status: EmployeeStatus;
  contractType: ContractType;
  note: string;
};

type EmployeeFormState = Omit<Employee, "id">;

const storageKey = "artmonia-hr-employees-v1";

const employeeStatuses: Array<{ value: EmployeeStatus; label: string }> = [
  { value: "ACTIVE", label: "Aktiv" },
  { value: "PROBATION", label: "Sınaq müddəti" },
  { value: "ON_LEAVE", label: "Məzuniyyətdə" },
  { value: "INACTIVE", label: "Deaktiv" },
];

const contractTypes: Array<{ value: ContractType; label: string }> = [
  { value: "FULL_TIME", label: "Tam ştat" },
  { value: "PART_TIME", label: "Yarım ştat" },
  { value: "CONTRACTOR", label: "Müqaviləli" },
];

const departments = ["Satış", "Tədris", "Maliyyə", "Operasiya", "Marketing"];

const seedEmployees: Employee[] = [
  {
    id: "emp-ayshen",
    fullName: "Ayşən Məmmədova",
    email: "ayshen@artmonia.az",
    phone: "+994 50 412 18 90",
    department: "Satış",
    position: "Sales Manager",
    manager: "Artmonia Owner",
    hireDate: "2026-04-15",
    salary: 950,
    status: "ACTIVE",
    contractType: "FULL_TIME",
    note: "Komanda performansında ən yüksək gəlir göstəricisi ilə izlənir.",
  },
  {
    id: "emp-zara",
    fullName: "Zara Əliyeva",
    email: "zara@artmonia.az",
    phone: "+994 55 771 02 14",
    department: "Satış",
    position: "Lead Consultant",
    manager: "Artmonia Owner",
    hireDate: "2026-04-20",
    salary: 850,
    status: "ACTIVE",
    contractType: "FULL_TIME",
    note: "Güclü dialoq və konsultasiya follow-up sahəsində izlənir.",
  },
  {
    id: "emp-nicat",
    fullName: "Nicat Hüseynov",
    email: "nicat@artmonia.az",
    phone: "+994 70 488 61 19",
    department: "Satış",
    position: "Junior Sales Specialist",
    manager: "Ayşən Məmmədova",
    hireDate: "2026-05-09",
    salary: 650,
    status: "PROBATION",
    contractType: "PART_TIME",
    note: "Empatiya və satış skriptləri üzrə inkişaf planındadır.",
  },
  {
    id: "emp-finance",
    fullName: "Leyla Qasımova",
    email: "leyla@artmonia.az",
    phone: "+994 77 621 44 10",
    department: "Maliyyə",
    position: "Finance Coordinator",
    manager: "Artmonia Owner",
    hireDate: "2026-03-01",
    salary: 1200,
    status: "ACTIVE",
    contractType: "FULL_TIME",
    note: "Ödəniş, borc və aylıq bağlanış proseslərinə baxır.",
  },
];

const emptyForm: EmployeeFormState = {
  fullName: "",
  email: "",
  phone: "",
  department: departments[0],
  position: "",
  manager: "",
  hireDate: new Date().toISOString().slice(0, 10),
  salary: 0,
  status: "ACTIVE",
  contractType: "FULL_TIME",
  note: "",
};

const monthNames = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avq", "sen", "okt", "noy", "dek"];

export function EmployeeCrud() {
  const [employees, setEmployees] = useState<Employee[]>(seedEmployees);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | EmployeeStatus>("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(seedEmployees[0]?.id ?? "");
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [formState, setFormState] = useState<EmployeeFormState>(emptyForm);
  const [formOpen, setFormOpen] = useState(false);
  const [employeeToDelete, setEmployeeToDelete] = useState<Employee | null>(null);
  const employeesLoadedRef = useRef(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(storageKey);

    if (!stored) {
      employeesLoadedRef.current = true;
      return;
    }

    window.setTimeout(() => {
      try {
        const parsed: unknown = JSON.parse(stored);

        if (Array.isArray(parsed)) {
          const restored = parsed.filter(isEmployee);
          employeesLoadedRef.current = true;
          setEmployees(restored);
          setSelectedEmployeeId(restored[0]?.id ?? "");
          return;
        }
      } catch {
        window.localStorage.removeItem(storageKey);
      }

      employeesLoadedRef.current = true;
    }, 0);
  }, []);

  useEffect(() => {
    if (!employeesLoadedRef.current) {
      return;
    }

    window.localStorage.setItem(storageKey, JSON.stringify(employees));
  }, [employees]);

  const employeeDepartments = useMemo(
    () =>
      Array.from(new Set([...departments, ...employees.map((employee) => employee.department)]))
        .filter(Boolean)
        .sort((first, second) => first.localeCompare(second, "az")),
    [employees]
  );

  const filteredEmployees = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("az");

    return employees.filter((employee) => {
      const searchTarget = [
        employee.fullName,
        employee.email,
        employee.phone,
        employee.department,
        employee.position,
        employee.manager,
      ]
        .join(" ")
        .toLocaleLowerCase("az");

      return (
        (!normalizedQuery || searchTarget.includes(normalizedQuery)) &&
        (statusFilter === "all" || employee.status === statusFilter) &&
        (departmentFilter === "all" || employee.department === departmentFilter)
      );
    });
  }, [departmentFilter, employees, query, statusFilter]);

  const selectedEmployee =
    employees.find((employee) => employee.id === selectedEmployeeId) ??
    filteredEmployees[0] ??
    employees[0] ??
    null;

  const summary = useMemo(() => {
    const activeCount = employees.filter((employee) => employee.status === "ACTIVE").length;
    const probationCount = employees.filter((employee) => employee.status === "PROBATION").length;
    const payroll = employees.reduce((sum, employee) => sum + employee.salary, 0);

    return {
      total: employees.length,
      activeCount,
      probationCount,
      payroll,
    };
  }, [employees]);

  function openCreateDialog() {
    setEditingEmployee(null);
    setFormState(emptyForm);
    setFormOpen(true);
  }

  function openEditDialog(employee: Employee) {
    setEditingEmployee(employee);
    setFormState({
      fullName: employee.fullName,
      email: employee.email,
      phone: employee.phone,
      department: employee.department,
      position: employee.position,
      manager: employee.manager,
      hireDate: employee.hireDate,
      salary: employee.salary,
      status: employee.status,
      contractType: employee.contractType,
      note: employee.note,
    });
    setFormOpen(true);
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalized: EmployeeFormState = {
      ...formState,
      fullName: formState.fullName.trim(),
      email: formState.email.trim(),
      phone: formState.phone.trim(),
      position: formState.position.trim(),
      manager: formState.manager.trim(),
      department: formState.department.trim() || departments[0],
      salary: Number.isFinite(Number(formState.salary)) ? Number(formState.salary) : 0,
      note: formState.note.trim(),
    };

    if (!normalized.fullName || !normalized.position) {
      return;
    }

    if (editingEmployee) {
      setEmployees((current) =>
        current.map((employee) =>
          employee.id === editingEmployee.id ? { ...employee, ...normalized } : employee
        )
      );
      setSelectedEmployeeId(editingEmployee.id);
    } else {
      const nextEmployee = {
        ...normalized,
        id: createEmployeeId(),
      };
      setEmployees((current) => [nextEmployee, ...current]);
      setSelectedEmployeeId(nextEmployee.id);
    }

    setFormOpen(false);
    setEditingEmployee(null);
  }

  function confirmDelete() {
    if (!employeeToDelete) {
      return;
    }

    setEmployees((current) => current.filter((employee) => employee.id !== employeeToDelete.id));

    if (selectedEmployeeId === employeeToDelete.id) {
      const nextEmployee = employees.find((employee) => employee.id !== employeeToDelete.id);
      setSelectedEmployeeId(nextEmployee?.id ?? "");
    }

    setEmployeeToDelete(null);
  }

  function resetEmployees() {
    setEmployees(seedEmployees);
    setSelectedEmployeeId(seedEmployees[0]?.id ?? "");
    setQuery("");
    setStatusFilter("all");
    setDepartmentFilter("all");
  }

  return (
    <article className="panel crm-table-panel hr-employee-workspace">
      <div className="hr-section-head">
        <div>
          <p className="eyeless-label">HR əməliyyatları</p>
          <h2>İşçi bazası</h2>
          <p>İşçi əlavə et, məlumatları redaktə et, statusları izlə və lazım olduqda sil.</p>
        </div>

        <div className="hr-employee-actions">
          <Button type="button" variant="outline" size="sm" onClick={resetEmployees}>
            <RotateCcw data-icon="inline-start" />
            Sıfırla
          </Button>
          <Button type="button" size="sm" onClick={openCreateDialog}>
            <Plus data-icon="inline-start" />
            İşçi əlavə et
          </Button>
        </div>
      </div>

      <div className="hr-employee-metrics" aria-label="İşçi göstəriciləri">
        <CompactMetric label="İşçi" value={summary.total.toString()} helper="ümumi qeyd" />
        <CompactMetric label="Aktiv" value={summary.activeCount.toString()} helper="hazırda işləyir" />
        <CompactMetric label="Sınaq" value={summary.probationCount.toString()} helper="sınaq müddəti" />
        <CompactMetric label="Maaş fondu" value={formatAmount(summary.payroll)} helper="aylıq plan" />
      </div>

      <div className="hr-employee-layout">
        <div className="hr-employee-main">
          <div className="hr-employee-toolbar">
            <label className="table-search hr-employee-search">
              <Search size={15} />
              <span className="sr-only">İşçi axtar</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Ad, telefon, email, vəzifə üzrə axtar"
              />
            </label>

            <label>
              <span>Status</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as "all" | EmployeeStatus)}
              >
                <option value="all">Bütün statuslar</option>
                {employeeStatuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>Departament</span>
              <select
                value={departmentFilter}
                onChange={(event) => setDepartmentFilter(event.target.value)}
              >
                <option value="all">Bütün departamentlər</option>
                {employeeDepartments.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="hr-employee-grid-view">
            {filteredEmployees.length > 0 ? (
              filteredEmployees.map((employee) => (
                <div
                  className={cx("hr-employee-card-item", employee.id === selectedEmployee?.id && "is-selected")}
                  key={employee.id}
                  onClick={() => setSelectedEmployeeId(employee.id)}
                >
                  <div className="hr-employee-card-head">
                    <span className="hr-employee-avatar">{getInitials(employee.fullName)}</span>
                    <div className="hr-employee-card-title">
                      <h3>{employee.fullName}</h3>
                      <span>{employee.position}</span>
                    </div>
                  </div>
                  <div className="hr-employee-card-details">
                    <div className="hr-employee-card-meta">
                      <span className="hr-card-badge department">{employee.department}</span>
                      <span className="hr-card-badge contract">{getContractLabel(employee.contractType)}</span>
                    </div>
                    <div className="hr-employee-card-status">
                      <StatusChip tone={getEmployeeStatusTone(employee.status)}>
                        {getEmployeeStatusLabel(employee.status)}
                      </StatusChip>
                    </div>
                  </div>
                  <div className="hr-employee-card-footer">
                    <div className="hr-employee-card-salary">
                      <span>Maaş</span>
                      <strong>{formatAmount(employee.salary)}</strong>
                    </div>
                    <div className="hr-employee-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`${employee.fullName} redaktə et`}
                        title="Redaktə et"
                        onClick={() => openEditDialog(employee)}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="icon-button hr-delete-button"
                        type="button"
                        aria-label={`${employee.fullName} sil`}
                        title="Sil"
                        onClick={() => setEmployeeToDelete(employee)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="empty-state">İşçi tapılmadı</div>
            )}
          </div>
        </div>

        <EmployeeDetail employee={selectedEmployee} onEdit={openEditDialog} />
      </div>

      <EmployeeFormDialog
        employee={editingEmployee}
        formOpen={formOpen}
        formState={formState}
        setFormOpen={setFormOpen}
        setFormState={setFormState}
        onSubmit={handleSubmit}
      />

      <Dialog open={Boolean(employeeToDelete)} onOpenChange={(open) => !open && setEmployeeToDelete(null)}>
        <DialogContent className="hr-delete-dialog">
          <DialogHeader>
            <DialogTitle>İşçini sil?</DialogTitle>
            <DialogDescription>
              {employeeToDelete?.fullName} HR bazasından silinəcək. Bu əməliyyatı geri almaq üçün
              demo datanı sıfırlamaq lazımdır.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setEmployeeToDelete(null)}>
              Ləğv et
            </Button>
            <Button type="button" className="hr-danger-action" onClick={confirmDelete}>
              <Trash2 data-icon="inline-start" />
              Sil
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </article>
  );
}

function CompactMetric({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <div className="hr-compact-metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </div>
  );
}

function EmployeeDetail({
  employee,
  onEdit,
}: {
  employee: Employee | null;
  onEdit: (employee: Employee) => void;
}) {
  if (!employee) {
    return (
      <aside className="hr-employee-detail">
        <div className="empty-state">Seçilmiş işçi yoxdur</div>
      </aside>
    );
  }

  return (
    <aside className="hr-employee-detail">
      <div className="hr-detail-top">
        <span className="hr-detail-avatar">{getInitials(employee.fullName)}</span>
        <div>
          <strong>{employee.fullName}</strong>
          <span>{employee.position}</span>
        </div>
      </div>

      <div className="hr-detail-status-row">
        <StatusChip tone={getEmployeeStatusTone(employee.status)}>
          {getEmployeeStatusLabel(employee.status)}
        </StatusChip>
        <span>{getContractLabel(employee.contractType)}</span>
      </div>

      <div className="hr-detail-list">
        <DetailItem icon={BriefcaseBusiness} label="Departament" value={employee.department} />
        <DetailItem icon={UserRound} label="Menecer" value={employee.manager || "-"} />
        <DetailItem icon={Mail} label="Email" value={employee.email || "-"} />
        <DetailItem icon={Phone} label="Telefon" value={employee.phone || "-"} />
      </div>

      <div className="hr-detail-payroll">
        <span>Maaş</span>
        <strong>{formatAmount(employee.salary)}</strong>
        <small>Başlama: {formatDate(employee.hireDate)}</small>
      </div>

      <p className="hr-detail-note">{employee.note || "Qeyd yoxdur"}</p>

      <Button type="button" variant="outline" size="sm" onClick={() => onEdit(employee)}>
        <Pencil data-icon="inline-start" />
        Redaktə et
      </Button>
    </aside>
  );
}

function DetailItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof BriefcaseBusiness;
  label: string;
  value: string;
}) {
  return (
    <div className="hr-detail-item">
      <Icon size={15} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function EmployeeFormDialog({
  employee,
  formOpen,
  formState,
  setFormOpen,
  setFormState,
  onSubmit,
}: {
  employee: Employee | null;
  formOpen: boolean;
  formState: EmployeeFormState;
  setFormOpen: (open: boolean) => void;
  setFormState: Dispatch<SetStateAction<EmployeeFormState>>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Dialog open={formOpen} onOpenChange={setFormOpen}>
      <DialogContent className="hr-employee-dialog">
        <DialogHeader>
          <DialogTitle>{employee ? "İşçini redaktə et" : "Yeni işçi əlavə et"}</DialogTitle>
          <DialogDescription>
            Əsas HR məlumatlarını doldur. Dəyişikliklər bu brauzerdə saxlanılır.
          </DialogDescription>
        </DialogHeader>

        <form className="crm-form crm-form-dialog hr-employee-form" onSubmit={onSubmit}>
          <div className="field-grid">
            <Field label="Ad soyad">
              <Input
                value={formState.fullName}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, fullName: event.target.value }))
                }
                required
                placeholder="Məs: Aysel Əliyeva"
              />
            </Field>
            <Field label="Vəzifə">
              <Input
                value={formState.position}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, position: event.target.value }))
                }
                required
                placeholder="Məs: HR Specialist"
              />
            </Field>
          </div>

          <div className="field-grid">
            <Field label="Email">
              <Input
                type="email"
                value={formState.email}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="name@artmonia.az"
              />
            </Field>
            <Field label="Telefon">
              <Input
                value={formState.phone}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, phone: event.target.value }))
                }
                placeholder="+994..."
              />
            </Field>
          </div>

          <div className="field-grid">
            <Field label="Departament">
              <select
                value={formState.department}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, department: event.target.value }))
                }
              >
                {departments.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Menecer">
              <Input
                value={formState.manager}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, manager: event.target.value }))
                }
                placeholder="Məs: Artmonia Owner"
              />
            </Field>
          </div>

          <div className="field-grid">
            <Field label="Başlama tarixi">
              <Input
                type="date"
                value={formState.hireDate}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, hireDate: event.target.value }))
                }
              />
            </Field>
            <Field label="Maaş">
              <Input
                min={0}
                type="number"
                value={formState.salary}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, salary: Number(event.target.value) }))
                }
              />
            </Field>
          </div>

          <div className="field-grid">
            <Field label="Status">
              <select
                value={formState.status}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    status: event.target.value as EmployeeStatus,
                  }))
                }
              >
                {employeeStatuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Müqavilə">
              <select
                value={formState.contractType}
                onChange={(event) =>
                  setFormState((current) => ({
                    ...current,
                    contractType: event.target.value as ContractType,
                  }))
                }
              >
                {contractTypes.map((contract) => (
                  <option key={contract.value} value={contract.value}>
                    {contract.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Field label="Qeyd">
            <textarea
              value={formState.note}
              onChange={(event) =>
                setFormState((current) => ({ ...current, note: event.target.value }))
              }
              placeholder="İşçi haqqında qısa qeyd"
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Ləğv et
            </Button>
            <Button type="submit">
              <Save data-icon="inline-start" />
              Saxla
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function isEmployee(value: unknown): value is Employee {
  if (!value || typeof value !== "object") {
    return false;
  }

  const employee = value as Partial<Employee>;
  return Boolean(employee.id && employee.fullName && employee.department && employee.position);
}

function createEmployeeId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `emp-${Date.now().toString(36)}`;
}

function getEmployeeStatusLabel(status: EmployeeStatus) {
  return employeeStatuses.find((item) => item.value === status)?.label ?? status;
}

function getEmployeeStatusTone(status: EmployeeStatus) {
  switch (status) {
    case "ACTIVE":
      return "success";
    case "PROBATION":
      return "warning";
    case "ON_LEAVE":
      return "info";
    default:
      return "neutral";
  }
}

function getContractLabel(contractType: ContractType) {
  return contractTypes.find((item) => item.value === contractType)?.label ?? contractType;
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

function formatAmount(value: number) {
  const rounded = Math.round(value);
  const formatted = rounded.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

  return `${formatted} AZN`;
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  const monthIndex = Math.max(0, Number(month) - 1);

  return `${day} ${monthNames[monthIndex] ?? month} ${year}`;
}
