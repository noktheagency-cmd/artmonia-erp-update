import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

export type HrEmployeeRow = {
  id: string;
  staffType: "EMPLOYEE" | "TEACHER";
  teacherId: string;
  teacherCapacity: number;
  fullName: string;
  profilePhotoUrl: string;
  email: string;
  phone: string;
  address: string;
  department: string;
  position: string;
  hireDate: string;
  status: "ACTIVE" | "PROBATION" | "ON_LEAVE" | "INACTIVE";
  contractType: string;
  salaryMode: "STATIC" | "PERCENT";
  salaryAmount: number;
  salaryPercent: number;
  updatedAt: string;
};

export type HrEmployeeData = {
  employees: HrEmployeeRow[];
  today: string;
  lookups: { departments: string[]; positions: string[] };
  permissions: { canRead: boolean; canManage: boolean; canExport: boolean };
};

export async function getHrEmployeeData(): Promise<HrEmployeeData> {
  const actor = await requireErpActor();
  if (!actor.permissions.has("hr.employee.read")) {
    return {
      employees: [],
      today: new Date().toISOString().slice(0, 10),
      lookups: { departments: [], positions: [] },
      permissions: { canRead: false, canManage: false, canExport: false },
    };
  }
  const [employees, lookups] = await Promise.all([
    getPrisma().hrEmployee.findMany({ include: { teacher: true }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: 500 }),
    getPrisma().hrLookupOption.findMany({ where: { isActive: true }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
  ]);
  const employeeRows: HrEmployeeRow[] = employees.map((employee) => ({
    id: employee.id,
    staffType: employee.staffType,
    teacherId: employee.teacherId ?? "",
    teacherCapacity: employee.teacher?.capacity ?? 0,
    fullName: employee.fullName,
    profilePhotoUrl: employee.profilePhotoUrl ?? "",
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    address: employee.address ?? "",
    department: normalizeReservedLookup(
      employee.department,
      employee.staffType === "TEACHER" ? "Tədris" : "Ümumi",
    ),
    position: normalizeReservedLookup(
      employee.position,
      employee.staffType === "TEACHER" ? "Müəllim" : "Əməkdaş",
    ),
    hireDate: employee.hireDate.toISOString().slice(0, 10),
    status: employee.status,
    contractType: employee.contractType,
    salaryMode: employee.salaryMode === "PERCENT" ? "PERCENT" : "STATIC",
    salaryAmount: Number(employee.salaryAmount),
    salaryPercent: Number(employee.salaryPercent ?? 0),
    updatedAt: employee.updatedAt.toISOString(),
  }));

  return {
    today: new Date().toISOString().slice(0, 10),
    employees: employeeRows,
    lookups: {
      departments: [...new Set([...lookups.filter((item) => item.kind === "DEPARTMENT" && item.name !== "__new").map((item) => item.name), ...employeeRows.map((item) => item.department)])].toSorted((a, b) => a.localeCompare(b, "az")),
      positions: [...new Set([...lookups.filter((item) => item.kind === "POSITION" && item.name !== "__new").map((item) => item.name), ...employeeRows.map((item) => item.position)])].toSorted((a, b) => a.localeCompare(b, "az")),
    },
    permissions: {
      canRead: true,
      canManage: actor.permissions.has("hr.employee.manage"),
      canExport: actor.permissions.has("report.export"),
    },
  };
}

function normalizeReservedLookup(value: string, fallback: string) {
  return value === "__new" ? fallback : value;
}
