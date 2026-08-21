import { requireErpActor } from "@/server/auth/actor";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  await requireErpActor("marketing.read");
  return <section aria-label="Marketing" />;
}
