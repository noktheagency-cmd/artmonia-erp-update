import { Prisma } from "@/generated/prisma/client";
import type { CrmListDateFilter } from "./list-date-filter";

export function buildCrmListDateSql(filter: CrmListDateFilter) {
  if (!filter.active) return null;
  if (filter.error) return Prisma.sql`false`;
  const column = filter.field === "planned" ? Prisma.sql`l.next_follow_up_at` : Prisma.sql`l.created_at`;
  const conditions: Prisma.Sql[] = [filter.field === "planned" ? Prisma.sql`${column} is not null` : Prisma.sql`true`];
  if (filter.from) {
    conditions.push(Prisma.sql`${column} >= ${new Date(`${filter.from}T00:00:00+04:00`)}`);
  }
  if (filter.to) {
    const until = new Date(`${filter.to}T00:00:00+04:00`);
    until.setUTCDate(until.getUTCDate() + 1);
    conditions.push(Prisma.sql`${column} < ${until}`);
  }
  return Prisma.sql`(${Prisma.join(conditions, " AND ")})`;
}
