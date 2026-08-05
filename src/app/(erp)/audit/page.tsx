import { SessionAuditWorkspace } from "@/modules/audit/session-audit-workspace";
import { getSessionAuditData } from "@/modules/audit/session-queries";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const data = await getSessionAuditData();
  return <SessionAuditWorkspace initialData={data} />;
}
