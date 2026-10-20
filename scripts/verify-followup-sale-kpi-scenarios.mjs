/**
 * QA scenarios:
 * 1) Paid admission sale → lead leaves follow-up (REGISTERED, nextFollowUpAt null).
 * 2) STOPPED return + ≥20 AZN admission → RETURN course_sale counts in company KPI newSales.
 *
 *   node --env-file=.env.staging --import tsx scripts/verify-followup-sale-kpi-scenarios.mjs --seed
 *   node --env-file=.env.staging --import tsx scripts/verify-followup-sale-kpi-scenarios.mjs
 */
import { randomUUID } from "node:crypto";
import { PrismaClient, Prisma } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { recordCourseSalePayment } from "../src/modules/students/course-sale-service.ts";
import { companySalesCountSql } from "../src/modules/students/sales-metrics-sql.ts";

const MARKERS = {
  exitPhone: "+994500000901",
  returnPhone: "+994500000902",
  exitNorm: "994500000901",
  returnNorm: "994500000902",
  exitName: "QA Followup Exit Sale",
  returnName: "QA Return Sale KPI",
};

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DIRECT_URL or DATABASE_URL required");
  process.exit(1);
}

const seed = process.argv.includes("--seed");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });

function monthBounds(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const from = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const untilDate = new Date(Date.UTC(y, m + 1, 1));
  return { from, until: untilDate.toISOString().slice(0, 10) };
}

async function ensureOwner(tx) {
  const existing = await tx.user.findFirst({
    where: { fullName: "QA Scenario Owner" },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;
  return tx.user.create({
    data: { fullName: "QA Scenario Owner", email: `qa-scenario-owner-${randomUUID()}@example.invalid` },
  });
}

async function ensureProgram(tx) {
  const existing = await tx.program.findFirst({ where: { name: "QA Scenario Program", isActive: true } });
  if (existing) return existing;
  return tx.program.create({ data: { name: "QA Scenario Program", defaultMonthlyFee: 100, isActive: true } });
}

async function ensureContact(tx, fullName, phoneDisplay, phoneNormalized) {
  const existing = await tx.contact.findFirst({ where: { phoneNormalized } });
  if (existing) {
    return tx.contact.update({ where: { id: existing.id }, data: { fullName, phoneDisplay } });
  }
  return tx.contact.create({ data: { fullName, phoneDisplay, phoneNormalized, source: "QA" } });
}

async function ensureStudent(tx, contactId, ownerId, codePrefix, extras) {
  let student = await tx.student.findFirst({ where: { contactId } });
  if (!student) {
    student = await tx.student.create({
      data: {
        code: `${codePrefix}-${randomUUID().slice(0, 8)}`,
        contactId,
        managerId: ownerId,
        registeredAt: extras.registeredAt ?? new Date(),
        lifecycleStatus: "SLOT_WAITING",
        admissionTracking: extras.admissionTracking,
        isTestData: false,
      },
    });
  } else {
    student = await tx.student.update({
      where: { id: student.id },
      data: {
        managerId: ownerId,
        lifecycleStatus: "SLOT_WAITING",
        admissionTracking: extras.admissionTracking,
        isTestData: false,
      },
    });
  }
  return student;
}

async function ensureEnrollment(tx, studentId, programId) {
  const existing = await tx.enrollment.findFirst({
    where: { studentId, status: { in: ["ACTIVE", "PAUSED"] } },
  });
  if (existing) {
    return tx.enrollment.update({ where: { id: existing.id }, data: { monthlyFee: 100, programId } });
  }
  return tx.enrollment.create({
    data: { studentId, programId, monthlyFee: 100, startDate: new Date(), status: "PAUSED" },
  });
}

async function clearSaleCycle(tx, studentId, cycleKey) {
  const sales = await tx.courseSale.findMany({ where: { studentId, cycleKey }, select: { id: true } });
  if (!sales.length) return;
  const ids = sales.map((s) => s.id);
  await tx.payment.updateMany({
    where: { courseSaleId: { in: ids } },
    data: { courseSaleId: null, receiptPurpose: "UNCLASSIFIED" },
  });
  await tx.courseSale.deleteMany({ where: { id: { in: ids } } });
}

async function seedExitFollowupCase(tx, ownerId, programId) {
  const contact = await ensureContact(tx, MARKERS.exitName, MARKERS.exitPhone, MARKERS.exitNorm);
  const student = await ensureStudent(tx, contact.id, ownerId, "QA-EXIT", { admissionTracking: true });
  await ensureEnrollment(tx, student.id, programId);

  let lead = await tx.lead.findFirst({
    where: { contactId: contact.id, convertedStudentId: student.id },
    orderBy: { createdAt: "desc" },
  });
  if (!lead) {
    lead = await tx.lead.create({
      data: {
        contactId: contact.id,
        managerId: ownerId,
        programInterestId: programId,
        stage: "TRIAL_CONSULTATION",
        convertedStudentId: student.id,
        nextFollowUpAt: new Date(),
        nextActionType: "PAYMENT_REMINDER",
        source: "QA",
      },
    });
  } else {
    lead = await tx.lead.update({
      where: { id: lead.id },
      data: {
        stage: "TRIAL_CONSULTATION",
        managerId: ownerId,
        nextFollowUpAt: new Date(),
        nextActionType: "PAYMENT_REMINDER",
      },
    });
  }

  await tx.leadWorkItem.updateMany({
    where: { leadId: lead.id, cancelledAt: null, completedAt: null },
    data: { cancelledAt: new Date(), result: "REPLANNED" },
  });
  await tx.leadWorkItem.create({
    data: {
      leadId: lead.id,
      ownerId,
      kind: "PAYMENT_REMINDER",
      source: "PRIMARY",
      plannedAt: new Date(),
    },
  });

  await clearSaleCycle(tx, student.id, `new:${student.id}`);

  const payment = await tx.payment.create({
    data: {
      studentId: student.id,
      amount: 20,
      paidAt: new Date(),
      paymentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      createdById: ownerId,
      idempotencyKey: randomUUID(),
    },
  });
  await recordCourseSalePayment(tx, {
    studentId: student.id,
    paymentId: payment.id,
    purpose: "ADMISSION",
    contractConfirmed: true,
    actorId: ownerId,
  });
}

async function seedReturnKpiCase(tx, ownerId, programId) {
  const contact = await ensureContact(tx, MARKERS.returnName, MARKERS.returnPhone, MARKERS.returnNorm);
  const student = await ensureStudent(tx, contact.id, ownerId, "QA-RET", {
    admissionTracking: false,
    registeredAt: new Date("2024-01-15T00:00:00Z"),
  });
  await ensureEnrollment(tx, student.id, programId);

  const reactivation = await tx.studentStatusHistory.create({
    data: {
      studentId: student.id,
      oldStatus: "STOPPED",
      newStatus: "SLOT_WAITING",
      eventType: "REACTIVATED",
      effectiveAt: new Date(),
      reason: "QA return scenario",
      changedById: ownerId,
    },
  });

  await clearSaleCycle(tx, student.id, `return:${reactivation.id}`);

  const lead = await tx.lead.create({
    data: {
      contactId: contact.id,
      managerId: ownerId,
      programInterestId: programId,
      stage: "CONTACTED",
      nextFollowUpAt: new Date(),
      nextActionType: "FOLLOW_UP",
      source: "QA",
    },
  });

  const payment = await tx.payment.create({
    data: {
      studentId: student.id,
      amount: 20,
      paidAt: new Date(),
      paymentMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      createdById: ownerId,
      idempotencyKey: randomUUID(),
    },
  });
  await recordCourseSalePayment(tx, {
    studentId: student.id,
    paymentId: payment.id,
    purpose: "ADMISSION",
    contractConfirmed: true,
    actorId: ownerId,
    admissionLeadId: lead.id,
  });
}

async function assertExitFollowup() {
  const lead = await db.lead.findFirst({
    where: { contact: { phoneNormalized: MARKERS.exitNorm } },
    orderBy: { updatedAt: "desc" },
    include: {
      workItems: { where: { source: "PRIMARY", cancelledAt: null, completedAt: null } },
      courseSales: { where: { cancelledAt: null } },
    },
  });
  if (!lead) return { ok: false, detail: "Case1 lead tapılmadı — əvvəl --seed işlədin" };
  const ok =
    lead.stage === "REGISTERED" &&
    lead.nextFollowUpAt === null &&
    lead.nextActionType === null &&
    lead.workItems.length === 0 &&
    lead.courseSales.length >= 1;
  return {
    ok,
    detail: ok
      ? `Case1 OK: ${MARKERS.exitName} → REGISTERED, follow-up təmiz, satış var`
      : `Case1 FAIL: stage=${lead.stage}, nextFollowUpAt=${lead.nextFollowUpAt}, openWork=${lead.workItems.length}, sales=${lead.courseSales.length}`,
  };
}

async function assertReturnKpi() {
  const { from, until } = monthBounds();
  const lead = await db.lead.findFirst({
    where: { contact: { phoneNormalized: MARKERS.returnNorm }, stage: "REGISTERED" },
    orderBy: { updatedAt: "desc" },
    include: { courseSales: { where: { cancelledAt: null }, orderBy: { qualifiedAt: "desc" }, take: 1 } },
  });
  if (!lead?.courseSales[0]) {
    return { ok: false, detail: "Case2 lead/sale tapılmadı — əvvəl --seed işlədin" };
  }
  const sale = lead.courseSales[0];
  const [row] = await db.$queryRaw`select ${companySalesCountSql(Prisma.sql`${from}`, Prisma.sql`${until}`)}::int as count`;
  const ok = sale.kind === "RETURN" && Number(row.count) >= 1 && lead.nextFollowUpAt === null;
  return {
    ok,
    detail: ok
      ? `Case2 OK: ${MARKERS.returnName} RETURN sale, KPI ${from}…${until} companySales=${row.count}, follow-up closed`
      : `Case2 FAIL: kind=${sale.kind}, kpiCount=${row.count}, nextFollowUpAt=${lead.nextFollowUpAt}`,
  };
}

async function main() {
  try {
    if (seed) {
      await db.$transaction(async (tx) => {
        const owner = await ensureOwner(tx);
        const program = await ensureProgram(tx);
        await seedExitFollowupCase(tx, owner.id, program.id);
        await seedReturnKpiCase(tx, owner.id, program.id);
      }, { timeout: 60000 });
      console.log("Seeded:");
      console.log(`  ${MARKERS.exitName} (${MARKERS.exitPhone})`);
      console.log(`  ${MARKERS.returnName} (${MARKERS.returnPhone})`);
    }

    const c1 = await assertExitFollowup();
    const c2 = await assertReturnKpi();
    console.log(c1.detail);
    console.log(c2.detail);
    if (!c1.ok || !c2.ok) process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
