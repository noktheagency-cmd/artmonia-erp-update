import type { Route } from "next";
import { redirect } from "next/navigation";
import { AppRole } from "@/generated/prisma/client";
import { SessionAuditWorkspace } from "@/modules/audit/session-audit-workspace";
import { getSessionAuditData } from "@/modules/audit/session-queries";
import { requireErpActor } from "@/server/auth/actor";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const actor = await requireErpActor();
  if (!actor.roles.includes(AppRole.SUPER_ADMIN)) {
    redirect("/dashboard" as Route);
  }

  const data = await getSessionAuditData();
  return <SessionAuditWorkspace initialData={data} />;
}
