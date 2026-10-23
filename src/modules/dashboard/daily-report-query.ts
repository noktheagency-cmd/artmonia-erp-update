import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { PublicActionError } from "@/server/actions/public-action-error";
import { canReadDailyReport, filteredDailyReportWindow, type DailyReportFilter } from "./daily-report-policy";
import { dailyReportSummarySql, dailyReportDetailsSql, dailyReportDetailKinds } from "./daily-report-sql";

export type DailyReportTotals = {
 leads:number; contacted:number; contactOps:number; newContacted:number; oldContacted:number; unanswered:number; unworked:number;
 appointmentCreated:number; scheduled:number; appointmentPeople:number; attended:number; noShow:number; appointmentCancelled:number; rescheduled:number; consultations:number; trials:number; legacyAppointments:number;
 sales:number; salesAmount:string;  crmNewSales:number; crmNewSalesAmount:string; directNewSales:number; directNewSalesAmount:string; returnSalesAmount:string; originalSales:number; cancelledSales:number; cancellationEvents:number; newSales:number; returnSales:number; crmSales:number; directSales:number;
 paymentCount:number; payments:string; deposit:string; balance:string; renewal:string; oneOff:string; other:string; unclassified:string;
 completed:number; overdue:number; tomorrow:number; overdueReplanned:number; frozen:number; stopped:number;
};
export type DailyReportData = DailyReportTotals & { date:string; from:string; to:string; managerId?:string; availableDates:string[]; managers:{id:string;name:string}[] };
export type DailyReportDetail = { id:string; name:string; at:string; description:string };
async function requireReportActor() {
 const actor = await requireErpActor();
 if (!canReadDailyReport(actor.id, actor.permissions)) throw new PublicActionError("Bu hesabata giriş icazəniz yoxdur.", "FORBIDDEN");
 return actor;
}
export async function getDailyReportData(requested?: string | DailyReportFilter): Promise<DailyReportData | null> {
 const actor = await requireErpActor();
 if (!canReadDailyReport(actor.id, actor.permissions)) return null;
 const w = filteredDailyReportWindow(requested), db=getPrisma();
 const [rows, managers] = await Promise.all([
  db.$queryRaw<DailyReportTotals[]>(dailyReportSummarySql(w)),
  db.$queryRaw<{id:string;name:string}[]>(Prisma.sql`select u.id,u.full_name name from erp.users u where u.id in (select manager_id from erp.leads union select owner_id from erp.course_sales union select actor_id from erp.lead_contact_events union select manager_id from erp.students) order by u.full_name limit 300`),
 ]);
 if (!rows[0]) throw new Error("Daily report returned no result");
 return { ...rows[0], date:w.date, from:w.from, to:w.to, managerId:w.managerId, availableDates:w.availableDates, managers };
}
export async function getDailyReportDetails(filter: DailyReportFilter, requestedKind: string, requestedPage: number) {
 await requireReportActor();
 const kind=z.enum(dailyReportDetailKinds).parse(requestedKind), page=z.number().int().min(0).max(199).parse(requestedPage);
 const w=filteredDailyReportWindow(filter);
 const rows=await getPrisma().$queryRaw<{id:string;name:string;at:Date;description:string}[]>(dailyReportDetailsSql(w,kind,page*50));
 return { rows:rows.slice(0,50).map(row=>({...row,at:row.at.toISOString()})), hasMore:rows.length>50, page };
}
