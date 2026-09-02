import "server-only";

import type { KnowledgeContentStatus, Prisma } from "@/generated/prisma/client";
import { parseKnowledgeDocument } from "@/modules/about/knowledge-document";
import type { CompanyKnowledgeData } from "@/modules/about/knowledge-types";
import { getPrisma } from "@/server/db/prisma";

export const COMPANY_KNOWLEDGE_KEY = "company";

export async function getCompanyKnowledgeData(includeDrafts: boolean, actorUserId?: string): Promise<CompanyKnowledgeData> {
  try {
    const prisma = getPrisma();
    const [section, employeeOptions] = await Promise.all([prisma.knowledgeSection.findUnique({
      where: { key: COMPANY_KNOWLEDGE_KEY },
      select: {
        id: true,
        categories: {
          where: includeDrafts ? undefined : {
            status: "PUBLISHED",
            OR: [
              { audiences: { none: {} } },
              ...(actorUserId ? [{ audiences: { some: { employee: { userId: actorUserId } } } }] : []),
            ],
          },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            name: true,
            position: true,
            status: true,
            audiences: { select: { employeeId: true } },
            articles: {
              where: includeDrafts ? undefined : { status: "PUBLISHED" },
              orderBy: [{ position: "asc" }, { createdAt: "asc" }],
              select: {
                id: true,
                categoryId: true,
                title: true,
                content: true,
                plainText: true,
                position: true,
                status: true,
                updatedAt: true,
                updatedBy: { select: { fullName: true } },
              },
            },
          },
        },
      },
    }), includeDrafts ? prisma.hrEmployee.findMany({
      where: { archivedAt: null, status: { in: ["ACTIVE", "PROBATION"] } },
      select: { id: true, fullName: true, department: true, position: true },
      orderBy: [{ department: "asc" }, { fullName: "asc" }],
    }) : Promise.resolve([])]);

    if (!section) return { sectionId: null, categories: [], employeeOptions: [] };

    return {
      sectionId: section.id,
      categories: section.categories.map((category) => ({
        ...category,
        audienceEmployeeIds: category.audiences.map((audience) => audience.employeeId),
        audiences: undefined,
        status: category.status as KnowledgeContentStatus,
        articles: category.articles.map((article) => ({
          ...article,
          content: parseStoredDocument(article.content),
          status: article.status as KnowledgeContentStatus,
          updatedAt: article.updatedAt.toISOString(),
          updatedBy: article.updatedBy?.fullName ?? null,
        })),
      })),
      employeeOptions: employeeOptions.map((employee) => ({
        id: employee.id,
        name: employee.fullName,
        department: employee.department,
        position: employee.position,
      })),
    };
  } catch (error) {
    if (process.env.NODE_ENV !== "production" && getErrorCode(error) === "P2021") {
      return { sectionId: null, categories: [], employeeOptions: [] };
    }
    throw error;
  }
}

function parseStoredDocument(content: Prisma.JsonValue) {
  try {
    return parseKnowledgeDocument(JSON.stringify(content));
  } catch {
    return { type: "doc" as const, content: [{ type: "paragraph" }] };
  }
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const value = (error as { code?: unknown }).code;
  return typeof value === "string" ? value : undefined;
}
