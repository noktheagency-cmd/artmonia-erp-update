"use server";

import { safeServerAction, PublicActionError } from "@/server/actions/safe-action";
import { getDailyReportData } from "./daily-report-query";

export const filterDailyReport = safeServerAction(async (date: string) => {
  const data = await getDailyReportData(date);
  if (!data) throw new PublicActionError("Bu hesabata giriş icazəniz yoxdur.", "FORBIDDEN");
  return data;
}, "Hesabat yüklənmədi. Yenidən cəhd edin.");
