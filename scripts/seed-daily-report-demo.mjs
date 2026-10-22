/**
 * Demo facts for every daily-report card (UI redesign check).
 *
 *   node --env-file=.env.local --import tsx scripts/seed-daily-report-demo.mjs
 */
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client.ts";
import { PrismaPg } from "@prisma/adapter-pg";
import { recordCourseSalePayment } from "../src/modules/students/course-sale-service.ts";

const CASES = [
  { key: "lead1", name: "Aysel Məmmədova", phone: "+994500000921", norm: "994500000921" },
  { key: "lead2", name: "Rəşad Əliyev", phone: "+994500000922", norm: "994500000922" },
  { key: "meet1", name: "Nigar Hüseynova", phone: "+994500000923", norm: "994500000923" },
  { key: "meet2", name: "Elçin Quliyev", phone: "+994500000924", norm: "994500000924" },
  { key: "cash1", name: "Leyla Abdullayeva", phone: "+994500000925", norm: "994500000925", fee: 120 },
  { key: "cash2", name: "Tural İsmayılov", phone: "+994500000926", norm: "994500000926", fee: 80 },
  { key: "cash3", name: "Günel Kerimova", phone: "+994500000927", norm: "994500000927", fee: 200 },
  { key: "work1", name: "Kamran Səfərov", phone: "+994500000928", norm: "994500000928" },
  { key: "work2", name: "Sevinc Rəhimli", phone: "+994500000929", norm: "994500000929" },
  { key: "freeze", name: "Orxan Cəfərov", phone: "+994500000930", norm: "994500000930" },
  { key: "stop", name: "Zəhra Mustafayeva", phone: "+994500000931", norm: "994500000931" },
];

const url = process.env.DIRECT_URL || process.env.DATABASE_URL;
if (!url) {
  console.error("DIRECT_URL or DATABASE_URL required");
  process.exit(1);
}

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 2 }) });

function bakuToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function atBaku(dateStr, hour = 10, minute = 0) {
  return new Date(`${dateStr}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:00+04:00`);
}

function monthStart(dateStr) {
  return `${dateStr.slice(0, 7)}-01`;
}

async function ensureOwner(tx) {
  const existing = await tx.user.findFirst({
    where: { fullName: "QA DailyReport Owner" },
    orderBy: { createdAt: "asc" },
  });
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

async function ensureContact(tx, item) {
  const existing = await tx.contact.findFirst({ where: { phoneNormalized: item.norm } });
  if (existing) {
    return tx.contact.update({
      where: { id: existing.id },
      data: { fullName: item.name, phoneDisplay: item.phone, source: "QA" },
    });
  }
  return tx.contact.create({
    data: { fullName: item.name, phoneDisplay: item.phone, phoneNormalized: item.norm, source: "QA" },
  });
}

async function ensureLead(tx, contactId, ownerId, programId, createdAt, extras = {}) {
  const existing = await tx.lead.findFirst({
    where: { contactId, source: "QA" },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    return tx.lead.update({
      where: { id: existing.id },
      data: {
        managerId: ownerId,
        programInterestId: programId,
        stage: extras.stage ?? "CONTACTED",
        convertedStudentId: extras.convertedStudentId ?? existing.convertedStudentId,
        createdAt,
        nextFollowUpAt: extras.nextFollowUpAt ?? null,
        nextActionType: extras.nextActionType ?? null,
      },
    });
  }
  return tx.lead.create({
    data: {
      contactId,
      managerId: ownerId,
      programInterestId: programId,
      stage: extras.stage ?? "CONTACTED",
      convertedStudentId: extras.convertedStudentId,
      source: "QA",
      createdAt,
      nextFollowUpAt: extras.nextFollowUpAt ?? null,
      nextActionType: extras.nextActionType ?? null,
    },
  });
}

async function ensureStudent(tx, contactId, ownerId, today, lifecycleStatus = "SLOT_WAITING") {
  const existing = await tx.student.findFirst({ where: { contactId } });
  if (existing) {
    return tx.student.update({
      where: { id: existing.id },
      data: { managerId: ownerId, lifecycleStatus, admissionTracking: true, isTestData: false },
    });
  }
  return tx.student.create({
    data: {
      code: `QA-DR-${randomUUID().slice(0, 8)}`,
      contactId,
      managerId: ownerId,
      registeredAt: new Date(today),
      lifecycleStatus,
      admissionTracking: true,
      isTestData: false,
    },
  });
}

async function ensureEnrollment(tx, studentId, programId, today) {
  const existing = await tx.enrollment.findFirst({
    where: { studentId, status: { in: ["ACTIVE", "PAUSED"] } },
  });
  if (existing) return existing;
  return tx.enrollment.create({
    data: { studentId, programId, monthlyFee: 100, startDate: new Date(today), status: "PAUSED" },
  });
}

async function resetMutableDemo(tx, leadIds, studentIds) {
  if (leadIds.length) {
    await tx.crmAppointment.deleteMany({ where: { leadId: { in: leadIds } } });
    await tx.leadContactEvent.deleteMany({ where: { leadId: { in: leadIds } } });
    await tx.leadWorkItem.deleteMany({ where: { leadId: { in: leadIds } } });
  }
  if (studentIds.length) {
    await tx.payment.deleteMany({
      where: {
        studentId: { in: studentIds },
        receiptPurpose: { not: "ADMISSION" },
        note: "QA daily-report demo",
      },
    });
    await tx.studentStatusHistory.deleteMany({
      where: { studentId: { in: studentIds }, reason: "QA daily-report demo" },
    });
  }
}

async function seed(tx) {
  const today = bakuToday();
  const owner = await ensureOwner(tx);
  const program = await ensureProgram(tx);
  const byKey = Object.fromEntries(CASES.map((c) => [c.key, c]));
  const summary = {
    today,
    leads: 0,
    contacts: 0,
    appointments: 0,
    sales: 0,
    payments: 0,
    work: 0,
    statuses: 0,
  };

  // Touch all contacts/leads first so we can reset mutable rows once.
  const prepared = {};
  for (const item of CASES) {
    const contact = await ensureContact(tx, item);
    prepared[item.key] = { item, contact };
  }
  const contactIds = Object.values(prepared).map((p) => p.contact.id);
  const students = await tx.student.findMany({ where: { contactId: { in: contactIds } }, select: { id: true } });
  const leads = await tx.lead.findMany({ where: { contactId: { in: contactIds }, source: "QA" }, select: { id: true } });
  await resetMutableDemo(tx, leads.map((l) => l.id), students.map((s) => s.id));

  for (const [i, key] of ["lead1", "lead2"].entries()) {
    const { item, contact } = prepared[key];
    const lead = await ensureLead(tx, contact.id, owner.id, program.id, atBaku(today, 9, i * 10));
    summary.leads += 1;
    await tx.leadContactEvent.create({
      data: {
        leadId: lead.id,
        contactId: contact.id,
        actorId: owner.id,
        channel: "PHONE",
        outcome: i === 0 ? "TALKED" : "UNANSWERED",
        occurredAt: atBaku(today, 11, i * 15),
        idempotencyKey: randomUUID(),
        note: "QA daily-report demo",
      },
    });
    summary.contacts += 1;
  }

  for (const [i, key] of ["meet1", "meet2"].entries()) {
    const { item, contact } = prepared[key];
    const lead = await ensureLead(tx, contact.id, owner.id, program.id, atBaku(today, 8, 30 + i));
    await tx.crmAppointment.create({
      data: {
        leadId: lead.id,
        ownerId: owner.id,
        kind: i === 0 ? "CONSULTATION" : "TRIAL",
        outcome: i === 0 ? "ATTENDED" : "SCHEDULED",
        plannedAt: atBaku(today, 14 + i, 0),
        occurredAt: i === 0 ? atBaku(today, 14, 30) : null,
        createdAt: atBaku(today, 9, 0),
        idempotencyKey: randomUUID(),
      },
    });
    summary.appointments += 1;
  }

  for (const [i, key] of ["cash1", "cash2", "cash3"].entries()) {
    const { item, contact } = prepared[key];
    const student = await ensureStudent(tx, contact.id, owner.id, today);
    await ensureEnrollment(tx, student.id, program.id, today);
    const existingSale = await tx.courseSale.findFirst({
      where: { studentId: student.id, cancelledAt: null },
      orderBy: { qualifiedAt: "desc" },
    });
    if (existingSale) {
      await tx.courseSale.update({
        where: { id: existingSale.id },
        data: { qualifiedAt: new Date(today), initialFee: item.fee, ownerId: owner.id },
      });
    } else {
      const lead = await ensureLead(tx, contact.id, owner.id, program.id, atBaku(today, 8, i), {
        stage: "CONTACTED",
        convertedStudentId: student.id,
      });
      const admission = await tx.payment.create({
        data: {
          studentId: student.id,
          amount: 20,
          paidAt: new Date(today),
          paymentMonth: new Date(monthStart(today)),
          createdById: owner.id,
          idempotencyKey: randomUUID(),
          note: "QA daily-report demo",
        },
      });
      await recordCourseSalePayment(tx, {
        studentId: student.id,
        paymentId: admission.id,
        purpose: "ADMISSION",
        contractConfirmed: true,
        actorId: owner.id,
        admissionLeadId: lead.id,
      });
      await tx.courseSale.updateMany({
        where: { studentId: student.id, cycleKey: `new:${student.id}` },
        data: { qualifiedAt: new Date(today), initialFee: item.fee, ownerId: owner.id },
      });
      summary.payments += 1;
    }
    await tx.payment.create({
      data: {
        studentId: student.id,
        amount: item.fee,
        paidAt: new Date(today),
        paymentMonth: new Date(monthStart(today)),
        createdById: owner.id,
        receiptPurpose: "RENEWAL",
        idempotencyKey: randomUUID(),
        note: "QA daily-report demo",
      },
    });
    summary.sales += 1;
    summary.payments += 1;
  }

  {
    const { contact } = prepared.work1;
    const lead = await ensureLead(tx, contact.id, owner.id, program.id, atBaku(today, 8, 40), {
      nextFollowUpAt: atBaku(today, 16, 0),
      nextActionType: "CALL",
    });
    await tx.leadWorkItem.create({
      data: {
        leadId: lead.id,
        ownerId: owner.id,
        kind: "CALL",
        source: "PRIMARY",
        plannedAt: atBaku(today, 12, 0),
        createdAt: atBaku(today, 9, 0),
        completedAt: atBaku(today, 12, 20),
        completedById: owner.id,
      },
    });
    summary.work += 1;
  }
  {
    const { contact } = prepared.work2;
    const lead = await ensureLead(tx, contact.id, owner.id, program.id, atBaku(today, 8, 45), {
      nextFollowUpAt: atBaku(today, 18, 0),
      nextActionType: "CALL",
    });
    await tx.leadWorkItem.create({
      data: {
        leadId: lead.id,
        ownerId: owner.id,
        kind: "CALL",
        source: "PRIMARY",
        plannedAt: atBaku(today, 8, 0),
        createdAt: atBaku(today, 7, 30),
      },
    });
    const tomorrow = new Date(atBaku(today, 0, 0).getTime() + 86_400_000);
    const tomorrowDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Baku",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(tomorrow);
    await tx.leadWorkItem.create({
      data: {
        leadId: lead.id,
        ownerId: owner.id,
        kind: "APPOINTMENT",
        source: "APPOINTMENT",
        plannedAt: atBaku(tomorrowDate, 11, 0),
        createdAt: atBaku(today, 10, 0),
      },
    });
    summary.work += 2;
  }

  for (const [key, status] of [["freeze", "FROZEN"], ["stop", "STOPPED"]]) {
    const { contact } = prepared[key];
    const student = await ensureStudent(tx, contact.id, owner.id, today, status);
    await ensureEnrollment(tx, student.id, program.id, today);
    await tx.studentStatusHistory.create({
      data: {
        studentId: student.id,
        oldStatus: "ACTIVE",
        newStatus: status,
        eventType: "STATUS_CHANGE",
        reason: "QA daily-report demo",
        effectiveAt: new Date(today),
        changedById: owner.id,
      },
    });
    summary.statuses += 1;
  }

  return summary;
}

try {
  const summary = await db.$transaction((tx) => seed(tx), { timeout: 120000 });
  console.log("seeded daily-report demo", summary);
} finally {
  await db.$disconnect();
}
