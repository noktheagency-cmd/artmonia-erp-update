import "@/modules/about/about-page.css";
import { AboutWorkspace } from "@/modules/about/about-workspace";
import { getCompanyKnowledgeData } from "@/modules/about/queries";
import { isPrivilegedActor, requireErpActor } from "@/server/auth/actor";

export const dynamic = "force-dynamic";

export default async function AboutPage() {
  const actor = await requireErpActor();
  const canEdit = isPrivilegedActor(actor);
  const data = await getCompanyKnowledgeData(canEdit, actor.id);

  return (
    <AboutWorkspace
      initialData={data}
      canEdit={canEdit}
    />
  );
}
