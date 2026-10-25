import { requireErpPageActor } from "@/server/auth/page-actor";
import { getPrisma } from "@/server/db/prisma";
import { assertPermission, scopeFor } from "@/server/rbac/permissions";
import { SingleLessonView } from "@/modules/students/single-lesson-view";
import { Prisma } from "@/generated/prisma/client";
import { z } from "zod";
import { nameSearchSql } from "@/modules/shared/search-sql";
import "@/modules/students/students.css";
import "@/modules/students/single-lessons.css";

export const dynamic = "force-dynamic";
export default async function SingleLessonsPage({ searchParams }: { searchParams: Promise<{q?:string;student?:string}> }) {
  const actor = await requireErpPageActor("/students/single-lessons");
  assertPermission(actor.permissions, "student.read");
  const input = await searchParams;
  const q = (input.q ?? "").trim().slice(0,80);
  const selected = z.string().uuid().safeParse(input.student);
  const selectedStudent = selected.success ? selected.data : "";
  const allStudents = scopeFor(actor.permissions,"student.read") === "ALL";
  const lessonScope: Prisma.SingleLessonWhereInput = {student:{isTestData:false},...(!allStudents ? {OR:[{student:{managerId:actor.id}},...(actor.permissions.has("attendance.read") ? [{teacher:{userId:actor.id}}] : [])]} : {})};
  const studentScopeSql = scopeFor(actor.permissions,"student.read") === "ALL" ? Prisma.sql`true` : Prisma.sql`s.manager_id=${actor.id}::uuid`;
  const prisma = getPrisma();
  const [students,teachers,programs,lessons] = await Promise.all([
    prisma.$queryRaw<Array<{id:string;code:string;name:string}>>(Prisma.sql`select s.id,s.code,c.full_name name from erp.students s join erp.contacts c on c.id=s.contact_id
      where not s.is_test_data and ${studentScopeSql} and ${q ? Prisma.sql`(${nameSearchSql(Prisma.sql`c.full_name`,q)} or s.code ilike ${`%${q}%`} or c.phone_display ilike ${`%${q}%`})` : Prisma.sql`true`}
      order by ${selectedStudent ? Prisma.sql`s.id=${selectedStudent}::uuid desc,` : Prisma.empty} c.full_name,s.id limit 200`),
    prisma.teacher.findMany({where:{isActive:true},select:{id:true,fullName:true},orderBy:{fullName:"asc"},take:100}),
    prisma.program.findMany({where:{isActive:true},select:{id:true,name:true},orderBy:{name:"asc"},take:100}),
    prisma.singleLesson.findMany({where:{...lessonScope,...(selectedStudent ? {studentId:selectedStudent} : {})},include:{student:{select:{managerId:true,contact:{select:{fullName:true}}}},teacher:{select:{fullName:true,userId:true}},program:{select:{name:true}}},orderBy:[{lessonDate:"desc"},{startTime:"desc"}],take:100}),
  ]);
  return <SingleLessonView data={{q,selectedStudent,students:students.map(s=>({value:s.id,label:`${s.name} · ${s.code}`})),teachers:teachers.map(t=>({value:t.id,label:t.fullName})),programs:programs.map(p=>({value:p.id,label:p.name})),
    canCreate:actor.permissions.has("student.create"),canBook:actor.permissions.has("student.update"),canPay:actor.permissions.has("billing.payment.create"),
    rows:lessons.map(l=>({id:l.id,studentId:l.studentId,student:l.student.contact.fullName,teacher:l.teacher.fullName,program:l.program.name,date:l.lessonDate.toISOString().slice(0,10),time:l.startTime,price:l.price.toFixed(2),status:l.status,paid:Boolean(l.paymentId),canMark:actor.permissions.has("attendance.manage") && (scopeFor(actor.permissions,"attendance.manage")==="ALL" || l.teacher.userId===actor.id),canPay:actor.permissions.has("billing.payment.create") && (allStudents || l.student.managerId===actor.id)})),
  }}/>;
}
