"use server";

import { safeServerAction, PublicActionError } from "@/server/actions/safe-action";
import { getDailyReportData, getDailyReportDetails } from "./daily-report-query";
import type { DailyReportFilter } from "./daily-report-policy";

export const filterDailyReport = safeServerAction(async (date: string | DailyReportFilter) => {
  const data = await getDailyReportData(date);
  if (!data) throw new PublicActionError("Bu hesabata giriş icazəniz yoxdur.", "FORBIDDEN");
  return data;
}, "Hesabat yüklənmədi. Yenidən cəhd edin.");

export const loadDailyReportDetails = safeServerAction(getDailyReportDetails, "Detallar yüklənmədi.");
