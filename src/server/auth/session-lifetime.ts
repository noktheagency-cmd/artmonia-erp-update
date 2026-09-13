import { Prisma } from "@/generated/prisma/client";

// Absolute lifetime from auth.sessions.created_at; refreshes do not extend it.
export const ERP_SESSION_MAX_AGE_SQL = Prisma.sql`interval '7 days'`;
