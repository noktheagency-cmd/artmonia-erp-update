"use server";

import { z } from "zod";
import { getCrmLeadDetail } from "@/modules/crm/queries";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";

export const getLeadDetailAction = safeServerAction(async (id: string) => {
  const lead = await getCrmLeadDetail(z.string().uuid().parse(id));
  if (!lead) {
    throw new PublicActionError("Müraciət tapılmadı və ya giriş icazəniz yoxdur.", "NOT_FOUND");
  }
  return lead;
}, "Müraciət profili yüklənmədi. Yenidən cəhd edin.");
