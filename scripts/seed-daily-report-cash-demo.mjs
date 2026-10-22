/**
 * Demo sales + payments for today's daily-report cash accordion (UI check).
 *
 *   node --env-file=.env.local --import tsx scripts/seed-daily-report-cash-demo.mjs
 *   node --env-file=.env.local --import tsx scripts/seed-daily-report-cash-demo.mjs --clean
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { recordCourseSalePayment } from "../src/modules/students/course-sale-service.ts";

const MARKER = "QA DailyReport Cash";
const PHONES = [
  { name: "Fəridə Nəsirova", phone: "+994500000911", norm: "994500000911", amount: 120 },
  { name: "Vuqar Həsənov", phone: "+994500000912", norm: "994500000912", amount: 80 },
  { name: "Amina Bağırova", phone: "+994500000913", norm: "994500000913", amount: 200 },
];

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DIRECT_URL or DATABASE_URL required");
  process.exit(1);
}

const clean = process.argv.includes("--clean");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });

function bakuToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baku", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

function monthStart(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

async function cleanup(tx) {
  const contacts = await tx.contact.findMany({
    where: { OR: [{ fullName: { startsWith: MARKER } }, { phoneNormalized: { in: PHONES.map((p) => p.norm) } }] },
    select: { id: true },
  });
  if (!contacts.length) return { contacts: 0, students: 0, sales: 0, payments: 0 };
  const contactIds = contacts.map((c) => c.id);
  const students = await tx.student.findMany({ where: { contactId: { in: contactIds } }, select: { id: true } });
  const studentIds = students.map((s) => s.id);
  const sales = studentIds.length
    ? await tx.courseSale.findMany({ where: { studentId: { in: studentIds } }, select: { id: true } })
    : [];
  const saleIds = sales.map((s) => s.id);

  if (studentIds.length) {
    await tx.payment.updateMany({
      where: { studentId: { in: studentIds } },
      data: { courseSaleId: null, receiptPurpose: "UNCLASSIFIED" },
    });
    await tx.payment.deleteMany({ where: { studentId: { in: studentIds } } });
  }
  if (saleIds.length) await tx.courseSale.deleteMany({ where: { id: { in: saleIds } } });

  const leads = await tx.lead.findMany({ where: { contactId: { in: contactIds } }, select: { id: true } });
  const leadIds = leads.map((l) => l.id);
  if (leadIds.length) {
    await tx.leadWorkItem.deleteMany({ where: { leadId: { in: leadIds } } });
    await tx.leadContactEvent.deleteMany({ where: { leadId: { in: leadIds } } });
    await tx.crmAppointment.deleteMany({ where: { leadId: { in: leadIds } } });
    await tx.leadStageHistory.deleteMany({ where: { leadId: { in: leadIds } } });
    await tx.lead.deleteMany({ where: { id: { in: leadIds } } });
  }
  if (studentIds.length) {
    await tx.enrollment.deleteMany({ where: { studentId: { in: studentIds } } });
    await tx.student.deleteMany({ where: { id: { in: studentIds } } });
  }
  await tx.contact.deleteMany({ where: { id: { in: contactIds } } });
  return { contacts: contacts.length, students: students.length, sales: sales.length, payments: studentIds.length };
}

async function ensureOwner(tx) {
  const existing = await tx.user.findFirst({ where: { fullName: "QA DailyReport Owner" }, orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return tx.user.create({
    data: { fullName: "QA DailyReport Owner", email: `qa-daily-report-${randomUUID()}@example.invalid` },
  });
}

async function ensureProgram(tx) {
  const existing = await tx.program.findFirst({ where: { name: "QA DailyReport Program", isActive: true } });
  if (existing) return existing;
  return tx.program.create({ data: { name: "QA DailyReport Program", defaultMonthlyFee: 100, isActive: true } });
}

async function seedOne(tx, ownerId, programId, item, today) {
  let contact = await tx.contact.findFirst({ where: { phoneNormalized: item.norm } });
  if (!contact) {
    contact = await tx.contact.create({
      data: { fullName: item.name, phoneDisplay: item.phone, phoneNormalized: item.norm, source: "QA" },
    });
  } else {
    contact = await tx.contact.update({
      where: { id: contact.id },
      data: { fullName: item.name, phoneDisplay: item.phone },
    });
  }

  let student = await tx.student.findFirst({ where: { contactId: contact.id } });
  if (!student) {
    student = await tx.student.create({
      data: {
        code: `QA-DR-${randomUUID().slice(0, 8)}`,
        contactId: contact.id,
        managerId: ownerId,
        registeredAt: new Date(today),
        lifecycleStatus: "SLOT_WAITING",
        admissionTracking: true,
        isTestData: false,
      },
    });
  } else {
    student = await tx.student.update({
      where: { id: student.id },
      data: { managerId: ownerId, lifecycleStatus: "SLOT_WAITING", admissionTracking: true, isTestData: false },
    });
  }

  let enrollment = await tx.enrollment.findFirst({
    where: { studentId: student.id, status: { in: ["ACTIVE", "PAUSED"] } },
  });
  if (!enrollment) {
    enrollment = await tx.enrollment.create({
      data: { studentId: student.id, programId, monthlyFee: 100, startDate: new Date(today), status: "PAUSED" },
    });
  }

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
        stage: "CONTACTED",
        convertedStudentId: student.id,
        source: "QA",
      },
    });
  } else {
    lead = await tx.lead.update({
      where: { id: lead.id },
      data: { stage: "CONTACTED", managerId: ownerId },
    });
  }

  const cycleKey = `new:${student.id}`;
  const oldSales = await tx.courseSale.findMany({ where: { studentId: student.id, cycleKey }, select: { id: true } });
  if (oldSales.length) {
    const ids = oldSales.map((s) => s.id);
    await tx.payment.updateMany({
      where: { courseSaleId: { in: ids } },
      data: { courseSaleId: null, receiptPurpose: "UNCLASSIFIED" },
    });
    await tx.payment.deleteMany({ where: { studentId: student.id, courseSaleId: { in: ids } } });
    await tx.courseSale.deleteMany({ where: { id: { in: ids } } });
  }
  await tx.payment.deleteMany({
    where: { studentId: student.id, note: "QA daily-report demo" },
  });

  const admission = await tx.payment.create({
    data: {
      studentId: student.id,
      amount: 20,
      paidAt: new Date(today),
      paymentMonth: new Date(monthStart(today)),
      createdById: ownerId,
      idempotencyKey: randomUUID(),
      note: "QA daily-report demo",
    },
  });
  await recordCourseSalePayment(tx, {
    studentId: student.id,
    paymentId: admission.id,
    purpose: "ADMISSION",
    contractConfirmed: true,
    actorId: ownerId,
  });

  await tx.courseSale.updateMany({
    where: { studentId: student.id, cycleKey },
    data: { qualifiedAt: new Date(today), initialFee: item.amount, ownerId },
  });

  await tx.payment.create({
    data: {
      studentId: student.id,
      amount: item.amount,
      paidAt: new Date(today),
      paymentMonth: new Date(monthStart(today)),
      createdById: ownerId,
      receiptPurpose: "RENEWAL",
      idempotencyKey: randomUUID(),
      note: "QA daily-report demo",
    },
  });

  return { name: item.name, saleAmount: item.amount, payments: 2 };
}

try {
  const today = bakuToday();
  if (clean) {
    const result = await db.$transaction((tx) => cleanup(tx), { timeout: 60000 });
    console.log("cleaned", result);
  } else {
    const seeded = await db.$transaction(async (tx) => {
      await cleanup(tx);
      const owner = await ensureOwner(tx);
      const program = await ensureProgram(tx);
      const rows = [];
      for (const item of PHONES) rows.push(await seedOne(tx, owner.id, program.id, item, today));
      return rows;
    }, { timeout: 60000 });
    console.log(`seeded for ${today} (Asia/Baku):`);
    for (const row of seeded) console.log(`  ${row.name}: sale ${row.saleAmount} AZN, ${row.payments} payments`);
  }
} finally {
  await db.$disconnect();
}
