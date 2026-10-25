import { requireErpPageActor } from "@/server/auth/page-actor";
import { getPrisma } from "@/server/db/prisma";
import { scopeFor } from "@/server/rbac/permissions";
import { SingleLessonView, type SingleLessonViewData } from "@/modules/students/single-lesson-view";
import type { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import "@/modules/students/students.css";
import "@/modules/students/single-lessons.css";

export const dynamic = "force-dynamic";
export default async function SingleLessonsPage({ searchParams }: { searchParams: Promise<{q?:string;student?:string;page?:string;status?:string}> }) {
  const actor = await requireErpPageActor("/students/single-lessons");
  const input = await searchParams;
  const q = (input.q ?? "").trim().slice(0,80);
  const selected = z.string().uuid().safeParse(input.student);
  const selectedStudent = selected.success ? selected.data : "";
  const page = Math.min(10000,Math.max(1,Number.parseInt(input.page ?? "1",10)||1));
  const parsedStatus = z.enum(["RESERVED","ATTENDED","ABSENT","CANCELLED"]).safeParse(input.status);
  const status = parsedStatus.success ? parsedStatus.data : "ALL";
  const allStudents = scopeFor(actor.permissions,"student.read") === "ALL";
  const canRead = actor.permissions.has("student.read");
  const studentScope: Prisma.StudentWhereInput = {isTestData:false,...(!allStudents ? {managerId:actor.id} : {})};
  const lessonScope: Prisma.SingleLessonWhereInput = {student:{isTestData:false},...(!allStudents ? {OR:[...(canRead ? [{student:{managerId:actor.id}}] : []),...(actor.permissions.has("attendance.read") ? [{teacher:{userId:actor.id}}] : [])]} : {})};
  const prisma = getPrisma();
  const [teachers,programs,lessons,profile] = await Promise.all([
    prisma.teacher.findMany({where:{isActive:true},select:{id:true,fullName:true},orderBy:{fullName:"asc"},take:200}),
    prisma.program.findMany({where:{isActive:true},select:{id:true,name:true},orderBy:{name:"asc"},take:200}),
    prisma.singleLesson.findMany({where:{AND:[lessonScope,...(selectedStudent ? [{studentId:selectedStudent}] : []),...(parsedStatus.success ? [{status:parsedStatus.data}] : []),...(q ? [{student:{OR:[{code:{contains:q,mode:"insensitive" as const}},{contact:{fullName:{contains:q,mode:"insensitive" as const}}},{contact:{phoneDisplay:{contains:q}}}]}}] : [])]},include:{student:{select:{code:true,managerId:true,contact:{select:{fullName:true}}}},teacher:{select:{fullName:true,userId:true}},program:{select:{name:true}}},orderBy:[{lessonDate:"desc"},{startTime:"desc"},{id:"desc"}],take:51,skip:(page-1)*50}),
    selectedStudent && canRead ? prisma.student.findFirst({where:{AND:[studentScope,{id:selectedStudent}]},select:{id:true,code:true,managerId:true,contact:{select:{fullName:true}},_count:{select:{singleLessons:true}}}}) : Promise.resolve(null),
  ]);
  const rows: SingleLessonViewData["rows"] = lessons.slice(0,50).map(l=>({id:l.id,studentId:l.studentId,code:l.student.code,student:l.student.contact.fullName,teacher:l.teacher.fullName,teacherId:l.teacherId,program:l.program.name,programId:l.programId,date:l.lessonDate.toISOString().slice(0,10),time:l.startTime,duration:l.durationMinutes,room:l.room ?? "",price:l.price.toFixed(2),status:l.status,paid:Boolean(l.paymentId),canMark:actor.permissions.has("attendance.manage") && (scopeFor(actor.permissions,"attendance.manage")==="ALL" || l.teacher.userId===actor.id),canPay:actor.permissions.has("billing.payment.create") && canRead && (allStudents || l.student.managerId===actor.id),canBook:actor.permissions.has("student.update") && (scopeFor(actor.permissions,"student.update")==="ALL" || l.student.managerId===actor.id)}));
  if (profile && profile._count.singleLessons===0 && page===1 && !q && status==="ALL") rows.push({id:"new",studentId:profile.id,code:profile.code,student:profile.contact.fullName,teacher:"",teacherId:"",program:"",programId:"",date:"",time:"15:00",duration:120,room:"",price:"",status:"NEW",paid:false,canMark:false,canPay:false,canBook:actor.permissions.has("student.update") && (scopeFor(actor.permissions,"student.update")==="ALL" || profile.managerId===actor.id)});
  return <SingleLessonView data={{q,selectedStudent,page,hasNext:lessons.length>50,status,teachers:teachers.map(t=>({value:t.id,label:t.fullName})),programs:programs.map(p=>({value:p.id,label:p.name})),rows}}/>;
}
