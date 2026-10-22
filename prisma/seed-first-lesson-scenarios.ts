/**
 * Idempotent demo data for first-lesson activation flows.
 * Does NOT wipe the database — upserts ART-FL-* students only.
 *
 * Run: npx tsx prisma/seed-first-lesson-scenarios.ts
 */
import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  AttendanceCaptureSource,
  AttendanceMark,
  EnrollmentStatus,
  PaymentMethod,
  PrismaClient,
  StudentLifecycleStatus,
} from "../src/generated/prisma/client";

dotenv.config({ path: ".env.local" });
dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function utcDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function bakuToday() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Baku" });
}

function shiftDays(isoDate: string, days: number) {
  const date = utcDate(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

async function upsertStudentScenario(input: {
  code: string;
  name: string;
  phone: string;
  managerId: string;
  programId: string;
  teacherId: string;
  slotId: string;
  slotStartTime: string;
  slotEndTime: string;
  monthlyFee: string;
  firstLessonAt: string;
  markAbsent: boolean;
  note: string;
}) {
  const phoneNormalized = input.phone.replace(/\D/g, "");
  const existingContact = await prisma.contact.findFirst({
    where: { phoneNormalized },
    select: { id: true },
  });
  const contact = existingContact
    ? await prisma.contact.update({
        where: { id: existingContact.id },
        data: { fullName: input.name, phoneDisplay: input.phone, source: "first-lesson-seed" },
      })
    : await prisma.contact.create({
        data: {
          fullName: input.name,
          phoneDisplay: input.phone,
          phoneNormalized,
          source: "first-lesson-seed",
        },
      });

  const existing = await prisma.student.findUnique({
    where: { code: input.code },
    select: { id: true },
  });

  const student = existing
    ? await prisma.student.update({
        where: { id: existing.id },
        data: {
          contactId: contact.id,
          managerId: input.managerId,
          lifecycleStatus: StudentLifecycleStatus.SLOT_WAITING,
          billingPaused: true,
          billingAnchorDate: null,
          admissionTracking: true,
          notes: input.note,
          registeredAt: utcDate(shiftDays(input.firstLessonAt, -7)),
        },
      })
    : await prisma.student.create({
        data: {
          code: input.code,
          contactId: contact.id,
          managerId: input.managerId,
          lifecycleStatus: StudentLifecycleStatus.SLOT_WAITING,
          billingPaused: true,
          billingAnchorDate: null,
          admissionTracking: true,
          notes: input.note,
          registeredAt: utcDate(shiftDays(input.firstLessonAt, -7)),
          statusHistory: {
            create: {
              newStatus: StudentLifecycleStatus.SLOT_WAITING,
              reason: "First-lesson seed: slot gözləyir",
              effectiveAt: utcDate(shiftDays(input.firstLessonAt, -7)),
              changedById: input.managerId,
            },
          },
        },
      });

  await prisma.studentScheduleAssignment.deleteMany({
    where: { enrollment: { studentId: student.id } },
  });
  await prisma.attendanceRecord.deleteMany({
    where: { enrollment: { studentId: student.id } },
  });
  await prisma.invoice.deleteMany({ where: { studentId: student.id } });

  const existingEnrollment = await prisma.enrollment.findFirst({
    where: { studentId: student.id },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  const enrollment = existingEnrollment
    ? await prisma.enrollment.update({
        where: { id: existingEnrollment.id },
        data: {
          program: { connect: { id: input.programId } },
          teacher: { connect: { id: input.teacherId } },
          status: EnrollmentStatus.PAUSED,
          startDate: utcDate(input.firstLessonAt),
          firstLessonAt: utcDate(input.firstLessonAt),
          monthlyFee: input.monthlyFee,
          lessonsPerMonth: 8,
        },
      })
    : await prisma.enrollment.create({
        data: {
          student: { connect: { id: student.id } },
          program: { connect: { id: input.programId } },
          teacher: { connect: { id: input.teacherId } },
          status: EnrollmentStatus.PAUSED,
          startDate: utcDate(input.firstLessonAt),
          firstLessonAt: utcDate(input.firstLessonAt),
          monthlyFee: input.monthlyFee,
          lessonsPerMonth: 8,
        },
      });

  await prisma.studentScheduleAssignment.create({
    data: {
      enrollmentId: enrollment.id,
      slotId: input.slotId,
      validFrom: utcDate(input.firstLessonAt),
    },
  });

  let sale = await prisma.courseSale.findFirst({
    where: { studentId: student.id, cycleKey: `new:${student.id}` },
    select: { id: true },
  });
  if (!sale) {
    sale = await prisma.courseSale.create({
      data: {
        studentId: student.id,
        enrollmentId: enrollment.id,
        ownerId: input.managerId,
        cycleKey: `new:${student.id}`,
        kind: "NEW",
        route: "DIRECT",
        qualifiedAt: utcDate(shiftDays(input.firstLessonAt, -5)),
        contractConfirmedAt: new Date(),
        initialFee: input.monthlyFee,
        status: "COMPLETE",
      },
      select: { id: true },
    });
  } else {
    await prisma.courseSale.update({
      where: { id: sale.id },
      data: { enrollmentId: enrollment.id, initialFee: input.monthlyFee, status: "COMPLETE" },
    });
  }

  const existingPayment = await prisma.payment.findUnique({
    where: { idempotencyKey: `seed-fl-pay-${input.code}` },
    select: { id: true },
  });
  if (!existingPayment) {
    await prisma.payment.create({
      data: {
        studentId: student.id,
        courseSaleId: sale.id,
        amount: input.monthlyFee,
        paidAt: utcDate(shiftDays(input.firstLessonAt, -5)),
        paymentMonth: utcDate(`${input.firstLessonAt.slice(0, 7)}-01`),
        scheduleType: "MONTHLY",
        method: PaymentMethod.CASH,
        receiptPurpose: "ADMISSION",
        note: "First-lesson seed: tam ilk dövr ödənişi",
        idempotencyKey: `seed-fl-pay-${input.code}`,
        createdById: input.managerId,
      },
    });
  }

  const session = await prisma.slotSession.upsert({
    where: {
      slotId_sessionDate: {
        slotId: input.slotId,
        sessionDate: utcDate(input.firstLessonAt),
      },
    },
    update: {
      startTime: input.slotStartTime,
      endTime: input.slotEndTime,
    },
    create: {
      slotId: input.slotId,
      sessionDate: utcDate(input.firstLessonAt),
      startTime: input.slotStartTime,
      endTime: input.slotEndTime,
      status: "SCHEDULED",
    },
  });

  if (input.markAbsent) {
    await prisma.attendanceRecord.create({
      data: {
        sessionId: session.id,
        enrollmentId: enrollment.id,
        teacherId: input.teacherId,
        status: AttendanceMark.ABSENT,
        source: AttendanceCaptureSource.MANUAL,
        note: "Seed: ilk dərsə gəlmədi",
        markedById: input.managerId,
      },
    });
  }

  return { code: input.code, studentId: student.id, enrollmentId: enrollment.id, firstLessonAt: input.firstLessonAt };
}

async function main() {
  const today = bakuToday();
  const yesterday = shiftDays(today, -1);

  const manager = await prisma.user.findFirst({
    where: { isActive: true, roles: { some: { role: { code: { in: ["OWNER", "ADMIN", "SALES"] } } } } },
    orderBy: { createdAt: "asc" },
    select: { id: true, fullName: true },
  });
  if (!manager) throw new Error("Aktiv menecer / admin tapılmadı");

  const program = await prisma.program.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, defaultMonthlyFee: true },
  });
  if (!program) throw new Error("Aktiv proqram tapılmadı");

  const slot = await prisma.classSlot.findFirst({
    where: { teacher: { isActive: true } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      teacherId: true,
      startTime: true,
      endTime: true,
      teacher: { select: { fullName: true } },
    },
  });
  if (!slot) throw new Error("Müəllimli class slot tapılmadı — əvvəl qrup/slot yaradın");

  const monthlyFee = Number(program.defaultMonthlyFee) > 0
    ? Number(program.defaultMonthlyFee).toFixed(2)
    : "200.00";
  const base = {
    managerId: manager.id,
    programId: program.id,
    teacherId: slot.teacherId,
    slotId: slot.id,
    slotStartTime: slot.startTime,
    slotEndTime: slot.endTime,
    monthlyFee,
  };

  const scenarios = await Promise.all([
    upsertStudentScenario({
      ...base,
      code: "ART-FL-MISS",
      name: "Test İlk Dərs Buraxıb",
      phone: "+994 50 700 01 01",
      firstLessonAt: yesterday,
      markAbsent: true,
      note: "SEED: İlk dərsə ABSENT — UI xəbərdarlığı görünməlidir",
    }),
    upsertStudentScenario({
      ...base,
      code: "ART-FL-READY",
      name: "Test İlk Dərs Hazır",
      phone: "+994 50 700 01 02",
      firstLessonAt: today,
      markAbsent: false,
      note: "SEED: Bu gün ilk dərs — plannerdə Gəldi qeyd edin, status ACTIVE olmalıdır",
    }),
    upsertStudentScenario({
      ...base,
      code: "ART-FL-PLAN",
      name: "Test Plan Keçib",
      phone: "+994 50 700 01 03",
      firstLessonAt: yesterday,
      markAbsent: false,
      note: "SEED: Plan tarixi keçib, davamiyyət yoxdur — buraxılmış plan xəbərdarlığı",
    }),
  ]);

  console.log("First-lesson seed complete");
  console.log(JSON.stringify({
    manager: manager.fullName,
    program: program.name,
    teacher: slot.teacher.fullName,
    slotId: slot.id,
    today,
    scenarios,
    howToTest: [
      "1) /students siyahısında ART-FL-MISS və ART-FL-PLAN yanında “İlk dərsə gəlməyib” görünür",
      "2) ART-FL-MISS / ART-FL-PLAN profilində sarı activation warning oxuyun",
      "3) Qrup plannerində ART-FL-READY üçün bu gün “Gəldi” qeyd edin → status ACTIVE olur",
    ],
  }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
