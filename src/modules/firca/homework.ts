import "server-only";
import { randomUUID,createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { getSupabaseAdminClient } from "@/server/supabase/admin";
import { MobilePortalError } from "@/modules/mobile/mobile-portal-errors";
import { scopeFor } from "@/server/rbac/permissions";
import type { ErpActor } from "@/server/auth/actor";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { setBalance, settings, type FircaDb } from "./service";

const BUCKET="erp-private-files";
export type Submission = { id:string; studentId:string; homeworkId:string; sessionId:string; requestKey:string; objectPath:string; fileName:string; status:string; feedback:string|null; revision:number; submittedAt:Date; reviewedAt:Date|null };
export const submissionSelect = Prisma.sql`id::text,student_id::text as "studentId",homework_id::text as "homeworkId",session_id::text as "sessionId",request_key::text as "requestKey",object_path as "objectPath",file_name as "fileName",status,feedback,revision,submitted_at as "submittedAt",reviewed_at as "reviewedAt"`;
export async function serializeSubmission(row:Submission) {
  const signed=await getSupabaseAdminClient().storage.from(BUCKET).createSignedUrl(row.objectPath,300);
  if(signed.error) throw new MobilePortalError("FILE_UNAVAILABLE",503,"Fayl hazırda açılmır.");
  return { id:row.id,homeworkId:row.homeworkId,lessonId:row.sessionId,fileName:row.fileName,fileUrl:signed.data.signedUrl,fileUrlExpiresIn:300,
    status:row.status,feedback:row.feedback,revision:row.revision,submittedAt:row.submittedAt.toISOString(),reviewedAt:row.reviewedAt?.toISOString()??null };
}
export async function getSubmission(studentId:string, homeworkId:string) {
  const [row]=await getPrisma().$queryRaw<Submission[]>(Prisma.sql`select ${submissionSelect} from erp.homework_submissions where student_id=${studentId}::uuid and homework_id=${homeworkId}::uuid`);
  return { submission:row?await serializeSubmission(row):null };
}
export async function assertHomeworkAccess(db:FircaDb,studentId:string,homeworkId:string) {
  const homework=await db.lessonHomework.findUnique({where:{id:homeworkId},select:{session:{select:{id:true,slotId:true,sessionDate:true,status:true}}}});
  if(!homework || homework.session.status==="CANCELLED") throw new MobilePortalError("HOMEWORK_NOT_FOUND",404,"Tapşırıq tapılmadı.");
  const enrollment=await db.enrollment.findFirst({where:{studentId,status:"ACTIVE",scheduleAssignments:{some:{slotId:homework.session.slotId,validFrom:{lte:homework.session.sessionDate},OR:[{validTo:null},{validTo:{gte:homework.session.sessionDate}}]}}},select:{id:true}});
  if(!enrollment) throw new MobilePortalError("HOMEWORK_NOT_FOUND",404,"Tapşırıq tapılmadı.");
  return homework.session;
}
function extension(bytes:Buffer,mime:string) {
  if(mime==="image/jpeg" && bytes[0]===255 && bytes[1]===216 && bytes[2]===255)return "jpg";
  if(mime==="image/png" && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return "png";
  if(mime==="image/webp" && bytes.subarray(0,4).toString()==="RIFF" && bytes.subarray(8,12).toString()==="WEBP")return "webp";
  if(mime==="application/pdf" && bytes.subarray(0,5).toString()==="%PDF-")return "pdf";
  throw new MobilePortalError("INVALID_FILE",415,"JPEG, PNG, WebP və ya PDF faylı seçin.");
}
export async function submitHomework(studentId:string,homeworkId:string,requestKey:string,file:File) {
  const db=getPrisma(); const session=await assertHomeworkAccess(db,studentId,homeworkId);
  if(file.size<1 || file.size>8*1024*1024) throw new MobilePortalError("FILE_TOO_LARGE",413,"Fayl maksimum 8 MB ola bilər.");
  const bytes=Buffer.from(await file.arrayBuffer()); const ext=extension(bytes,file.type);
  const payloadHash=createHash("sha256").update(homeworkId+":"+file.type+":").update(bytes).digest("hex");
  const requests=await db.$queryRaw<{hash:string;id:string}[]>`select payload_hash as hash,submission_id::text as id from erp.homework_submission_requests where student_id=${studentId}::uuid and request_key=${requestKey}::uuid`;
  if(requests[0] && requests[0].hash!==payloadHash)throw new MobilePortalError("IDEMPOTENCY_CONFLICT",409,"Göndəriş açarı fərqli fayl üçün istifadə edilib.");
  const old=requests[0]?await db.$queryRaw<Submission[]>(Prisma.sql`select ${submissionSelect} from erp.homework_submissions where id=${requests[0].id}::uuid`):[];
  if(old[0]) {
    if(old[0].homeworkId!==homeworkId) throw new MobilePortalError("IDEMPOTENCY_CONFLICT",409,"Göndəriş açarı başqa tapşırığa aiddir.");
    return {submission:await serializeSubmission(old[0]),repeated:true};
  }
  const objectPath="homework-submissions/"+studentId+"/"+randomUUID()+"."+ext;
  const upload=await getSupabaseAdminClient().storage.from(BUCKET).upload(objectPath,bytes,{contentType:file.type,upsert:false});
  if(upload.error) throw new MobilePortalError("UPLOAD_FAILED",503,"Fayl yüklənmədi.");
  let result:Submission;
  try {
    result=await db.$transaction(async tx=>{
      await tx.$queryRaw`select pg_advisory_xact_lock(hashtextextended(${"firca:"+studentId},0))`;
      await assertHomeworkAccess(tx,studentId,homeworkId);
      const [priorRequest]=await tx.$queryRaw<{hash:string;id:string}[]>`select payload_hash as hash,submission_id::text as id from erp.homework_submission_requests where student_id=${studentId}::uuid and request_key=${requestKey}::uuid`;
      if(priorRequest) {
        if(priorRequest.hash!==payloadHash)throw new MobilePortalError("IDEMPOTENCY_CONFLICT",409,"Göndəriş açarı fərqli fayl üçün istifadə edilib.");
        return (await tx.$queryRaw<Submission[]>(Prisma.sql`select ${submissionSelect} from erp.homework_submissions where id=${priorRequest.id}::uuid`))[0];
      }
      const [quota]=await tx.$queryRaw<{n:number}[]>`select count(*)::int as n from erp.homework_submission_requests where student_id=${studentId}::uuid and created_at>clock_timestamp()-interval '1 day'`;
      if(quota.n>=30)throw new MobilePortalError("UPLOAD_LIMIT",429,"Günlük göndəriş limiti bitib.");
      const [current]=await tx.$queryRaw<Submission[]>(Prisma.sql`select ${submissionSelect} from erp.homework_submissions where student_id=${studentId}::uuid and session_id=${session.id}::uuid for update`);
      if(current?.requestKey===requestKey)return current;
      if(current?.status==="accepted")throw new MobilePortalError("HOMEWORK_ALREADY_ACCEPTED",409,"Qəbul edilmiş tapşırığı müəllim düzəlişə qaytarmalıdır.");
      const [row]=await tx.$queryRaw<Submission[]>(Prisma.sql`insert into erp.homework_submissions(student_id,homework_id,session_id,request_key,object_path,file_name,content_type,file_size)
        values(${studentId}::uuid,${homeworkId}::uuid,${session.id}::uuid,${requestKey}::uuid,${objectPath},${file.name.slice(0,180)},${file.type},${file.size})
        on conflict(student_id,session_id) do update set request_key=excluded.request_key,object_path=excluded.object_path,file_name=excluded.file_name,content_type=excluded.content_type,file_size=excluded.file_size,status='submitted',feedback=null,reviewed_at=null,reviewed_by_id=null,revision=erp.homework_submissions.revision+1,submitted_at=clock_timestamp()
        returning ${submissionSelect}`);
      await writeAuditLog(tx,{action:"homework.submit",entityType:"homework_submission",entityId:row.id,after:{studentId,homeworkId,revision:row.revision}});
      await tx.$executeRaw`insert into erp.homework_submission_requests(student_id,request_key,homework_id,submission_id,payload_hash) values(${studentId}::uuid,${requestKey}::uuid,${homeworkId}::uuid,${row.id}::uuid,${payloadHash})`;
      return row;
    });
  } catch(error) { await getSupabaseAdminClient().storage.from(BUCKET).remove([objectPath]); throw error; }
  if(result.objectPath!==objectPath) await getSupabaseAdminClient().storage.from(BUCKET).remove([objectPath]);
  return {submission:await serializeSubmission(result),repeated:result.objectPath!==objectPath};
}
export async function teacherScope(actor:ErpActor) {
  if(scopeFor(actor.permissions,"attendance.manage")==="ALL")return Prisma.sql`true`;
  if(scopeFor(actor.permissions,"attendance.manage")!=="ASSIGNED")return Prisma.sql`false`;
  return Prisma.sql`exists(select 1 from erp.class_slots cs join erp.teachers t on t.id=cs.teacher_id where cs.id=s.slot_id and t.user_id=${actor.id}::uuid)`;
}
export function commentScope(actor:ErpActor) {
  if(scopeFor(actor.permissions,"attendance.manage")==="ALL")return Prisma.sql`true`;
  if(scopeFor(actor.permissions,"attendance.manage")!=="ASSIGNED")return Prisma.sql`false`;
  return Prisma.sql`exists(select 1 from erp.enrollments e join erp.teachers t on t.id=e.teacher_id where e.student_id=r.student_id and e.status::text='ACTIVE' and t.user_id=${actor.id}::uuid)`;
}
export async function reviewHomework(db:FircaDb,actor:ErpActor,input:{id:string;revision:number;status:"accepted"|"rejected";reason:string}) {
  const scope=await teacherScope(actor);
  const [row]=await db.$queryRaw<(Submission & {cancelled:boolean})[]>(Prisma.sql`select h.id::text,h.student_id::text as "studentId",h.session_id::text as "sessionId",h.status,h.revision,h.submitted_at as "submittedAt",s.status::text='CANCELLED' as cancelled
    from erp.homework_submissions h join erp.slot_sessions s on s.id=h.session_id where h.id=${input.id}::uuid and ${scope} for share of s`);
  if(!row)throw new MobilePortalError("SUBMISSION_NOT_FOUND",404,"Tapşırıq tapılmadı.");
  await db.$queryRaw`select pg_advisory_xact_lock(hashtextextended(${"firca:"+row.studentId},0))`;
  const [latest]=await db.$queryRaw<{revision:number;status:string;feedback:string|null}[]>`select revision,status,feedback from erp.homework_submissions where id=${row.id}::uuid for update`;
  if(latest.revision===input.revision+1 && latest.status===input.status && latest.feedback===input.reason)return {repeated:true};
  if(latest.revision!==input.revision)throw new MobilePortalError("STALE_REVISION",409,"Tapşırıq dəyişib. Səhifəni yeniləyin.");
  if(latest.status===input.status)return {repeated:true};
  if(row.cancelled && input.status==="accepted")throw new MobilePortalError("LESSON_CANCELLED",409,"Dərs ləğv edilib.");
  const cfg=await settings(db);
  const [eligible]=await db.$queryRaw<{ok:boolean}[]>`select erp.firca_student_eligible(${row.studentId}::uuid) as ok`;
  const points=input.status==="accepted" && cfg.enabled && eligible.ok && cfg.startsAt && row.submittedAt>=cfg.startsAt?cfg.homeworkPoints:0;
  await db.$executeRaw`update erp.homework_submissions set status=${input.status},feedback=${input.reason},reviewed_by_id=${actor.id}::uuid,reviewed_at=clock_timestamp(),revision=revision+1 where id=${row.id}::uuid`;
  await setBalance(db,row.studentId,"homework",row.sessionId,points,input.reason,actor.id);
  await writeAuditLog(db,{actorUserId:actor.id,action:"homework.review",entityType:"homework_submission",entityId:row.id,before:{status:latest.status},after:{status:input.status},reason:input.reason});
  return {repeated:false};
}
