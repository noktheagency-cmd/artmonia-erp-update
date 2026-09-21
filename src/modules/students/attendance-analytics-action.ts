"use server";

import { safeServerAction } from "@/server/actions/safe-action";
import { getAttendanceReport } from "./attendance-analytics-query";
import { getRetentionReport } from "./retention-analytics-query";

export const loadAttendanceReport = safeServerAction(getAttendanceReport, "Davamiyyət statistikası yüklənmədi. Yenidən cəhd edin.");
export const loadRetentionReport = safeServerAction(getRetentionReport, "Dondurma və dayandırma statistikası yüklənmədi. Yenidən cəhd edin.");
