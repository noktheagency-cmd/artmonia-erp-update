"use client";

import type { CorporateCustomerData } from "@/modules/hr/corporate-customer-data";
import type { HrEmployeeRow } from "@/modules/hr/employee-data";
import type { TeacherDirectoryData } from "@/modules/hr/teacher-directory-data";
import { downloadProfessionalExcel } from "@/modules/exports/excel-download";
import type { ExcelExportDefinition } from "@/modules/exports/excel-workbook";

type HrExportView = "overview" | "employees" | "archive" | "teachers" | "corporate";

type HrExcelExportInput = {
  view: HrExportView;
  employees: HrEmployeeRow[];
  teachers: TeacherDirectoryData["teachers"];
  corporateData: CorporateCustomerData;
};

const employeeStatusLabels: Record<HrEmployeeRow["status"], string> = {
  ACTIVE: "Aktiv",
  PROBATION: "Sınaq müddəti",
  ON_LEAVE: "Məzuniyyətdə",
  INACTIVE: "Deaktiv",
};

const corporateStatusLabels: Record<CorporateCustomerData["customers"][number]["status"], string> = {
  ACTIVE: "Aktiv",
  POTENTIAL: "Potensial",
  PAUSED: "Dayandırılıb",
  INACTIVE: "Deaktiv",
};

export async function exportHrExcel(input: HrExcelExportInput) {
  const exportConfig = buildHrExport(input);
  await downloadProfessionalExcel(exportConfig.definition, exportConfig.filename);
}

function buildHrExport(input: HrExcelExportInput): { definition: ExcelExportDefinition; filename: string } {
  if (input.view === "teachers") return buildTeacherExport(input.teachers);
  if (input.view === "corporate") return buildCorporateExport(input.corporateData);
  return buildEmployeeExport(input.employees, input.view);
}

function buildEmployeeExport(employees: HrEmployeeRow[], view: "overview" | "employees" | "archive") {
  const isArchive = view === "archive";
  return {
    filename: isArchive ? "hr-komanda-arxivi.xlsx" : "hr-emekdaslar.xlsx",
    definition: {
      title: view === "overview" ? "Artmonia · Əməkdaş icmalı" : isArchive ? "Artmonia · Komanda arxivi" : "Artmonia · Əməkdaşlar",
      worksheetName: isArchive ? "Komanda arxivi" : "Əməkdaşlar",
      summary: [
        `Əhatə: ${view === "overview" ? "HR icmalı" : isArchive ? "İşdən ayrılmış əməkdaşlar" : "Mövcud filtrlər"}`,
        `Nəticə sayı: ${employees.length}`,
      ],
      columns: [
        { key: "fullName", label: "Ad soyad", width: 24 },
        { key: "position", label: "Vəzifə", width: 20 },
        { key: "department", label: "Departament", width: 18 },
        { key: "status", label: "Status", kind: "status", width: 17 },
        { key: "phone", label: "Telefon", width: 18 },
        { key: "address", label: "Ünvan", width: 34, wrap: true },
        ...(isArchive ? [
          { key: "employmentEndedAt", label: "İşdən çıxma tarixi", kind: "date" as const, width: 18 },
          { key: "exitReason", label: "İşdən çıxma səbəbi", width: 38, wrap: true },
          { key: "archivedByName", label: "Arxivləşdirən", width: 22 },
        ] : []),
      ],
      rows: employees.map((employee) => ({
        fullName: employee.fullName,
        position: employee.position,
        department: employee.department,
        status: employeeStatusLabels[employee.status],
        phone: employee.phone,
        address: employee.address,
        employmentEndedAt: employee.employmentEndedAt,
        exitReason: employee.exitReason,
        archivedByName: employee.archivedByName,
      })),
    } satisfies ExcelExportDefinition,
  };
}

function buildTeacherExport(teachers: TeacherDirectoryData["teachers"]) {
  return {
    filename: "hr-muellimler.xlsx",
    definition: {
      title: "Artmonia · Müəllim göstəriciləri",
      worksheetName: "Müəllimlər",
      summary: [
        "Əhatə: Mövcud axtarış nəticəsi",
        `Nəticə sayı: ${teachers.length}`,
        `Aktiv tələbə sayı: ${teachers.reduce((total, teacher) => total + teacher.activeStudentCount, 0)}`,
      ],
      columns: [
        { key: "fullName", label: "Müəllim", width: 24 },
        { key: "attendedLessons", label: "İştirak etdiyi dərs", kind: "number", width: 18 },
        { key: "plannedLessons", label: "Planlanan dərs", kind: "number", width: 17 },
        { key: "eligibleRevenue", label: "Ödəniş bazası", kind: "currency", width: 18 },
        { key: "paidRevenue", label: "Toplanan ödəniş", kind: "currency", width: 18 },
        { key: "salaryModel", label: "Maaş modeli", kind: "status", width: 16 },
        { key: "salaryPercent", label: "Maaş faizi", kind: "percentage", width: 14 },
        { key: "estimatedSalary", label: "Hesablanan maaş", kind: "currency", width: 20 },
        { key: "activeStudentCount", label: "Aktiv tələbə", kind: "number", width: 15 },
        { key: "capacity", label: "Tutum", kind: "number", width: 12 },
        { key: "utilization", label: "Tutum istifadəsi", kind: "percentage", width: 17 },
        { key: "status", label: "Status", kind: "status", width: 14 },
      ],
      rows: teachers.map((teacher) => ({
        fullName: teacher.fullName,
        attendedLessons: teacher.attendedLessons,
        plannedLessons: teacher.plannedLessons,
        eligibleRevenue: teacher.eligibleRevenue,
        paidRevenue: teacher.paidRevenue,
        salaryModel: teacher.salaryMode === "STATIC" ? "Statik maaş" : "Faizli maaş",
        salaryPercent: teacher.salaryMode === "PERCENT" ? teacher.salaryPercent / 100 : null,
        estimatedSalary: teacher.estimatedSalary,
        activeStudentCount: teacher.activeStudentCount,
        capacity: teacher.capacity,
        utilization: teacher.utilization / 100,
        status: teacher.isActive ? "Aktiv" : "Passiv",
      })),
    } satisfies ExcelExportDefinition,
  };
}

function buildCorporateExport(data: CorporateCustomerData) {
  return {
    filename: "hr-korporativ-musteriler.xlsx",
    definition: {
      title: "Artmonia · Korporativ müştərilər",
      worksheetName: "Korporativ müştərilər",
      summary: [
        `Şirkət sayı: ${data.customers.length}`,
        `Aktiv şirkət: ${data.stats.activeCustomers}`,
        `Aylıq büdcə: ${data.stats.monthlyBudget.toLocaleString("az-AZ")} ₼`,
        `Müqavilə dəyəri: ${data.stats.contractValue.toLocaleString("az-AZ")} ₼`,
      ],
      columns: [
        { key: "name", label: "Şirkət", width: 26 },
        { key: "taxId", label: "VÖEN", width: 16 },
        { key: "status", label: "Status", kind: "status", width: 16 },
        { key: "monthlyBudget", label: "Aylıq büdcə", kind: "currency", width: 18 },
        { key: "contractValue", label: "Müqavilə dəyəri", kind: "currency", width: 20 },
        { key: "primaryContact", label: "Əsas əlaqə", width: 23 },
        { key: "phone", label: "Telefon", width: 18 },
        { key: "email", label: "E-poçt", width: 28 },
      ],
      rows: data.customers.map((customer) => {
        const contact = customer.contacts.find((item) => item.isPrimary) ?? customer.contacts[0];
        return {
          name: customer.name,
          taxId: customer.taxId,
          status: corporateStatusLabels[customer.status],
          monthlyBudget: customer.monthlyBudget,
          contractValue: customer.contractValue,
          primaryContact: contact?.fullName ?? "",
          phone: contact?.phone ?? "",
          email: contact?.email ?? "",
        };
      }),
    } satisfies ExcelExportDefinition,
  };
}
