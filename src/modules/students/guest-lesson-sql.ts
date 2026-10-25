import { Prisma } from "@/generated/prisma/client";

/** A guest-only profile has visit history and has never opened a monthly enrollment. */
export function guestOnlyStudentSql(studentId: Prisma.Sql) {
  return Prisma.sql`(exists (select 1 from erp.single_lessons guest where guest.student_id = ${studentId})
    and not exists (select 1 from erp.enrollments monthly where monthly.student_id = ${studentId}))`;
}
export function regularPaymentSql(alias: Prisma.Sql) {
  return Prisma.sql`${alias}.receipt_purpose is distinct from 'ONE_OFF'`;
}
export function regularInvoiceSql(invoiceId: Prisma.Sql) {
  return Prisma.sql`not exists (select 1 from erp.single_lessons guest where guest.invoice_id = ${invoiceId})`;
}
