import type { Prisma } from "@/generated/prisma/client";

export function categoryAudienceWhere(userId?: string): Prisma.KnowledgeCategoryWhereInput {
  return { OR: [
    { audiences: { none: {} } },
    ...(userId ? [{ audiences: { some: { employee: { userId } } } }] : []),
  ] };
}

export function articleVisibilityWhere(userId?: string): Prisma.KnowledgeArticleWhereInput {
  return {
    status: "PUBLISHED",
    OR: [
      { inheritAudience: true, category: categoryAudienceWhere(userId) },
      ...(userId ? [{ inheritAudience: false, audiences: { some: { employee: { userId } } } }] : []),
    ],
  };
}

export function categoryVisibilityWhere(userId?: string): Prisma.KnowledgeCategoryWhereInput {
  return { status: "PUBLISHED", OR: [categoryAudienceWhere(userId), { articles: { some: articleVisibilityWhere(userId) } }] };
}
