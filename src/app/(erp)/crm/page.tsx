import "@/modules/crm/crm.css";
import { CrmPipeline } from "@/modules/crm/crm-pipeline";
import { getCrmData } from "@/modules/crm/queries";

export const dynamic = "force-dynamic";

export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    stage?: string;
    owner?: string;
    program?: string;
    source?: string;
    priority?: string;
    followUp?: string;
    period?: string;
    from?: string;
    to?: string;
    listDateBy?: string;
    listFrom?: string;
    listTo?: string;
  }>;
}) {
  const params = await searchParams;
  const data = await getCrmData(params);

  return <CrmPipeline data={data} />;
}
