import assert from "node:assert/strict";
import test from "node:test";
import { FinanceSalaryMode, Prisma } from "@/generated/prisma/client";
import { resolveExpenseStaff, resolveStaffSalarySnapshot } from "./staff-salary";

function fixture(options: { fixed?: string; active?: boolean; linked?: boolean; userLink?: boolean; payout?: number } = {}) {
  const teacher = { id: "teacher-1", userId: "user-1", fullName: "Test müəllim", isActive: options.active ?? true };
  const employee = { teacherId: options.linked === false ? null : teacher.id, salaryMode: options.fixed !== undefined ? FinanceSalaryMode.STATIC : FinanceSalaryMode.PERCENT, salaryAmount: new Prisma.Decimal(options.fixed ?? 0) };
  const tx = {
    hrEmployee: {
      findUnique: async ({ where }: { where: { teacherId?: string } }) => where.teacherId && options.linked === false ? null : employee,
      findFirst: async () => employee,
    },
    teacher: { findUnique: async () => options.userLink === false ? null : teacher },
    teacherContractRule: { findFirst: async () => ({ salaryPercent: new Prisma.Decimal(40) }) },
    teacherPayout: { findFirst: async () => ({ eligibleRevenue: new Prisma.Decimal(500), payoutAmount: new Prisma.Decimal(options.payout ?? 200) }) },
    financeExpense: { findFirst: async () => ({ salaryPercent: new Prisma.Decimal(40), salaryBaseAmount: new Prisma.Decimal(1000), salaryCalculatedAmount: new Prisma.Decimal(400), amount: new Prisma.Decimal(400) }) },
  } as unknown as Prisma.TransactionClient;
  return tx;
}
const date = new Date("2026-09-01T00:00:00Z");
const teacherStaff = { employeeUserId: null, teacherId: "teacher-1" };
const userStaff = { employeeUserId: "user-1", teacherId: null };

test("legacy employee selection resolves to the linked teacher even without a teacher login", async () => {
  assert.deepEqual(await resolveExpenseStaff(fixture({ userLink: false }), userStaff), teacherStaff);
});
test("legacy user-only teacher link also resolves to the teacher", async () => {
  assert.deepEqual(await resolveExpenseStaff(fixture({ linked: false }), userStaff), teacherStaff);
});
test("ordinary employee and direct teacher targets remain unchanged", async () => {
  assert.deepEqual(await resolveExpenseStaff(fixture({ linked: false, userLink: false }), userStaff), userStaff);
  assert.deepEqual(await resolveExpenseStaff(fixture(), teacherStaff), teacherStaff);
});
test("fixed teacher salary preserves the configured amount instead of percentage payout", async () => {
  const result = await resolveStaffSalarySnapshot(fixture({ fixed: "625.75" }), teacherStaff, date);
  assert.equal(result.salaryMode, "STATIC");
  assert.equal(result.salaryCalculatedAmount, 625.75);
  assert.equal(result.salaryBaseAmount, 625.75);
  assert.equal(result.salaryPercent, null);
});
test("fixed salary also works for legacy user-only HR links", async () => {
  const result = await resolveStaffSalarySnapshot(fixture({ fixed: "625.75", linked: false }), teacherStaff, date);
  assert.equal(result.salaryCalculatedAmount, 625.75);
  assert.equal(result.salaryMode, "STATIC");
});
test("zero fixed salary is not replaced by a previous payment", async () => {
  const result = await resolveStaffSalarySnapshot(fixture({ fixed: "0" }), teacherStaff, date);
  assert.equal(result.salaryCalculatedAmount, 0);
});
test("percentage teacher keeps the current month's calculated payout", async () => {
  const result = await resolveStaffSalarySnapshot(fixture(), teacherStaff, date);
  assert.equal(result.salaryMode, "PERCENT");
  assert.equal(result.salaryCalculatedAmount, 200);
  assert.equal(result.salaryPercent, 40);
});
test("zero current payout is not replaced by historical salary", async () => {
  const result = await resolveStaffSalarySnapshot(fixture({ payout: 0 }), teacherStaff, date);
  assert.equal(result.salaryCalculatedAmount, 0);
});
test("inactive teacher is rejected even when submitted through the old employee target", async () => {
  const tx = fixture({ active: false });
  const staff = await resolveExpenseStaff(tx, userStaff);
  await assert.rejects(resolveStaffSalarySnapshot(tx, staff, date), /aktiv deyil/);
});
test("missing teacher and empty staff selection are rejected", async () => {
  await assert.rejects(resolveStaffSalarySnapshot(fixture({ userLink: false }), teacherStaff, date), /aktiv deyil/);
  await assert.rejects(resolveStaffSalarySnapshot(fixture(), { teacherId: null, employeeUserId: null }, date), /seçilməlidir/);
});
