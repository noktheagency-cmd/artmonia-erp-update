import { Prisma } from "@/generated/prisma/client";
import { escapeSearchLike, normalizeAzerbaijaniSearch } from "./search-text";

export function normalizedSearchSql(column: Prisma.Sql) {
  return Prisma.sql`translate(lower(coalesce(${column}, '')), ${"əğıöşüçƏĞIİÖŞÜÇ"}, ${"egiosucegiiosuc"})`;
}

/** Every name token must match; first/last name order and Azerbaijani keyboard variants may differ. */
export function nameSearchSql(column: Prisma.Sql, query: string) {
  const tokens = normalizeAzerbaijaniSearch(query).split(" ").filter(Boolean).slice(0, 12);
  if (!tokens.length) return Prisma.sql`false`;
  return Prisma.sql`(${Prisma.join(tokens.map(token =>
    Prisma.sql`${normalizedSearchSql(column)} like ${`%${escapeSearchLike(token)}%`}`,
  ), " AND ")})`;
}
