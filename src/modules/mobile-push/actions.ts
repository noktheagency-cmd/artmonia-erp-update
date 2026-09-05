"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";
import { canPublishMobilePush } from "./access";
import { campaignSchema } from "./contract";
import { cancelCampaign, publishCampaign } from "./service";

async function publisher() {
  const actor = await requireMutationActor();
  if (!canPublishMobilePush(actor)) throw new PublicActionError("Bu bölməyə girişiniz yoxdur.", "FORBIDDEN");
  return actor;
}
export const publishMobilePushAction = safeServerAction(async (raw: unknown) => {
  const actor = await publisher();
  const input = campaignSchema.parse(raw);
  const result = await getPrisma().$transaction(tx => publishCampaign(tx, actor.id, input), { timeout: 30000 });
  revalidatePath("/profile");
  return result;
}, "Bildiriş saxlanmadı.");
export const cancelMobilePushAction = safeServerAction(async (raw: unknown) => {
  const actor = await publisher();
  const id = z.string().uuid().parse(raw);
  await getPrisma().$transaction(tx => cancelCampaign(tx, actor.id, id));
  revalidatePath("/profile");
}, "Göndəriş dayandırılmadı.");
