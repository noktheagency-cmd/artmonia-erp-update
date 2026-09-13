import { Prisma } from "@/generated/prisma/client";

/** Both scopes must be satisfied; never widen one permission using the other. */
export function attendanceAnalyticsScope(actorId: string, studentScope: "ALL" | "ASSIGNED" | null, attendanceScope: "ALL" | "ASSIGNED" | null) {
  return Prisma.sql`
    (${studentScope === "ALL" ? Prisma.sql`true` : studentScope === "ASSIGNED" ? Prisma.sql`s.manager_id = ${actorId}::uuid` : Prisma.sql`false`})
    and (${attendanceScope === "ALL" ? Prisma.sql`true` : attendanceScope === "ASSIGNED" ? Prisma.sql`t.user_id = ${actorId}::uuid` : Prisma.sql`false`})
  `;
}
