import { getPrisma } from "@/server/db/prisma";
import { acknowledgeSchema } from "@/modules/mobile-push/contract";
import { acknowledgePush } from "@/modules/mobile-push/service";
import { workerRequest } from "@/modules/mobile-push/worker-api";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  return workerRequest(request, async raw => {
    const input = acknowledgeSchema.parse(raw);
    return getPrisma().$transaction(tx => acknowledgePush(tx, input));
  });
}
