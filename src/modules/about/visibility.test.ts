import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { articleVisibilityWhere, categoryVisibilityWhere } from "./visibility";

test("article audiences override category selection without exposing sibling articles or drafts", { skip: !process.env.RUN_DATABASE_TESTS }, async () => {
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const rollback = new Error("ROLLBACK_TEST_FIXTURES");
  try {
    await prisma.$transaction(async (tx) => {
      const employees = await tx.hrEmployee.findMany({ where: { userId: { not: null } }, take: 2, select: { id: true, userId: true } });
      assert.equal(employees.length, 2);
      const [first, second] = employees;
      const section = await tx.knowledgeSection.create({ data: { key: randomUUID(), name: "ACL test", type: "COMPANY" } });
      const category = await tx.knowledgeCategory.create({ data: { sectionId: section.id, name: "Restricted", status: "PUBLISHED", audiences: { create: { employeeId: first.id } } } });
      const inherited = await tx.knowledgeArticle.create({ data: { categoryId: category.id, title: "Inherited", content: {}, status: "PUBLISHED" } });
      const selected = await tx.knowledgeArticle.create({ data: { categoryId: category.id, title: "Selected", content: {}, status: "PUBLISHED", inheritAudience: false, audiences: { create: { employeeId: second.id } } } });
      await tx.knowledgeArticle.create({ data: { categoryId: category.id, title: "Draft", content: {}, status: "DRAFT", inheritAudience: false, audiences: { create: { employeeId: second.id } } } });
      const visible = async (userId?: string) => tx.knowledgeCategory.findMany({ where: { id: category.id, ...categoryVisibilityWhere(userId) }, select: { articles: { where: articleVisibilityWhere(userId), select: { id: true } } } });
      assert.deepEqual((await visible(first.userId!))[0].articles.map((row) => row.id), [inherited.id]);
      assert.deepEqual((await visible(second.userId!))[0].articles.map((row) => row.id), [selected.id]);
      assert.equal((await visible()).length, 0);
      await tx.knowledgeArticleAudience.deleteMany({ where: { articleId: selected.id } });
      assert.equal((await visible(second.userId!)).length, 0, "removing last selected employee must not make rule public");
      await tx.knowledgeCategory.update({ where: { id: category.id }, data: { status: "DRAFT" } });
      assert.equal((await visible(first.userId!)).length, 0);
      throw rollback;
    }, { timeout: 20000 });
  } catch (error) { if (error !== rollback) throw error; }
  finally { await prisma.$disconnect(); }
});
