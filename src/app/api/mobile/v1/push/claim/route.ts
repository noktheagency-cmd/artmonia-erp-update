import { getPrisma } from "@/server/db/prisma";
import { claimSchema } from "@/modules/mobile-push/contract";
import { claimPushDeliveries } from "@/modules/mobile-push/service";
import { workerRequest } from "@/modules/mobile-push/worker-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return workerRequest(request, async raw => {
    const { limit } = claimSchema.parse(raw);
    return getPrisma().$transaction(tx => claimPushDeliveries(tx, limit));
  });
}
