"use server";

import { safeServerAction } from "@/server/actions/safe-action";
import { getAttendanceReport } from "./attendance-analytics-query";

export const loadAttendanceReport = safeServerAction(getAttendanceReport, "Davamiyyət statistikası yüklənmədi. Yenidən cəhd edin.");
