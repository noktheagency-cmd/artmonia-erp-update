"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { KnowledgeContentStatus, type Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import {
  knowledgeDocumentToPlainText,
  parseKnowledgeDocument,
} from "@/modules/about/knowledge-document";
import type { CompanyKnowledgeData } from "@/modules/about/knowledge-types";
import { COMPANY_KNOWLEDGE_KEY, getCompanyKnowledgeData } from "@/modules/about/queries";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";
import { isPrivilegedActor, requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

type MutationResult = {
  data: CompanyKnowledgeData;
  selectedCategoryId?: string;
  selectedArticleId?: string;
};

const idSchema = z.string().uuid();
const statusSchema = z.nativeEnum(KnowledgeContentStatus);
const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(2).max(120),
  status: statusSchema,
});
const articleSchema = z.object({
  id: z.string().uuid().optional(),
  categoryId: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  content: z.string().min(1).max(300_000),
  status: statusSchema,
});
const moveSchema = z.object({
  id: z.string().uuid(),
  direction: z.enum(["up", "down"]),
});

async function createCategoryActionImpl(formData: FormData): Promise<MutationResult> {
  const actor = await requireKnowledgeAdmin();
  const parsed = categorySchema.omit({ id: true }).parse(readCategoryForm(formData));
  const prisma = getPrisma();
  const section = await requireCompanySection();
  const lastCategory = await prisma.knowledgeCategory.findFirst({
    where: { sectionId: section.id },
    orderBy: [{ position: "desc" }, { createdAt: "desc" }],
    select: { position: true },
  });
  const created = await prisma.$transaction(async (tx) => {
    const category = await tx.knowledgeCategory.create({
      data: {
        sectionId: section.id,
        name: parsed.name,
        status: parsed.status,
        position: (lastCategory?.position ?? -1) + 1,
        createdById: actor.id,
        updatedById: actor.id,
      },
      select: { id: true, name: true, status: true, position: true },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "knowledge_category.create",
      entityType: "knowledge_category",
      entityId: category.id,
      after: category,
    });
    return category;
  });

  return finishMutation({ selectedCategoryId: created.id });
}

async function updateCategoryActionImpl(formData: FormData): Promise<MutationResult> {
  const actor = await requireKnowledgeAdmin();
  const parsed = categorySchema.parse(readCategoryForm(formData));
  const current = await requireCompanyCategory(parsed.id!);
  await getPrisma().$transaction(async (tx) => {
    const updated = await tx.knowledgeCategory.update({
      where: { id: current.id },
      data: { name: parsed.name, status: parsed.status, updatedById: actor.id },
      select: { id: true, name: true, status: true, position: true },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "knowledge_category.update",
      entityType: "knowledge_category",
      entityId: current.id,
      before: current,
      after: updated,
    });
  });

  return finishMutation({ selectedCategoryId: current.id });
}

async function deleteCategoryActionImpl(categoryId: string): Promise<MutationResult> {
  const actor = await requireKnowledgeAdmin();
  const id = idSchema.parse(categoryId);
  const current = await requireCompanyCategory(id);
  await getPrisma().$transaction(async (tx) => {
    await tx.knowledgeCategory.delete({ where: { id } });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "knowledge_category.delete",
      entityType: "knowledge_category",
      entityId: id,
      before: current,
    });
  });

  return finishMutation();
}

async function moveCategoryActionImpl(categoryId: string, direction: "up" | "down"): Promise<MutationResult> {
  const actor = await requireKnowledgeAdmin();
  const parsed = moveSchema.parse({ id: categoryId, direction });
  const current = await requireCompanyCategory(parsed.id);
  const items = await getPrisma().knowledgeCategory.findMany({
    where: { sectionId: current.sectionId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const reordered = moveIds(items.map(({ id }) => id), parsed.id, parsed.direction);
  await persistCategoryOrder(reordered, actor.id);
  return finishMutation({ selectedCategoryId: parsed.id });
}

async function createArticleActionImpl(formData: FormData): Promise<MutationResult> {
  const actor = await requireKnowledgeAdmin();
  const parsed = articleSchema.omit({ id: true }).parse(readArticleForm(formData));
  const category = await requireCompanyCategory(parsed.categoryId);
  const document = parseKnowledgeDocument(parsed.content);
  const prisma = getPrisma();
  const lastArticle = await prisma.knowledgeArticle.findFirst({
    where: { categoryId: category.id },
    orderBy: [{ position: "desc" }, { createdAt: "desc" }],
    select: { position: true },
  });
  const created = await prisma.$transaction(async (tx) => {
    const article = await tx.knowledgeArticle.create({
      data: {
        categoryId: category.id,
        title: parsed.title,
        content: document as Prisma.InputJsonValue,
        plainText: knowledgeDocumentToPlainText(document),
        status: parsed.status,
        position: (lastArticle?.position ?? -1) + 1,
        createdById: actor.id,
        updatedById: actor.id,
      },
      select: { id: true, categoryId: true, title: true, status: true, position: true },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "knowledge_article.create",
      entityType: "knowledge_article",
      entityId: article.id,
      after: article,
    });
    return article;
  });

  return finishMutation({ selectedCategoryId: category.id, selectedArticleId: created.id });
}

async function updateArticleActionImpl(formData: FormData): Promise<MutationResult> {
  const actor = await requireKnowledgeAdmin();
  const parsed = articleSchema.parse(readArticleForm(formData));
  const current = await requireCompanyArticle(parsed.id!);
  await requireCompanyCategory(parsed.categoryId);
  const document = parseKnowledgeDocument(parsed.content);
  await getPrisma().$transaction(async (tx) => {
    const updated = await tx.knowledgeArticle.update({
      where: { id: current.id },
      data: {
        categoryId: parsed.categoryId,
        title: parsed.title,
        content: document as Prisma.InputJsonValue,
        plainText: knowledgeDocumentToPlainText(document),
        status: parsed.status,
        updatedById: actor.id,
      },
      select: { id: true, categoryId: true, title: true, status: true, position: true },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "knowledge_article.update",
      entityType: "knowledge_article",
      entityId: current.id,
      before: current,
      after: updated,
    });
  });

  return finishMutation({ selectedCategoryId: parsed.categoryId, selectedArticleId: current.id });
}

async function deleteArticleActionImpl(articleId: string): Promise<MutationResult> {
  const actor = await requireKnowledgeAdmin();
  const id = idSchema.parse(articleId);
  const current = await requireCompanyArticle(id);
  await getPrisma().$transaction(async (tx) => {
    await tx.knowledgeArticle.delete({ where: { id } });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "knowledge_article.delete",
      entityType: "knowledge_article",
      entityId: id,
      before: current,
    });
  });

  return finishMutation({ selectedCategoryId: current.categoryId });
}

async function moveArticleActionImpl(articleId: string, direction: "up" | "down"): Promise<MutationResult> {
  const actor = await requireKnowledgeAdmin();
  const parsed = moveSchema.parse({ id: articleId, direction });
  const current = await requireCompanyArticle(parsed.id);
  const items = await getPrisma().knowledgeArticle.findMany({
    where: { categoryId: current.categoryId },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const reordered = moveIds(items.map(({ id }) => id), parsed.id, parsed.direction);
  await persistArticleOrder(reordered, actor.id);
  return finishMutation({ selectedCategoryId: current.categoryId, selectedArticleId: current.id });
}

function readCategoryForm(formData: FormData) {
  return { id: formData.get("id") || undefined, name: formData.get("name"), status: formData.get("status") };
}

function readArticleForm(formData: FormData) {
  return {
    id: formData.get("id") || undefined,
    categoryId: formData.get("categoryId"),
    title: formData.get("title"),
    content: formData.get("content"),
    status: formData.get("status"),
  };
}

async function requireKnowledgeAdmin() {
  const actor = await requireMutationActor();
  if (!isPrivilegedActor(actor)) {
    throw new PublicActionError("Bu məzmunu yalnız səlahiyyətli admin dəyişə bilər.", "FORBIDDEN");
  }
  return actor;
}

async function requireCompanySection() {
  const section = await getPrisma().knowledgeSection.findUnique({
    where: { key: COMPANY_KNOWLEDGE_KEY },
    select: { id: true },
  });
  if (!section) throw new PublicActionError("“Biz Kimik” bölməsinin data strukturu tapılmadı.", "CONFIGURATION");
  return section;
}

async function requireCompanyCategory(id: string) {
  const category = await getPrisma().knowledgeCategory.findFirst({
    where: { id, section: { key: COMPANY_KNOWLEDGE_KEY } },
    select: { id: true, sectionId: true, name: true, status: true, position: true },
  });
  if (!category) throw new PublicActionError("Kateqoriya tapılmadı.", "NOT_FOUND");
  return category;
}

async function requireCompanyArticle(id: string) {
  const article = await getPrisma().knowledgeArticle.findFirst({
    where: { id, category: { section: { key: COMPANY_KNOWLEDGE_KEY } } },
    select: { id: true, categoryId: true, title: true, status: true, position: true },
  });
  if (!article) throw new PublicActionError("Məqalə tapılmadı.", "NOT_FOUND");
  return article;
}

function moveIds(ids: string[], id: string, direction: "up" | "down") {
  const index = ids.indexOf(id);
  if (index < 0) throw new PublicActionError("Sıralanacaq məlumat tapılmadı.", "NOT_FOUND");
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= ids.length) return ids;
  const reordered = [...ids];
  [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
  return reordered;
}

async function persistCategoryOrder(ids: string[], actorId: string) {
  await getPrisma().$transaction(async (tx) => {
    for (const [position, id] of ids.entries()) {
      await tx.knowledgeCategory.update({ where: { id }, data: { position, updatedById: actorId } });
    }
    await writeAuditLog(tx, {
      actorUserId: actorId,
      action: "knowledge_category.reorder",
      entityType: "knowledge_category",
      after: { ids },
    });
  });
}

async function persistArticleOrder(ids: string[], actorId: string) {
  await getPrisma().$transaction(async (tx) => {
    for (const [position, id] of ids.entries()) {
      await tx.knowledgeArticle.update({ where: { id }, data: { position, updatedById: actorId } });
    }
    await writeAuditLog(tx, {
      actorUserId: actorId,
      action: "knowledge_article.reorder",
      entityType: "knowledge_article",
      after: { ids },
    });
  });
}

async function finishMutation(selection: Omit<MutationResult, "data"> = {}): Promise<MutationResult> {
  revalidatePath("/about");
  return { data: await getCompanyKnowledgeData(true), ...selection };
}

export const createKnowledgeCategoryAction = safeServerAction(createCategoryActionImpl, "Kateqoriya yaradılmadı.");
export const updateKnowledgeCategoryAction = safeServerAction(updateCategoryActionImpl, "Kateqoriya yenilənmədi.");
export const deleteKnowledgeCategoryAction = safeServerAction(deleteCategoryActionImpl, "Kateqoriya silinmədi.");
export const moveKnowledgeCategoryAction = safeServerAction(moveCategoryActionImpl, "Kateqoriya sıralanmadı.");
export const createKnowledgeArticleAction = safeServerAction(createArticleActionImpl, "Məqalə yaradılmadı.");
export const updateKnowledgeArticleAction = safeServerAction(updateArticleActionImpl, "Məqalə yenilənmədi.");
export const deleteKnowledgeArticleAction = safeServerAction(deleteArticleActionImpl, "Məqalə silinmədi.");
export const moveKnowledgeArticleAction = safeServerAction(moveArticleActionImpl, "Məqalə sıralanmadı.");
