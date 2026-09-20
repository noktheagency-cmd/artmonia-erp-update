import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import type { ErpActor } from "@/server/auth/actor";
import { can } from "@/server/rbac/permissions";
import { teacherScope, commentScope } from "./homework";
import { getFircaHistory,getFircaLeaderboard,settings } from "./service";

export async function getFircaAdminData(actor:ErpActor,status:string,studentId?:string) {
  const db=getPrisma();const scope=await teacherScope(actor);const admin=can(actor.permissions,"settings.manage");
  const [cfg,queue,comments,students,leaderboard,history]=await Promise.all([
    settings(db),
    db.$queryRaw<{id:string;student:string;lesson:string;date:Date;fileName:string;status:string;revision:number;feedback:string|null}[]>(Prisma.sql`
      select h.id::text,c.full_name as student,w.title as lesson,s.session_date as date,h.file_name as "fileName",h.status,h.revision,h.feedback
      from erp.homework_submissions h join erp.students st on st.id=h.student_id join erp.contacts c on c.id=st.contact_id
      join erp.lesson_homeworks w on w.id=h.homework_id join erp.slot_sessions s on s.id=h.session_id
      where h.status=${status} and ${scope} order by h.submitted_at desc,h.id limit 50`),
    db.$queryRaw<{id:string;student:string;body:string;moderated:boolean}[]>(Prisma.sql`select r.id::text,c.full_name as student,r.body,r.moderated from erp.firca_comments r join erp.students s on s.id=r.student_id join erp.contacts c on c.id=s.contact_id where ${commentScope(actor)} order by received_at desc,r.id limit 50`),
    admin?db.$queryRaw<{id:string;name:string;code:string;excluded:boolean}[]>`select s.id::text,c.full_name as name,s.code,exists(select 1 from erp.firca_exclusions x where x.student_id=s.id) as excluded from erp.students s join erp.contacts c on c.id=s.contact_id join erp.student_mobile_accounts m on m.student_id=s.id order by c.full_name,s.id limit 500`:[],
    getFircaLeaderboard("00000000-0000-4000-8000-000000000000"),
    admin&&studentId?getFircaHistory(studentId):null,
  ]);
  return {admin,settings:{...cfg,startsAt:cfg.startsAt?.toISOString()??null},queue:queue.map(r=>({...r,date:r.date.toISOString().slice(0,10)})),comments,students,leaderboard,history};
}
export type FircaAdminData=Awaited<ReturnType<typeof getFircaAdminData>>;
