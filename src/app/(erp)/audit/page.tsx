import type { Route } from "next";
import { redirect } from "next/navigation";
import { AppRole } from "@/generated/prisma/client";
import { SessionAuditWorkspace } from "@/modules/audit/session-audit-workspace";
import { getSessionAuditData } from "@/modules/audit/session-queries";
import { requireErpActor } from "@/server/auth/actor";

export const dynamic = "force-dynamic";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; profileType?: string; profileId?: string }>;
}) {
  const actor = await requireErpActor();
  if (!actor.roles.includes(AppRole.SUPER_ADMIN)) {
    redirect("/dashboard" as Route);
  }

  const params = await searchParams;
  const initialTab = params.tab === "accounts"
    ? "ACCOUNTS"
    : params.tab === "activity"
      ? "ACTIVITY"
      : params.tab === "payment-dates"
        ? "PAYMENT_DATES"
        : "SESSIONS";
  const initialAccountKey =
    (params.profileType === "EMPLOYEE" || params.profileType === "CORPORATE_CONTACT") && params.profileId
      ? `${params.profileType}:${params.profileId}`
      : null;
  const data = await getSessionAuditData();
  return <SessionAuditWorkspace initialData={data} initialTab={initialTab} initialAccountKey={initialAccountKey} />;
}
