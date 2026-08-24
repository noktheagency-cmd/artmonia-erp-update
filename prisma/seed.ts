import dotenv from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  AppRole,
  ApprovalStatus,
  AttendanceMark,
  ClassShift,
  EnrollmentStatus,
  FinanceCostCenter,
  FinanceFinancialClass,
  FinanceSalaryMode,
  FinanceTransactionType,
  GroupWeekday,
  InvoiceStatus,
  LeadStage,
  PaymentAllocationMode,
  PaymentMethod,
  PermissionScope,
  PrismaClient,
  StudentLifecycleStatus,
  TaskStatus,
  type Teacher,
} from "../src/generated/prisma/client";
import { permissionCatalog } from "../src/server/rbac/permissions";
import { financeCategoryCatalog } from "./finance-category-catalog";

dotenv.config({ path: ".env.local" });
dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to seed demo data.");
}

if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "true") {
  throw new Error("Refusing to seed demo data in production without ALLOW_DEMO_SEED=true.");
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function month(value: string) {
  return date(`${value}-01`);
}

async function resetDemoData() {
  await prisma.attendanceRecord.deleteMany();
  await prisma.slotSession.deleteMany();
  await prisma.studentScheduleAssignment.deleteMany();
  await prisma.classSlot.deleteMany();
  await prisma.financeExpense.deleteMany();
  await prisma.financeExpenseCategory.deleteMany();
  await prisma.paymentAllocation.deleteMany();
  await prisma.refundAdjustment.deleteMany();
  await prisma.teacherPayoutLine.deleteMany();
  await prisma.teacherPayout.deleteMany();
  await prisma.teacherContractRule.deleteMany();
  await prisma.teacherAssignmentHistory.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.studentStatusHistory.deleteMany();
  await prisma.studentRelationship.deleteMany();
  await prisma.leadStageHistory.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.task.deleteMany();
  await prisma.target.deleteMany();
  await prisma.dataExport.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.student.deleteMany();
  await prisma.programPricingVersion.deleteMany();
  await prisma.program.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.userRole.deleteMany();
  await prisma.rolePermission.deleteMany();
  await prisma.permission.deleteMany();
  await prisma.role.deleteMany();
  await prisma.user.deleteMany();
  await prisma.jobRun.deleteMany();
}

async function seedRolesAndUsers() {
  await prisma.role.createMany({
    data: [
      { code: AppRole.SUPER_ADMIN, key: "super_admin", name: "Super Admin", isSystem: true },
      { code: AppRole.SALES, key: "sales", name: "Satış təmsilçisi", isSystem: true },
      { code: AppRole.TEACHER, key: "teacher", name: "Müəllim", isSystem: true },
      { code: null, key: "marketing", name: "Marketing", isSystem: false },
    ],
  });

  await prisma.permission.createMany({
    data: permissionCatalog.map(([code, description]) => ({
      code,
      description,
    })),
  });

  const roles = await prisma.role.findMany();
  const permissions = await prisma.permission.findMany();
  const roleByCode = new Map(roles.map((role) => [role.code, role]));
  const roleByKey = new Map(roles.map((role) => [role.key, role]));
  const permissionByCode = new Map(permissions.map((permission) => [permission.code, permission]));

  const grants = [
    ...permissionCatalog.map(([code]) => ({ roleKey: "super_admin", code, scope: PermissionScope.ALL })),
    { roleKey: "sales", code: "dashboard.sales.read", scope: PermissionScope.ALL },
    { roleKey: "sales", code: "hr.bonus.read", scope: PermissionScope.ASSIGNED },
    { roleKey: "sales", code: "crm.lead.read", scope: PermissionScope.ALL },
    { roleKey: "sales", code: "crm.lead.create", scope: PermissionScope.ALL },
    { roleKey: "sales", code: "crm.lead.update", scope: PermissionScope.ASSIGNED },
    { roleKey: "sales", code: "crm.lead.delete", scope: PermissionScope.ASSIGNED },
    { roleKey: "sales", code: "crm.lead.convert", scope: PermissionScope.ASSIGNED },
    { roleKey: "sales", code: "student.read", scope: PermissionScope.ALL },
    { roleKey: "sales", code: "billing.payment.read", scope: PermissionScope.ALL },
    { roleKey: "sales", code: "billing.payment.create", scope: PermissionScope.ALL },
    { roleKey: "sales", code: "task.read", scope: PermissionScope.ASSIGNED },
    { roleKey: "sales", code: "task.manage", scope: PermissionScope.ASSIGNED },
    { roleKey: "sales", code: "playbook.read", scope: PermissionScope.ALL },
    { roleKey: "teacher", code: "dashboard.teacher.read", scope: PermissionScope.ALL },
    { roleKey: "teacher", code: "hr.bonus.read", scope: PermissionScope.ASSIGNED },
    { roleKey: "teacher", code: "group.read", scope: PermissionScope.ASSIGNED },
    { roleKey: "teacher", code: "attendance.read", scope: PermissionScope.ASSIGNED },
    { roleKey: "teacher", code: "attendance.manage", scope: PermissionScope.ASSIGNED },
    { roleKey: "teacher", code: "task.read", scope: PermissionScope.ASSIGNED },
    { roleKey: "teacher", code: "task.manage", scope: PermissionScope.ASSIGNED },
    { roleKey: "teacher", code: "playbook.read", scope: PermissionScope.ALL },
    { roleKey: "marketing", code: "dashboard.marketing.read", scope: PermissionScope.ALL },
    { roleKey: "marketing", code: "hr.bonus.read", scope: PermissionScope.ASSIGNED },
    { roleKey: "marketing", code: "marketing.read", scope: PermissionScope.ALL },
    { roleKey: "marketing", code: "marketing.manage", scope: PermissionScope.ALL },
    { roleKey: "marketing", code: "task.read", scope: PermissionScope.ASSIGNED },
    { roleKey: "marketing", code: "task.manage", scope: PermissionScope.ASSIGNED },
    { roleKey: "marketing", code: "playbook.read", scope: PermissionScope.ALL },
  ] as const;

  await prisma.rolePermission.createMany({
    data: grants.flatMap(({ roleKey, code, scope }) => {
      const role = roleByKey.get(roleKey);
      const permission = permissionByCode.get(code);

      return role && permission ? [{ roleId: role.id, permissionId: permission.id, scope }] : [];
    }),
  });

  const users = await prisma.user.createManyAndReturn({
    data: [
      {
        fullName: "Artmonia Owner",
        email: "owner@artmonia.local",
        phone: "+994501110101",
      },
      {
        fullName: "Operations Admin",
        email: "admin@artmonia.local",
        phone: "+994501110102",
      },
      {
        fullName: "Sales Manager",
        email: "sales@artmonia.local",
        phone: "+994501110103",
      },
      {
        fullName: "Finance Manager",
        email: "finance@artmonia.local",
        phone: "+994501110104",
      },
      {
        fullName: "Aysel H.",
        email: "aysel.teacher@artmonia.local",
        phone: "+994504421001",
      },
    ],
  });

  const userByEmail = new Map(users.map((user) => [user.email, user]));
  const assignments: Array<[string, AppRole]> = [
    ["owner@artmonia.local", AppRole.SUPER_ADMIN],
    ["sales@artmonia.local", AppRole.SALES],
    ["aysel.teacher@artmonia.local", AppRole.TEACHER],
  ];

  await prisma.userRole.createMany({
    data: assignments.flatMap(([email, roleCode]) => {
      const user = userByEmail.get(email);
      const role = roleByCode.get(roleCode);

      return user && role
        ? [
            {
              userId: user.id,
              roleId: role.id,
            },
          ]
        : [];
    }),
  });

  return {
    owner: userByEmail.get("owner@artmonia.local")!,
    admin: userByEmail.get("admin@artmonia.local")!,
    sales: userByEmail.get("sales@artmonia.local")!,
    finance: userByEmail.get("finance@artmonia.local")!,
    teacher: userByEmail.get("aysel.teacher@artmonia.local")!,
  };
}

async function seedTeachersAndPrograms(ownerId: string, teacherUserId: string) {
  const teacherSeed = [
    ["Aysel H.", "+994504421001", 44],
    ["Nigar R.", "+994504421002", 38],
    ["Rauf M.", "+994504421003", 32],
    ["Leyla S.", "+994504421004", 28],
  ] as const;

  const teachers: Teacher[] = [];

  for (const [fullName, phone, capacity] of teacherSeed) {
    const contact = await prisma.contact.create({
      data: {
        fullName,
        phoneDisplay: phone,
        phoneNormalized: phone.replace(/\D/g, ""),
        source: "teacher",
      },
    });

    const teacher = await prisma.teacher.create({
      data: {
        userId: teachers.length === 0 ? teacherUserId : undefined,
        contactId: contact.id,
        fullName,
        phone,
        capacity,
      },
    });

    await prisma.teacherContractRule.create({
      data: {
        teacherId: teacher.id,
        salaryPercent: "45.00",
        teacherBroughtPercent: "55.00",
        validFrom: month("2026-01"),
        createdById: ownerId,
      },
    });

    teachers.push(teacher);
  }

  const programSeed = [
    ["BASE", "Base Package", "200.00", 8],
    ["ABILITY", "Ability Exam", "240.00", 10],
    ["KIDS", "Kids Group", "180.00", 8],
    ["AMS", "Amsterdam", "320.00", 12],
    ["PRO", "Pro Package", "360.00", 12],
    ["ITALY", "Italy Program", "420.00", 14],
  ] as const;

  const programs = [];

  for (const [code, name, monthlyFee, lessons] of programSeed) {
    const program = await prisma.program.create({
      data: {
        code,
        name,
        defaultMonthlyFee: monthlyFee,
        defaultLessonsPerMonth: lessons,
        pricingVersions: {
          create: {
            monthlyFee,
            lessonsPerMonth: lessons,
            validFrom: month("2026-01"),
            createdById: ownerId,
          },
        },
      },
    });

    programs.push(program);
  }

  return {
    teachers,
    programs,
  };
}

async function seedStudentsAndFinance(input: {
  ownerId: string;
  adminId: string;
  salesId: string;
  financeId: string;
  teachers: Awaited<ReturnType<typeof seedTeachersAndPrograms>>["teachers"];
  programs: Awaited<ReturnType<typeof seedTeachersAndPrograms>>["programs"];
}) {
  const [aysel, nigar, rauf] = input.teachers;
  const [base, ability, kids, amsterdam, pro, italy] = input.programs;

  const studentSeed = [
    {
      code: "ART-1024",
      name: "Leyla Mammadova",
      phone: "+994 50 412 18 90",
      program: base,
      teacher: aysel,
      status: StudentLifecycleStatus.ACTIVE,
      registeredAt: "2026-03-12",
      monthlyFee: "200.00",
      invoice: { amount: "200.00", balanceDue: "0.00", status: InvoiceStatus.PAID, dueDate: "2026-06-12" },
      payment: { amount: "200.00", paidAt: "2026-06-10" },
    },
    {
      code: "ART-1041",
      name: "Murad Aliyev",
      phone: "+994 55 771 02 14",
      program: ability,
      teacher: nigar,
      status: StudentLifecycleStatus.DEBT,
      registeredAt: "2026-02-04",
      monthlyFee: "240.00",
      invoice: { amount: "240.00", balanceDue: "180.00", status: InvoiceStatus.OVERDUE, dueDate: "2026-06-04" },
      payment: { amount: "60.00", paidAt: "2026-06-05" },
    },
    {
      code: "ART-1068",
      name: "Amina Gasimli",
      phone: "+994 77 621 44 10",
      program: kids,
      teacher: null,
      status: StudentLifecycleStatus.SLOT_WAITING,
      registeredAt: "2026-06-18",
      monthlyFee: "180.00",
      invoice: { amount: "180.00", balanceDue: "130.00", status: InvoiceStatus.PARTIAL, dueDate: "2026-06-18" },
      payment: { amount: "50.00", paidAt: "2026-06-18" },
    },
    {
      code: "ART-1082",
      name: "Orkhan Safarli",
      phone: "+994 51 901 33 77",
      program: amsterdam,
      teacher: rauf,
      status: StudentLifecycleStatus.FROZEN,
      registeredAt: "2026-04-20",
      monthlyFee: "320.00",
      freezeReturnAt: "2026-06-20",
      billingPaused: true,
      invoice: { amount: "320.00", balanceDue: "0.00", status: InvoiceStatus.PAID, dueDate: "2026-05-20" },
      payment: { amount: "320.00", paidAt: "2026-05-18" },
    },
    {
      code: "ART-1115",
      name: "Zahra Karimova",
      phone: "+994 70 488 61 19",
      program: pro,
      teacher: aysel,
      status: StudentLifecycleStatus.ACTIVE,
      registeredAt: "2026-03-12",
      monthlyFee: "360.00",
      invoice: { amount: "360.00", balanceDue: "90.00", status: InvoiceStatus.PARTIAL, dueDate: "2026-06-12" },
      payment: { amount: "270.00", paidAt: "2026-06-12" },
    },
    {
      code: "ART-1130",
      name: "Tural Huseynov",
      phone: "+994 50 219 16 49",
      program: italy,
      teacher: nigar,
      status: StudentLifecycleStatus.DEBT,
      registeredAt: "2026-01-30",
      monthlyFee: "420.00",
      invoice: { amount: "420.00", balanceDue: "240.00", status: InvoiceStatus.OVERDUE, dueDate: "2026-05-30" },
      payment: { amount: "180.00", paidAt: "2026-06-01" },
    },
  ];

  const students = [];

  for (const seed of studentSeed) {
    const contact = await prisma.contact.create({
      data: {
        fullName: seed.name,
        phoneDisplay: seed.phone,
        phoneNormalized: seed.phone.replace(/\D/g, ""),
        source: "demo",
      },
    });

    const student = await prisma.student.create({
      data: {
        code: seed.code,
        contactId: contact.id,
        managerId: input.adminId,
        lifecycleStatus: seed.status,
        registeredAt: date(seed.registeredAt),
        freezeReturnAt: seed.freezeReturnAt ? date(seed.freezeReturnAt) : undefined,
        billingPaused: seed.billingPaused ?? false,
        statusHistory: {
          create: {
            newStatus: seed.status,
            reason: "Demo seed baseline",
            effectiveAt: date(seed.registeredAt),
            changedById: input.adminId,
          },
        },
      },
    });

    const enrollment = await prisma.enrollment.create({
      data: {
        studentId: student.id,
        programId: seed.program.id,
        teacherId: seed.teacher?.id,
        status: seed.status === StudentLifecycleStatus.FROZEN ? EnrollmentStatus.PAUSED : EnrollmentStatus.ACTIVE,
        startDate: date(seed.registeredAt),
        firstLessonAt: seed.status === StudentLifecycleStatus.SLOT_WAITING ? undefined : date(seed.registeredAt),
        monthlyFee: seed.monthlyFee,
        lessonsPerMonth: seed.program.defaultLessonsPerMonth,
      },
    });

    const invoice = await prisma.invoice.create({
      data: {
        studentId: student.id,
        enrollmentId: enrollment.id,
        periodMonth: month("2026-06"),
        issueDate: month("2026-06"),
        dueDate: date(seed.invoice.dueDate),
        amount: seed.invoice.amount,
        balanceDue: seed.invoice.balanceDue,
        status: seed.invoice.status,
        idempotencyKey: `demo-invoice-${seed.code}-2026-06`,
      },
    });

    const payment = await prisma.payment.create({
      data: {
        studentId: student.id,
        amount: seed.payment.amount,
        paidAt: date(seed.payment.paidAt),
        paymentMonth: month("2026-06"),
        method: PaymentMethod.CASH,
        createdById: input.financeId,
        idempotencyKey: `demo-payment-${seed.code}-2026-06`,
      },
    });

    await prisma.paymentAllocation.create({
      data: {
        paymentId: payment.id,
        invoiceId: invoice.id,
        amountAllocated: seed.payment.amount,
        mode:
          seed.status === StudentLifecycleStatus.SLOT_WAITING
            ? PaymentAllocationMode.MANUAL
            : PaymentAllocationMode.SELECTED_INVOICE,
      },
    });

    students.push({ student, enrollment, invoice, payment });
  }

  await prisma.refundAdjustment.create({
    data: {
      studentId: students[4].student.id,
      invoiceId: students[4].invoice.id,
      paymentId: students[4].payment.id,
      amount: "20.00",
      reason: "Demo correction request",
      status: ApprovalStatus.REQUESTED,
      requestedById: input.financeId,
    },
  });

  await prisma.teacherPayout.create({
    data: {
      teacherId: aysel.id,
      periodMonth: month("2026-06"),
      eligibleRevenue: "470.00",
      adjustmentAmount: "0.00",
      payoutAmount: "211.50",
      status: ApprovalStatus.REQUESTED,
      generatedById: input.financeId,
      lines: {
        create: [
          {
            enrollmentId: students[0].enrollment.id,
            paymentId: students[0].payment.id,
            eligibleRevenue: "200.00",
            payoutAmount: "90.00",
          },
          {
            enrollmentId: students[4].enrollment.id,
            paymentId: students[4].payment.id,
            eligibleRevenue: "270.00",
            payoutAmount: "121.50",
          },
        ],
      },
    },
  });

  await prisma.lead.create({
    data: {
      contact: {
        create: {
          fullName: "Farid Abbasov",
          phoneDisplay: "+994 55 310 88 12",
          phoneNormalized: "994553108812",
          source: "Instagram",
        },
      },
      source: "Instagram",
      sourceRef: "demo-lead-instagram-001",
      stage: LeadStage.QUALIFIED,
      manager: {
        connect: {
          id: input.salesId,
        },
      },
      programInterest: {
        connect: {
          id: pro.id,
        },
      },
      nextFollowUpAt: new Date("2026-06-12T13:00:00.000Z"),
      stageHistory: {
        create: {
          newStage: LeadStage.QUALIFIED,
          reason: "Demo qualified lead",
          changedBy: {
            connect: {
              id: input.salesId,
            },
          },
        },
      },
    },
  });

  await prisma.lead.create({
    data: {
      contact: {
        connect: {
          id: students[0].student.contactId,
        },
      },
      source: "Referral",
      sourceRef: "demo-converted-lead-001",
      stage: LeadStage.REGISTERED,
      manager: {
        connect: {
          id: input.salesId,
        },
      },
      programInterest: {
        connect: {
          id: base.id,
        },
      },
      convertedStudent: {
        connect: {
          id: students[0].student.id,
        },
      },
    },
  });

  return students;
}

async function seedSlotsAndJournal(input: {
  ownerId: string;
  students: Awaited<ReturnType<typeof seedStudentsAndFinance>>;
}) {
  const firstTeacherId = input.students[0].enrollment.teacherId;
  const secondTeacherId = input.students[3].enrollment.teacherId;
  if (!firstTeacherId || !secondTeacherId) return;

  const daytimeSlot = await prisma.classSlot.create({
    data: {
      teacherId: firstTeacherId,
      weekday: GroupWeekday.TUESDAY,
      shift: ClassShift.MORNING,
      startTime: "11:00",
      endTime: "14:00",
      room: "H1",
      capacity: 12,
      validFrom: date("2026-07-01"),
      createdById: input.ownerId,
    },
  });

  const afternoonSlot = await prisma.classSlot.create({
    data: {
      teacherId: secondTeacherId,
      weekday: GroupWeekday.MONDAY,
      shift: ClassShift.AFTERNOON,
      startTime: "15:00",
      endTime: "18:00",
      room: "H2",
      capacity: 10,
      validFrom: date("2026-07-01"),
      createdById: input.ownerId,
    },
  });

  const assignmentSeeds = [
    { slotId: daytimeSlot.id, row: input.students[0] },
    { slotId: daytimeSlot.id, row: input.students[1] },
    { slotId: daytimeSlot.id, row: input.students[4] },
    { slotId: afternoonSlot.id, row: input.students[3] },
    { slotId: afternoonSlot.id, row: input.students[5] },
  ];
  await prisma.studentScheduleAssignment.createMany({
    data: assignmentSeeds.map((seed) => ({
      slotId: seed.slotId,
      enrollmentId: seed.row.enrollment.id,
      validFrom: date("2026-07-01"),
      assignedById: input.ownerId,
    })),
  });

  const session = await prisma.slotSession.create({
    data: {
      slotId: afternoonSlot.id,
      sessionDate: date("2026-07-13"),
      startTime: afternoonSlot.startTime,
      endTime: afternoonSlot.endTime,
      createdById: input.ownerId,
    },
  });
  const afternoonAssignments = assignmentSeeds.filter((assignment) => assignment.slotId === afternoonSlot.id);

  await prisma.attendanceRecord.createMany({
    data: afternoonAssignments.map((assignment, index) => ({
      sessionId: session.id,
      enrollmentId: assignment.row.enrollment.id,
      teacherId: secondTeacherId,
      status: index === 0 ? AttendanceMark.PRESENT : AttendanceMark.ABSENT,
      markedById: input.ownerId,
    })),
  });
}

async function seedFinanceExpenseLedger(input: {
  ownerId: string;
  financeId: string;
  teachers: Awaited<ReturnType<typeof seedTeachersAndPrograms>>["teachers"];
}) {
  const categories = await prisma.financeExpenseCategory.createManyAndReturn({
    data: financeCategoryCatalog.map((category) => ({
      ...category,
      isSystem: true,
      isActive: true,
      requiresStaff: category.requiresStaff ?? false,
      requiresProject: category.requiresProject ?? false,
    })),
  });
  const categoryByCode = new Map(categories.map((category) => [category.code, category]));
  const employeeSalaryCategory = categoryByCode.get("OP_PAYROLL_SALES_ADMIN")!;
  const teacherSalaryCategory = categoryByCode.get("DC_TEACHER_COMP")!;
  const rentCategory = categoryByCode.get("OP_RENT")!;
  const marketingCategory = categoryByCode.get("OP_MARKETING_ADS")!;
  const [aysel] = input.teachers;

  await prisma.financeExpense.createMany({
    data: [
      {
        categoryId: employeeSalaryCategory.id,
        transactionType: FinanceTransactionType.EXPENSE,
        financialClass: FinanceFinancialClass.OPEX,
        costCenter: FinanceCostCenter.OPERATIONS,
        amount: "1200.00",
        expenseDate: date("2026-06-28"),
        method: PaymentMethod.BANK_TRANSFER,
        vendor: "Finance Manager",
        description: "Finance komandasinin ayliq statik maasi",
        employeeUserId: input.financeId,
        salaryMode: FinanceSalaryMode.STATIC,
        salaryBaseAmount: "1200.00",
        salaryCalculatedAmount: "1200.00",
        receiptReference: "PAYROLL-2026-06-FIN",
        createdById: input.ownerId,
      },
      {
        categoryId: teacherSalaryCategory.id,
        transactionType: FinanceTransactionType.EXPENSE,
        financialClass: FinanceFinancialClass.DIRECT_COST,
        costCenter: FinanceCostCenter.TEACHING,
        amount: "211.50",
        expenseDate: date("2026-06-28"),
        method: PaymentMethod.BANK_TRANSFER,
        vendor: aysel.fullName,
        description: "Muellim payout qaydasina esasen 45% hesablanmis maas",
        teacherId: aysel.id,
        salaryMode: FinanceSalaryMode.PERCENT,
        salaryPercent: "45.00",
        salaryBaseAmount: "470.00",
        salaryCalculatedAmount: "211.50",
        receiptReference: "PAYROLL-2026-06-AYS",
        createdById: input.financeId,
      },
      {
        categoryId: rentCategory.id,
        transactionType: FinanceTransactionType.EXPENSE,
        financialClass: FinanceFinancialClass.OPEX,
        costCenter: FinanceCostCenter.OPERATIONS,
        amount: "900.00",
        expenseDate: date("2026-06-05"),
        method: PaymentMethod.BANK_TRANSFER,
        vendor: "Studio landlord",
        description: "Iyun ayi studiya icaresi",
        receiptReference: "RENT-2026-06",
        createdById: input.financeId,
      },
      {
        categoryId: marketingCategory.id,
        transactionType: FinanceTransactionType.EXPENSE,
        financialClass: FinanceFinancialClass.OPEX,
        costCenter: FinanceCostCenter.MARKETING,
        amount: "280.00",
        expenseDate: date("2026-06-14"),
        method: PaymentMethod.CARD,
        vendor: "Meta Ads",
        description: "Instagram lead kampaniyası",
        receiptReference: "ADS-2026-06-14",
        createdById: input.financeId,
      },
    ],
  });
}

async function seedTasksTargetsAndAudit(input: {
  ownerId: string;
  adminId: string;
  salesId: string;
  financeId: string;
  firstStudentId: string;
}) {
  await prisma.task.createMany({
    data: [
      {
        title: "Call 7 overdue families",
        type: "debt_reminder",
        ownerUserId: input.financeId,
        status: TaskStatus.OPEN,
        dueAt: new Date("2026-06-12T10:00:00.000Z"),
        idempotencyKey: "demo-task-debt-2026-06-12",
        createdById: input.financeId,
      },
      {
        title: "Review frozen return dates",
        type: "freeze_return",
        ownerUserId: input.adminId,
        status: TaskStatus.OPEN,
        dueAt: new Date("2026-06-12T11:30:00.000Z"),
        idempotencyKey: "demo-task-freeze-2026-06-12",
        createdById: input.adminId,
      },
      {
        title: "Follow up with qualified Instagram lead",
        type: "lead_follow_up",
        ownerUserId: input.salesId,
        status: TaskStatus.OPEN,
        dueAt: new Date("2026-06-12T13:00:00.000Z"),
        idempotencyKey: "demo-task-lead-2026-06-12",
        createdById: input.salesId,
      },
    ],
  });

  await prisma.target.create({
    data: {
      periodMonth: month("2026-06"),
      targetAmount: "30000.00",
      ownerUserId: input.ownerId,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorUserId: input.adminId,
      action: "demo.seed.completed",
      entityType: "student",
      entityId: input.firstStudentId,
      afterJson: {
        message: "Demo ERP foundation seed completed",
      },
      reason: "Phase 1 foundation verification",
    },
  });

  await prisma.jobRun.create({
    data: {
      jobName: "demo_seed",
      status: "completed",
      finishedAt: new Date(),
      affectedRows: 1,
    },
  });
}

async function main() {
  await resetDemoData();
  const users = await seedRolesAndUsers();
  const catalog = await seedTeachersAndPrograms(users.owner.id, users.teacher.id);
  const students = await seedStudentsAndFinance({
    ownerId: users.owner.id,
    adminId: users.admin.id,
    salesId: users.sales.id,
    financeId: users.finance.id,
    teachers: catalog.teachers,
    programs: catalog.programs,
  });
  await seedSlotsAndJournal({
    ownerId: users.owner.id,
    students,
  });
  await seedFinanceExpenseLedger({
    ownerId: users.owner.id,
    financeId: users.finance.id,
    teachers: catalog.teachers,
  });

  await seedTasksTargetsAndAudit({
    ownerId: users.owner.id,
    adminId: users.admin.id,
    salesId: users.sales.id,
    financeId: users.finance.id,
    firstStudentId: students[0].student.id,
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("Artmonia demo seed completed.");
  })
  .catch(async (error) => {
    await prisma.$disconnect();
    console.error(error);
    process.exit(1);
  });
