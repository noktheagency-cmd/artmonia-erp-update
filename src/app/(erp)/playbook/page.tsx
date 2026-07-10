import type { Route } from "next";
import { redirect } from "next/navigation";
import { PlaybookWorkspace } from "@/modules/playbook/playbook-workspace";
import { getPlaybookData } from "@/modules/playbook/queries";
import { getCurrentErpUser } from "@/server/auth/session";

export default async function PlaybookPage() {
  const currentUser = await getCurrentErpUser();
  if (!currentUser) redirect("/login" as Route);

  const data = await getPlaybookData();

  return <PlaybookWorkspace initialData={data} />;
}
