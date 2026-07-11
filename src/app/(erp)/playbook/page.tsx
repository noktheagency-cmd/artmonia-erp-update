import { PlaybookWorkspace } from "@/modules/playbook/playbook-workspace";
import { getPlaybookData } from "@/modules/playbook/queries";
import { requireErpActor } from "@/server/auth/actor";

export default async function PlaybookPage() {
  const [actor, data] = await Promise.all([
    requireErpActor("playbook.read"),
    getPlaybookData(),
  ]);

  return <PlaybookWorkspace initialData={data} canManage={actor.permissions.has("playbook.manage")} />;
}
