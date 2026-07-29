import "server-only";

import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import {
  EnrollmentStatus,
  InvoiceStatus,
  LeadPriority,
  LeadStage,
  MarketingCampaignStatus,
  StudentLifecycleStatus,
  TaskStatus,
  WorkshopEventStatus,
  type Prisma,
} from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";

type McpActor = {
  id: string;
  ipAddress: string | null;
  userAgent: string | null;
};

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const pageSchema = {
  page: z.number().int().min(1).max(10_000).default(1),
  limit: z.number().int().min(1).max(50).default(20),
};

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format");

function asNumber(value: Prisma.Decimal | null | undefined) {
  return value ? Number(value) : 0;
}

function jsonResult(data: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

function getDateRange(from?: string, to?: string) {
  const end = to ? new Date(`${to}T23:59:59.999Z`) : new Date();
  const start = from
    ? new Date(`${from}T00:00:00.000Z`)
    : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime()) ||
    start > end
  ) {
    throw new Error("Invalid date range");
  }

  const days = (end.getTime() - start.getTime()) / 86_400_000;
  if (days > 366) {
    throw new Error("Date range cannot exceed 366 days");
  }

  return { start, end };
}

function compactAuditJson(value: Prisma.JsonValue | null) {
  if (value === null) return null;
  const serialized = JSON.stringify(value);
  if (serialized.length <= 5_000) return value;
  return { truncated: true, preview: serialized.slice(0, 5_000) };
}

async function audited<T>(
  actor: McpActor,
  toolName: string,
  operation: () => Promise<T>,
) {
  const startedAt = Date.now();
  let status = "SUCCESS";

  try {
    return await operation();
  } catch (error) {
    status = "FAILED";
    throw error;
  } finally {
    await getPrisma().auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "MCP_READ",
        entityType: "MCP_TOOL",
        reason: toolName,
        ipAddress: actor.ipAddress,
        userAgent: actor.userAgent,
        afterJson: {
          toolName,
          status,
          durationMs: Date.now() - startedAt,
        },
      },
    });
  }
}

export function registerFounderTools(server: McpServer, actor: McpActor) {
  const prisma = getPrisma();

  server.registerTool(
    "erp_system_overview",
    {
      title: "ERP system overview",
      description:
        "Artmonia ERP üzrə tələbə, satış, müəllim, qrup, maliyyə, tapşırıq və workshop göstəricilərinin cari icmalı.",
      inputSchema: z.object({}),
      annotations: readOnlyAnnotations,
    },
    async () =>
      audited(actor, "erp_system_overview", async () => {
        const now = new Date();
        const [
          students,
          leads,
          teachers,
          employees,
          groups,
          workshops,
          openTasks,
          overdueTasks,
          payments,
          expenses,
          outstanding,
        ] = await Promise.all([
          prisma.student.groupBy({ by: ["lifecycleStatus"], _count: true }),
          prisma.lead.groupBy({ by: ["stage"], _count: true }),
          prisma.teacher.count({ where: { isActive: true } }),
          prisma.hrEmployee.count({ where: { status: "ACTIVE" } }),
          prisma.studentGroup.count({ where: { isActive: true } }),
          prisma.workshopEvent.count({
            where: { eventDate: { gte: now }, status: "SCHEDULED" },
          }),
          prisma.task.count({
            where: { status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] } },
          }),
          prisma.task.count({
            where: {
              status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] },
              dueAt: { lt: now },
            },
          }),
          prisma.payment.aggregate({ _sum: { amount: true } }),
          prisma.financeExpense.aggregate({
            where: { voidedAt: null },
            _sum: { amount: true },
          }),
          prisma.invoice.aggregate({
            where: {
              status: {
                in: [
                  InvoiceStatus.OPEN,
                  InvoiceStatus.PARTIAL,
                  InvoiceStatus.OVERDUE,
                ],
              },
              balanceDue: { gt: 0 },
            },
            _sum: { balanceDue: true },
          }),
        ]);

        return jsonResult({
          generatedAt: now.toISOString(),
          students: Object.fromEntries(
            students.map((row) => [row.lifecycleStatus, row._count]),
          ),
          leads: Object.fromEntries(leads.map((row) => [row.stage, row._count])),
          operations: {
            activeTeachers: teachers,
            activeEmployees: employees,
            activeGroups: groups,
            upcomingWorkshops: workshops,
            openTasks,
            overdueTasks,
          },
          financeAllTime: {
            payments: asNumber(payments._sum.amount),
            expenses: asNumber(expenses._sum.amount),
            outstandingBalance: asNumber(outstanding._sum.balanceDue),
            currency: "AZN",
          },
        });
      }),
  );

  server.registerTool(
    "erp_students_search",
    {
      title: "Search students",
      description:
        "Tələbələri ad, telefon, email, kod və statusla axtarır; təhsil, müəllim və borc xülasəsini qaytarır.",
      inputSchema: z.object({
        query: z.string().trim().max(100).optional(),
        status: z.enum(StudentLifecycleStatus).optional(),
        ...pageSchema,
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ query, status, page, limit }) =>
      audited(actor, "erp_students_search", async () => {
        const where: Prisma.StudentWhereInput = {
          ...(status ? { lifecycleStatus: status } : {}),
          ...(query
            ? {
                OR: [
                  { code: { contains: query, mode: "insensitive" } },
                  {
                    contact: {
                      fullName: { contains: query, mode: "insensitive" },
                    },
                  },
                  {
                    contact: {
                      phoneDisplay: { contains: query, mode: "insensitive" },
                    },
                  },
                  {
                    contact: {
                      email: { contains: query, mode: "insensitive" },
                    },
                  },
                ],
              }
            : {}),
        };
        const [total, rows] = await Promise.all([
          prisma.student.count({ where }),
          prisma.student.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { registeredAt: "desc" },
            select: {
              id: true,
              code: true,
              lifecycleStatus: true,
              registeredAt: true,
              billingPaused: true,
              contact: {
                select: {
                  fullName: true,
                  phoneDisplay: true,
                  email: true,
                },
              },
              manager: { select: { fullName: true } },
              enrollments: {
                where: { status: EnrollmentStatus.ACTIVE },
                select: {
                  program: { select: { name: true } },
                  teacher: { select: { fullName: true } },
                  monthlyFee: true,
                },
              },
              invoices: {
                where: { balanceDue: { gt: 0 } },
                select: { balanceDue: true },
              },
            },
          }),
        ]);

        return jsonResult({
          page,
          limit,
          total,
          items: rows.map((row) => ({
            ...row,
            enrollments: row.enrollments.map((enrollment) => ({
              program: enrollment.program.name,
              teacher: enrollment.teacher?.fullName ?? null,
              monthlyFee: asNumber(enrollment.monthlyFee),
            })),
            outstandingBalance: row.invoices.reduce(
              (sum, invoice) => sum + asNumber(invoice.balanceDue),
              0,
            ),
          })),
        });
      }),
  );

  server.registerTool(
    "erp_crm_leads_search",
    {
      title: "Search CRM leads",
      description:
        "CRM lead-lərini ad, əlaqə, mərhələ və prioritetlə axtarır, menecer və növbəti addımı göstərir.",
      inputSchema: z.object({
        query: z.string().trim().max(100).optional(),
        stage: z.enum(LeadStage).optional(),
        priority: z.enum(LeadPriority).optional(),
        ...pageSchema,
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ query, stage, priority, page, limit }) =>
      audited(actor, "erp_crm_leads_search", async () => {
        const where: Prisma.LeadWhereInput = {
          ...(stage ? { stage } : {}),
          ...(priority ? { priority } : {}),
          ...(query
            ? {
                OR: [
                  {
                    contact: {
                      fullName: { contains: query, mode: "insensitive" },
                    },
                  },
                  {
                    contact: {
                      phoneDisplay: { contains: query, mode: "insensitive" },
                    },
                  },
                  {
                    contact: {
                      email: { contains: query, mode: "insensitive" },
                    },
                  },
                ],
              }
            : {}),
        };
        const [total, items] = await Promise.all([
          prisma.lead.count({ where }),
          prisma.lead.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: [{ priority: "desc" }, { nextFollowUpAt: "asc" }],
            select: {
              id: true,
              stage: true,
              priority: true,
              source: true,
              nextFollowUpAt: true,
              nextActionType: true,
              lostReason: true,
              createdAt: true,
              contact: {
                select: {
                  fullName: true,
                  phoneDisplay: true,
                  email: true,
                },
              },
              manager: { select: { fullName: true } },
              programInterest: { select: { name: true } },
              campaign: { select: { name: true } },
            },
          }),
        ]);

        return jsonResult({ page, limit, total, items });
      }),
  );

  server.registerTool(
    "erp_finance_summary",
    {
      title: "Finance summary",
      description:
        "Seçilən tarix intervalında ödəniş, xərc, açıq borc və ən böyük borcluların maliyyə xülasəsini verir.",
      inputSchema: z.object({
        from: dateSchema.optional(),
        to: dateSchema.optional(),
        debtorLimit: z.number().int().min(1).max(25).default(10),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ from, to, debtorLimit }) =>
      audited(actor, "erp_finance_summary", async () => {
        const { start, end } = getDateRange(from, to);
        const [payments, expenses, invoices, debtors] = await Promise.all([
          prisma.payment.aggregate({
            where: { paidAt: { gte: start, lte: end } },
            _sum: { amount: true },
            _count: true,
          }),
          prisma.financeExpense.aggregate({
            where: {
              expenseDate: { gte: start, lte: end },
              voidedAt: null,
            },
            _sum: { amount: true },
            _count: true,
          }),
          prisma.invoice.aggregate({
            where: {
              issueDate: { gte: start, lte: end },
              status: { not: InvoiceStatus.VOID },
            },
            _sum: { amount: true, balanceDue: true },
            _count: true,
          }),
          prisma.invoice.groupBy({
            by: ["studentId"],
            where: { balanceDue: { gt: 0 }, status: { not: InvoiceStatus.VOID } },
            _sum: { balanceDue: true },
            orderBy: { _sum: { balanceDue: "desc" } },
            take: debtorLimit,
          }),
        ]);
        const students = await prisma.student.findMany({
          where: { id: { in: debtors.map((row) => row.studentId) } },
          select: {
            id: true,
            code: true,
            contact: { select: { fullName: true, phoneDisplay: true } },
          },
        });
        const studentsById = new Map(students.map((row) => [row.id, row]));

        return jsonResult({
          from: start.toISOString(),
          to: end.toISOString(),
          currency: "AZN",
          payments: { count: payments._count, amount: asNumber(payments._sum.amount) },
          expenses: { count: expenses._count, amount: asNumber(expenses._sum.amount) },
          invoices: {
            count: invoices._count,
            amount: asNumber(invoices._sum.amount),
            remainingFromIssued: asNumber(invoices._sum.balanceDue),
          },
          netCashFlow:
            asNumber(payments._sum.amount) - asNumber(expenses._sum.amount),
          largestDebtors: debtors.map((row) => ({
            student: studentsById.get(row.studentId) ?? { id: row.studentId },
            outstandingBalance: asNumber(row._sum.balanceDue),
          })),
        });
      }),
  );

  server.registerTool(
    "erp_tasks_search",
    {
      title: "Search tasks",
      description:
        "Tapşırıqları status, məsul şəxs və gecikmə vəziyyətinə görə axtarır.",
      inputSchema: z.object({
        status: z.enum(TaskStatus).optional(),
        ownerQuery: z.string().trim().max(100).optional(),
        overdueOnly: z.boolean().default(false),
        ...pageSchema,
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ status, ownerQuery, overdueOnly, page, limit }) =>
      audited(actor, "erp_tasks_search", async () => {
        const where: Prisma.TaskWhereInput = {
          ...(status ? { status } : {}),
          ...(ownerQuery
            ? {
                ownerUser: {
                  fullName: { contains: ownerQuery, mode: "insensitive" },
                },
              }
            : {}),
          ...(overdueOnly
            ? {
                status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] },
                dueAt: { lt: new Date() },
              }
            : {}),
        };
        const [total, items] = await Promise.all([
          prisma.task.count({ where }),
          prisma.task.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
            select: {
              id: true,
              title: true,
              description: true,
              type: true,
              entityType: true,
              entityId: true,
              status: true,
              dueAt: true,
              completedAt: true,
              createdAt: true,
              ownerUser: { select: { fullName: true, email: true } },
            },
          }),
        ]);
        return jsonResult({ page, limit, total, items });
      }),
  );

  server.registerTool(
    "erp_staff_directory",
    {
      title: "Staff directory",
      description:
        "Əməkdaş və müəllim profillərini şöbə, vəzifə və statusla birlikdə göstərir.",
      inputSchema: z.object({
        query: z.string().trim().max(100).optional(),
        activeOnly: z.boolean().default(true),
        ...pageSchema,
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ query, activeOnly, page, limit }) =>
      audited(actor, "erp_staff_directory", async () => {
        const where: Prisma.HrEmployeeWhereInput = {
          ...(activeOnly ? { status: "ACTIVE" } : {}),
          ...(query
            ? {
                OR: [
                  { fullName: { contains: query, mode: "insensitive" } },
                  { department: { contains: query, mode: "insensitive" } },
                  { position: { contains: query, mode: "insensitive" } },
                  { email: { contains: query, mode: "insensitive" } },
                ],
              }
            : {}),
        };
        const [total, items] = await Promise.all([
          prisma.hrEmployee.count({ where }),
          prisma.hrEmployee.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { fullName: "asc" },
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              department: true,
              position: true,
              staffType: true,
              hireDate: true,
              status: true,
              contractType: true,
              salaryMode: true,
              salaryAmount: true,
              salaryPercent: true,
            },
          }),
        ]);
        return jsonResult({
          page,
          limit,
          total,
          items: items.map((item) => ({
            ...item,
            salaryAmount: asNumber(item.salaryAmount),
            salaryPercent: item.salaryPercent ? Number(item.salaryPercent) : null,
          })),
        });
      }),
  );

  server.registerTool(
    "erp_groups_search",
    {
      title: "Search student groups",
      description:
        "Aktiv və arxiv qruplarını, tutumu, dərs cədvəlini, müəllimləri və cari üzv sayını göstərir.",
      inputSchema: z.object({
        query: z.string().trim().max(100).optional(),
        activeOnly: z.boolean().default(true),
        ...pageSchema,
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ query, activeOnly, page, limit }) =>
      audited(actor, "erp_groups_search", async () => {
        const where: Prisma.StudentGroupWhereInput = {
          ...(activeOnly ? { isActive: true } : {}),
          ...(query
            ? { code: { contains: query, mode: "insensitive" } }
            : {}),
        };
        const [total, items] = await Promise.all([
          prisma.studentGroup.count({ where }),
          prisma.studentGroup.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { code: "asc" },
            select: {
              id: true,
              code: true,
              capacity: true,
              isActive: true,
              archivedAt: true,
              schedules: {
                select: {
                  weekday: true,
                  startTime: true,
                  endTime: true,
                },
                orderBy: { weekday: "asc" },
              },
              memberships: {
                where: { endedAt: null },
                select: {
                  teacher: { select: { fullName: true } },
                },
              },
            },
          }),
        ]);

        return jsonResult({
          page,
          limit,
          total,
          items: items.map((item) => ({
            id: item.id,
            code: item.code,
            capacity: item.capacity,
            isActive: item.isActive,
            archivedAt: item.archivedAt,
            schedules: item.schedules,
            activeMemberCount: item.memberships.length,
            teachers: [
              ...new Set(
                item.memberships.map(
                  (membership) => membership.teacher.fullName,
                ),
              ),
            ],
          })),
        });
      }),
  );

  server.registerTool(
    "erp_workshops_search",
    {
      title: "Search workshops and events",
      description:
        "Workshop və tədbirləri tarix/status üzrə göstərir; iştirakçı, ödəniş, gəlir və xərc xülasəsini qaytarır.",
      inputSchema: z.object({
        query: z.string().trim().max(100).optional(),
        status: z.enum(WorkshopEventStatus).optional(),
        from: dateSchema.optional(),
        to: dateSchema.optional(),
        ...pageSchema,
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ query, status, from, to, page, limit }) =>
      audited(actor, "erp_workshops_search", async () => {
        const { start, end } = getDateRange(from, to);
        const where: Prisma.WorkshopEventWhereInput = {
          eventDate: { gte: start, lte: end },
          ...(status ? { status } : {}),
          ...(query
            ? {
                OR: [
                  { title: { contains: query, mode: "insensitive" } },
                  { category: { contains: query, mode: "insensitive" } },
                  { instructor: { contains: query, mode: "insensitive" } },
                ],
              }
            : {}),
        };
        const [total, items] = await Promise.all([
          prisma.workshopEvent.count({ where }),
          prisma.workshopEvent.findMany({
            where,
            skip: (page - 1) * limit,
            take: limit,
            orderBy: [{ eventDate: "desc" }, { startTime: "asc" }],
            select: {
              id: true,
              title: true,
              eventType: true,
              category: true,
              status: true,
              eventDate: true,
              startTime: true,
              durationMinutes: true,
              room: true,
              instructor: true,
              capacity: true,
              entryPrice: true,
              participants: {
                where: { cancelledAt: null },
                select: {
                  isPaid: true,
                  isGift: true,
                  amountPaid: true,
                },
              },
              payments: {
                where: { voidedAt: null },
                select: { amount: true },
              },
              expenses: {
                where: { voidedAt: null },
                select: { amount: true },
              },
            },
          }),
        ]);

        return jsonResult({
          page,
          limit,
          total,
          from: start.toISOString(),
          to: end.toISOString(),
          items: items.map((item) => {
            const revenue = item.payments.reduce(
              (sum, payment) => sum + asNumber(payment.amount),
              0,
            );
            const expenses = item.expenses.reduce(
              (sum, expense) => sum + asNumber(expense.amount),
              0,
            );
            return {
              ...item,
              entryPrice: asNumber(item.entryPrice),
              participants: {
                total: item.participants.length,
                paid: item.participants.filter((row) => row.isPaid).length,
                gift: item.participants.filter((row) => row.isGift).length,
              },
              finance: {
                revenue,
                expenses,
                net: revenue - expenses,
                currency: "AZN",
              },
            };
          }),
        });
      }),
  );

  server.registerTool(
    "erp_marketing_summary",
    {
      title: "Marketing performance summary",
      description:
        "Kampaniyaları və seçilən dövr üzrə reklam xərci, gəlir, lead, conversion, reach və click nəticələrini göstərir.",
      inputSchema: z.object({
        from: dateSchema.optional(),
        to: dateSchema.optional(),
        status: z.enum(MarketingCampaignStatus).optional(),
        limit: z.number().int().min(1).max(50).default(25),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ from, to, status, limit }) =>
      audited(actor, "erp_marketing_summary", async () => {
        const { start, end } = getDateRange(from, to);
        const campaigns = await prisma.marketingCampaign.findMany({
          where: {
            startsAt: { lte: end },
            OR: [{ endsAt: null }, { endsAt: { gte: start } }],
            ...(status ? { status } : {}),
          },
          take: limit,
          orderBy: { startsAt: "desc" },
          select: {
            id: true,
            name: true,
            channel: true,
            owner: true,
            objective: true,
            status: true,
            budget: true,
            startsAt: true,
            endsAt: true,
            metaSyncedAt: true,
            stats: {
              where: { recordedOn: { gte: start, lte: end } },
              select: {
                spend: true,
                revenue: true,
                leads: true,
                conversions: true,
                impressions: true,
                reach: true,
                clicks: true,
                conversations: true,
              },
            },
            _count: { select: { leads: true, students: true, contentItems: true } },
          },
        });

        const items = campaigns.map((campaign) => {
          const performance = campaign.stats.reduce(
            (totals, stat) => ({
              spend: totals.spend + asNumber(stat.spend),
              revenue: totals.revenue + asNumber(stat.revenue),
              leads: totals.leads + stat.leads,
              conversions: totals.conversions + stat.conversions,
              impressions: totals.impressions + stat.impressions,
              reach: totals.reach + stat.reach,
              clicks: totals.clicks + stat.clicks,
              conversations: totals.conversations + stat.conversations,
            }),
            {
              spend: 0,
              revenue: 0,
              leads: 0,
              conversions: 0,
              impressions: 0,
              reach: 0,
              clicks: 0,
              conversations: 0,
            },
          );

          return {
            id: campaign.id,
            name: campaign.name,
            channel: campaign.channel,
            owner: campaign.owner,
            objective: campaign.objective,
            status: campaign.status,
            budget: asNumber(campaign.budget),
            startsAt: campaign.startsAt,
            endsAt: campaign.endsAt,
            metaSyncedAt: campaign.metaSyncedAt,
            linkedRecords: campaign._count,
            performance: {
              ...performance,
              roiPercent:
                performance.spend > 0
                  ? ((performance.revenue - performance.spend) /
                      performance.spend) *
                    100
                  : null,
              currency: "AZN",
            },
          };
        });

        return jsonResult({
          from: start.toISOString(),
          to: end.toISOString(),
          count: items.length,
          items,
        });
      }),
  );

  server.registerTool(
    "erp_audit_log_search",
    {
      title: "Search ERP audit log",
      description:
        "ERP dəyişiklik və MCP oxu auditlərini tarix, əməl, obyekt tipi və icraçıya görə axtarır.",
      inputSchema: z.object({
        action: z.string().trim().max(100).optional(),
        entityType: z.string().trim().max(100).optional(),
        actorQuery: z.string().trim().max(100).optional(),
        from: dateSchema.optional(),
        to: dateSchema.optional(),
        limit: z.number().int().min(1).max(100).default(50),
      }),
      annotations: readOnlyAnnotations,
    },
    async ({ action, entityType, actorQuery, from, to, limit }) =>
      audited(actor, "erp_audit_log_search", async () => {
        const { start, end } = getDateRange(from, to);
        const items = await prisma.auditLog.findMany({
          where: {
            createdAt: { gte: start, lte: end },
            ...(action
              ? { action: { contains: action, mode: "insensitive" } }
              : {}),
            ...(entityType
              ? { entityType: { contains: entityType, mode: "insensitive" } }
              : {}),
            ...(actorQuery
              ? {
                  actor: {
                    OR: [
                      {
                        fullName: {
                          contains: actorQuery,
                          mode: "insensitive",
                        },
                      },
                      {
                        email: {
                          contains: actorQuery,
                          mode: "insensitive",
                        },
                      },
                    ],
                  },
                }
              : {}),
          },
          take: limit,
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            action: true,
            entityType: true,
            entityId: true,
            reason: true,
            beforeJson: true,
            afterJson: true,
            ipAddress: true,
            userAgent: true,
            createdAt: true,
            actor: { select: { fullName: true, email: true } },
          },
        });

        return jsonResult({
          from: start.toISOString(),
          to: end.toISOString(),
          count: items.length,
          items: items.map((item) => ({
            ...item,
            beforeJson: compactAuditJson(item.beforeJson),
            afterJson: compactAuditJson(item.afterJson),
          })),
        });
      }),
  );

  server.registerTool(
    "erp_data_quality_audit",
    {
      title: "Run ERP data quality audit",
      description:
        "ERP məlumatlarında əməliyyat risklərini yalnız oxuma sorğuları ilə aşkar edir: müəllimsiz qeydiyyat, aktiv proqramsız tələbə, borc, gecikmiş follow-up və tapşırıqlar.",
      inputSchema: z.object({}),
      annotations: readOnlyAnnotations,
    },
    async () =>
      audited(actor, "erp_data_quality_audit", async () => {
        const now = new Date();
        const [
          activeStudentsWithoutEnrollment,
          activeEnrollmentsWithoutTeacher,
          overdueInvoices,
          overdueInvoiceAmount,
          overdueLeadFollowUps,
          overdueTasks,
        ] = await Promise.all([
          prisma.student.count({
            where: {
              lifecycleStatus: StudentLifecycleStatus.ACTIVE,
              enrollments: { none: { status: EnrollmentStatus.ACTIVE } },
            },
          }),
          prisma.enrollment.count({
            where: { status: EnrollmentStatus.ACTIVE, teacherId: null },
          }),
          prisma.invoice.count({
            where: {
              dueDate: { lt: now },
              balanceDue: { gt: 0 },
              status: {
                in: [
                  InvoiceStatus.OPEN,
                  InvoiceStatus.PARTIAL,
                  InvoiceStatus.OVERDUE,
                ],
              },
            },
          }),
          prisma.invoice.aggregate({
            where: {
              dueDate: { lt: now },
              balanceDue: { gt: 0 },
              status: { not: InvoiceStatus.VOID },
            },
            _sum: { balanceDue: true },
          }),
          prisma.lead.count({
            where: {
              stage: {
                notIn: [LeadStage.REGISTERED, LeadStage.LOST],
              },
              nextFollowUpAt: { lt: now },
            },
          }),
          prisma.task.count({
            where: {
              status: { in: [TaskStatus.OPEN, TaskStatus.IN_PROGRESS] },
              dueAt: { lt: now },
            },
          }),
        ]);

        const checks = [
          {
            severity: "HIGH",
            code: "ACTIVE_STUDENT_WITHOUT_ACTIVE_ENROLLMENT",
            count: activeStudentsWithoutEnrollment,
          },
          {
            severity: "HIGH",
            code: "ACTIVE_ENROLLMENT_WITHOUT_TEACHER",
            count: activeEnrollmentsWithoutTeacher,
          },
          {
            severity: "HIGH",
            code: "OVERDUE_INVOICE",
            count: overdueInvoices,
            amount: asNumber(overdueInvoiceAmount._sum.balanceDue),
            currency: "AZN",
          },
          {
            severity: "MEDIUM",
            code: "OVERDUE_LEAD_FOLLOW_UP",
            count: overdueLeadFollowUps,
          },
          {
            severity: "MEDIUM",
            code: "OVERDUE_TASK",
            count: overdueTasks,
          },
        ];

        return jsonResult({
          generatedAt: now.toISOString(),
          overallStatus: checks.some(
            (check) => check.severity === "HIGH" && check.count > 0,
          )
            ? "ATTENTION_REQUIRED"
            : "OK",
          checks,
        });
      }),
  );
}
