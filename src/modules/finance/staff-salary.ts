import { FinanceSalaryMode, type Prisma } from "@/generated/prisma/client";
import { startOfMonth, toNumber } from "@/modules/shared/format";

export type ExpenseStaff = { employeeUserId: string | null; teacherId: string | null };

// Older forms and expenses can still reference the teacher's ERP account.
export async function resolveExpenseStaff(tx: Prisma.TransactionClient, staff: ExpenseStaff): Promise<ExpenseStaff> {
  if (!staff.employeeUserId) return staff;
  const employee = await tx.hrEmployee.findUnique({
    where: { userId: staff.employeeUserId },
    select: { teacherId: true },
  });
  const teacherId = employee?.teacherId ?? (await tx.teacher.findUnique({
    where: { userId: staff.employeeUserId },
    select: { id: true },
  }))?.id;
  return teacherId ? { employeeUserId: null, teacherId } : staff;
}

export async function resolveStaffSalarySnapshot(
  tx: Prisma.TransactionClient,
  staff: ExpenseStaff,
  expenseDate: Date
) {
  if (!staff.employeeUserId && !staff.teacherId) {
    throw new Error("Əməkhaqqı xərci üçün əməkdaş seçilməlidir");
  }

  if (staff.employeeUserId) {
    const employee = await tx.hrEmployee.findUnique({
      where: { userId: staff.employeeUserId },
      select: {
        id: true,
        fullName: true,
        salaryMode: true,
        salaryAmount: true,
        salaryPercent: true,
        user: { select: { isActive: true } },
      },
    });

    if (!employee?.user?.isActive) {
      throw new Error("Seçilmiş əməkdaş tapılmadı və ya aktiv deyil");
    }

    const lastSalary = await tx.financeExpense.findFirst({
      where: {
        employeeUserId: staff.employeeUserId,
      },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      select: {
        amount: true,
        salaryCalculatedAmount: true,
      },
    });
    const salaryBase = roundMoney(toNumber(lastSalary?.salaryCalculatedAmount ?? lastSalary?.amount));
    const salaryPercent = roundMoney(toNumber(employee.salaryPercent));
    const salaryAmount = employee.salaryMode === FinanceSalaryMode.PERCENT
      ? roundMoney(salaryBase * salaryPercent / 100)
      : roundMoney(toNumber(employee.salaryAmount));

    return {
      payeeName: employee.fullName,
      salaryMode: employee.salaryMode,
      salaryPercent: employee.salaryMode === FinanceSalaryMode.PERCENT ? salaryPercent : null,
      salaryBaseAmount: employee.salaryMode === FinanceSalaryMode.PERCENT ? salaryBase : salaryAmount,
      salaryCalculatedAmount: salaryAmount,
    };
  }

  const periodMonth = startOfMonth(expenseDate);
  const teacher = await tx.teacher.findUnique({
    where: { id: staff.teacherId ?? "" },
    select: { id: true, fullName: true, isActive: true, userId: true },
  });

  if (!teacher?.isActive) {
    throw new Error("Seçilmiş müəllim tapılmadı və ya aktiv deyil");
  }

  const employee = await tx.hrEmployee.findUnique({
    where: { teacherId: teacher.id },
    select: { salaryMode: true, salaryAmount: true },
  }) ?? (teacher.userId ? await tx.hrEmployee.findFirst({
    where: { userId: teacher.userId, teacherId: null },
    select: { salaryMode: true, salaryAmount: true },
  }) : null);
  if (employee?.salaryMode === FinanceSalaryMode.STATIC) {
    const salaryAmount = roundMoney(toNumber(employee.salaryAmount));
    return {
      payeeName: teacher.fullName,
      salaryMode: FinanceSalaryMode.STATIC,
      salaryPercent: null,
      salaryBaseAmount: salaryAmount,
      salaryCalculatedAmount: salaryAmount,
    };
  }

  const [rule, payout, lastSalary] = await Promise.all([
    tx.teacherContractRule.findFirst({
      where: {
        teacherId: teacher.id,
        validFrom: { lte: periodMonth },
        OR: [{ validTo: null }, { validTo: { gte: periodMonth } }],
      },
      orderBy: [{ validFrom: "desc" }, { createdAt: "desc" }],
      select: { salaryPercent: true },
    }),
    tx.teacherPayout.findFirst({
      where: {
        teacherId: teacher.id,
        periodMonth,
      },
      orderBy: { createdAt: "desc" },
      select: {
        eligibleRevenue: true,
        payoutAmount: true,
      },
    }),
    tx.financeExpense.findFirst({
      where: {
        teacherId: teacher.id,
        salaryMode: FinanceSalaryMode.PERCENT,
      },
      orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
      select: {
        amount: true,
        salaryPercent: true,
        salaryBaseAmount: true,
        salaryCalculatedAmount: true,
      },
    }),
  ]);

  const salaryPercent = roundMoney(toNumber(rule?.salaryPercent ?? lastSalary?.salaryPercent));
  const salaryBaseAmount = roundMoney(toNumber(payout?.eligibleRevenue ?? lastSalary?.salaryBaseAmount));
  const calculatedAmount = payout
    ? roundMoney(toNumber(payout.payoutAmount))
    : roundMoney(
        toNumber(lastSalary?.salaryCalculatedAmount ?? lastSalary?.amount) ||
          (salaryBaseAmount * salaryPercent) / 100
      );

  return {
    payeeName: teacher.fullName,
    salaryMode: FinanceSalaryMode.PERCENT,
    salaryPercent,
    salaryBaseAmount,
    salaryCalculatedAmount: calculatedAmount,
  };
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
