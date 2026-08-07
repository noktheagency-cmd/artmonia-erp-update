import { getCrmData } from "@/modules/crm/queries";
import { getFinanceData } from "@/modules/finance/queries";
import {
  getExportDataset,
  type ExportRequest,
} from "@/modules/exports/export-config";
import type { PreparedExport } from "@/modules/exports/export-files";
import { getStudentListData } from "@/modules/students/queries";
import { getPrisma } from "@/server/db/prisma";
import type { ErpActor } from "@/server/auth/actor";

const MAX_EXPORT_ROWS = { xlsx: 10_000, csv: 10_000, pdf: 2_000 } as const;

export async function prepareExport(request: ExportRequest): Promise<PreparedExport> {
  const dataset = getExportDataset(request.module, request.dataset);
  if (!dataset) throw new Error("Seçilmiş ixrac məlumat dəsti mövcud deyil.");

  const fields = dataset.fields.filter((field) => request.fields.includes(field.key));
  if (fields.length !== request.fields.length || fields.length === 0) {
    throw new Error("Seçilmiş sütunlar bu hesabat üçün uyğun deyil.");
  }

  const report = await buildReport(request);
  const limit = MAX_EXPORT_ROWS[request.format];
  if (report.rows.length > limit) {
    throw new Error(
      `${request.format.toUpperCase()} ixracı ən çox ${limit.toLocaleString("az-AZ")} qeyd dəstəkləyir. Filtrləri daraldın.`
    );
  }

  return {
    title: `Artmonia · ${dataset.label}`,
    fields,
    rows: report.rows,
    summary: request.includeSummary ? report.summary : [],
  };
}

export async function auditExport(actor: ErpActor, request: ExportRequest, rowCount: number) {
  await getPrisma().dataExport.create({
    data: {
      exportType: `${request.module}:${request.dataset}:${request.format}`,
      filtersJson: {
        scope: request.scope,
        filters: request.filters,
        fields: request.fields,
        includeSummary: request.includeSummary,
      },
      rowCount,
      requestedById: actor.id,
    },
  });
}

async function buildReport(request: ExportRequest): Promise<Pick<PreparedExport, "rows" | "summary">> {
  switch (request.module) {
    case "crm":
      return buildCrmReport(request);
    case "students":
      return buildStudentReport(request);
    case "finance":
      return buildFinanceReport(request);
  }
}

async function buildCrmReport(request: ExportRequest) {
  const filters = request.scope === "all" ? {} : request.filters;
  const data = await getCrmData(filters);
  return {
    rows: data.leads.map((lead) => ({
      name: lead.name,
      phone: lead.phone,
      program: lead.program,
      source: lead.source,
      stage: lead.stageLabel,
      trialLessonCount: lead.trialLessonCount || "-",
      priority: lead.priorityLabel,
      nextAction: lead.nextActionTypeLabel,
      nextFollowUp: lead.nextFollowUpAt,
      manager: lead.manager,
      createdAt: lead.createdAt,
      note: lead.latestNote || "Qeyd yoxdur",
      convertedStudent: lead.detail.convertedStudentCode || "-",
      history: joinDetails(lead.detail.timeline.map((item) => `${item.date}: ${item.label} — ${item.reason}`)),
    })),
    summary: [
      `Mənbə: Follow-up`,
      `Əhatə: ${request.scope === "all" ? "Bütün icazəli müraciətlər" : "Mövcud filtrlər"}`,
      `Nəticə sayı: ${data.leads.length}`,
      ...filterSummary(request.scope, request.filters),
    ],
  };
}

async function buildStudentReport(request: ExportRequest) {
  const filters = request.scope === "all" ? {} : request.filters;
  const data = await getStudentListData(filters);
  return {
    rows: data.students.map((student) => ({
      code: student.code,
      name: student.name,
      phone: student.phone,
      program: student.program,
      teacher: student.teacher,
      lifecycle: student.lifecycleStatus,
      paymentStatus: student.paymentStatus,
      balance: student.balance,
      dueDate: student.dueDate,
      manager: student.detail.manager,
      registeredAt: student.detail.registeredAt,
      billing: student.detail.billingPaused,
      notes: student.detail.notes,
      invoices: joinDetails(student.detail.invoices.map((invoice) => `${invoice.period}: ${invoice.amount}, qalıq ${invoice.balance} (${invoice.status})`)),
      payments: joinDetails(student.detail.payments.map((payment) => `${payment.paidAt}: ${payment.amount} (${payment.method})`)),
      timeline: joinDetails(student.detail.timeline.map((item) => `${item.date}: ${item.label} — ${item.reason}`)),
    })),
    summary: [
      "Mənbə: Tələbələr",
      `Əhatə: ${request.scope === "all" ? "Bütün icazəli tələbələr" : "Mövcud filtrlər"}`,
      `Nəticə sayı: ${data.students.length}`,
      ...filterSummary(request.scope, request.filters),
    ],
  };
}

async function buildFinanceReport(request: ExportRequest) {
  const filters = request.scope === "all" ? { type: request.dataset } : { ...request.filters, type: request.dataset };
  const data = await getFinanceData(filters);
  const report = {
    payments: {
      rows: data.payments.map((payment) => ({
        student: payment.studentName,
        studentCode: payment.studentCode,
        amount: payment.amount,
        paidAt: payment.paidAt,
        paymentMonth: payment.paymentMonth,
        method: payment.method,
        payer: payment.payerName || "-",
        receipt: payment.receipt,
        note: payment.note,
      })),
      label: "Ödənişlər",
    },
    expenses: {
      rows: data.expenses.map((expense) => ({
        category: expense.category,
        amount: expense.amount,
        expenseDate: expense.expenseDate,
        method: expense.method,
        vendor: expense.vendor,
        staff: expense.staffName,
        salaryFormula: expense.salaryFormula,
        receipt: expense.receipt,
        description: expense.description,
      })),
      label: "Xərclər",
    },
    debts: {
      rows: data.debtors.map((debtor) => ({
        student: debtor.studentName,
        studentCode: debtor.studentCode,
        phone: debtor.phone,
        program: debtor.program,
        teacher: debtor.teacher,
        balance: debtor.balance,
        dueDate: debtor.nextDueDate,
        overdueDays: debtor.overdueDays,
      })),
      label: "Alacaqlar",
    },
    payroll: {
      rows: data.payrollItems.map((expense) => ({
        staff: expense.staffName,
        category: expense.category,
        amount: expense.amount,
        expenseDate: expense.expenseDate,
        method: expense.method,
        salaryFormula: expense.salaryFormula,
        receipt: expense.receipt,
        description: expense.description,
      })),
      label: "Əməkhaqqı",
    },
  }[request.dataset];

  if (!report) throw new Error("Maliyyə məlumat dəsti mövcud deyil.");
  return {
    rows: report.rows,
    summary: [
      `Mənbə: Maliyyə / ${report.label}`,
      `Əhatə: ${request.scope === "all" ? "Bütün icazəli qeydlər" : "Mövcud filtrlər"}`,
      `Nəticə sayı: ${report.rows.length}`,
      ...filterSummary(request.scope, request.filters),
    ],
  };
}

function joinDetails(values: string[]) {
  return values.filter(Boolean).join(" · ") || "-";
}

function filterSummary(scope: ExportRequest["scope"], filters: Record<string, string>) {
  if (scope === "all") return [];
  const active = Object.entries(filters).filter(([, value]) => value && value !== "all" && value !== "overview");
  return active.length > 0
    ? [`Aktiv filtr: ${active.map(([key, value]) => `${key}: ${value}`).join(" · ")}`]
    : ["Aktiv filtr: yoxdur"];
}
