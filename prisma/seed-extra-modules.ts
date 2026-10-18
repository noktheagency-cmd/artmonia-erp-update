import {
  FinanceSalaryMode,
  HrCorporateCustomerStatus,
  HrNotificationCategory,
  HrNotificationPriority,
  HrStaffType,
  HrEmployeeStatus,
  KnowledgeContentStatus,
  KnowledgeSectionType,
  LessonStatus,
  MarketingCampaignStatus,
  MarketingContentAction,
  MarketingContentStatus,
  MarketingReportOutcome,
  PaymentMethod,
  PersonalNotificationType,
  PrismaClient,
  StudentLifecycleStatus,
  WorkshopContactChannel,
  WorkshopEventStatus,
  WorkshopEventType,
  WorkshopFollowUpAction,
  WorkshopFollowUpOutcome,
  WorkshopFollowUpPriority,
  WorkshopFollowUpStatus,
  type Enrollment,
  type Invoice,
  type Payment,
  type Student,
} from "../src/generated/prisma/client";

type StudentRow = {
  student: Student;
  enrollment: Enrollment;
  invoice: Invoice;
  payment: Payment;
};

function date(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function month(value: string) {
  return date(`${value}-01`);
}

/** Wipe extra-module demo rows (FK-safe order). */
export async function resetExtraModules(prisma: PrismaClient) {
  await prisma.workshopFollowUpActivity.deleteMany();
  await prisma.workshopParticipantFollowUp.deleteMany();
  await prisma.workshopPayment.deleteMany();
  await prisma.workshopParticipant.deleteMany();
  await prisma.workshopEvent.deleteMany();

  await prisma.homeworkCompletion.deleteMany();
  await prisma.lessonHomework.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.programLessonMaterial.deleteMany();
  await prisma.programLessonTopic.deleteMany();
  await prisma.academyAnnouncement.deleteMany();

  await prisma.marketingContentActivity.deleteMany();
  await prisma.marketingContentItem.deleteMany();
  await prisma.marketingStrategyExpense.deleteMany();
  await prisma.marketingStrategy.deleteMany();
  await prisma.marketingCampaignReport.deleteMany();
  await prisma.marketingCampaignStat.deleteMany();
  await prisma.marketingAdStat.deleteMany();
  await prisma.marketingAd.deleteMany();
  await prisma.marketingAdSet.deleteMany();
  await prisma.marketingCampaign.deleteMany();

  await prisma.knowledgeArticleAudience.deleteMany();
  await prisma.knowledgeArticle.deleteMany();
  await prisma.knowledgeCategoryAudience.deleteMany();
  await prisma.knowledgeCategory.deleteMany();

  await prisma.hrStaffNotification.deleteMany();
  await prisma.hrEmployeeNote.deleteMany();
  await prisma.hrCorporateContact.deleteMany();
  await prisma.hrCorporateCustomer.deleteMany();
  await prisma.hrBonusAward.deleteMany();
  await prisma.hrBonusProgressAdjustment.deleteMany();
  await prisma.hrBonusTeacherCohort.deleteMany();
  await prisma.hrBonusParticipant.deleteMany();
  await prisma.hrBonusTeacherChurnRule.deleteMany();
  await prisma.hrBonusStage.deleteMany();
  await prisma.hrBonusCampaign.deleteMany();
  await prisma.hrEmployee.deleteMany();

  await prisma.crmAppointment.deleteMany();
  await prisma.leadWorkItem.deleteMany();
  await prisma.leadContactEvent.deleteMany();

  // Sale-linked payments are protected by DB triggers; bypass for local demo reset only.
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);
    await tx.$executeRawUnsafe(
      `UPDATE erp.payments SET course_sale_id = NULL, receipt_purpose = 'UNCLASSIFIED' WHERE course_sale_id IS NOT NULL`,
    );
    await tx.$executeRawUnsafe(`DELETE FROM erp.course_sales`);
  });

  await prisma.studentFreezePeriod.deleteMany();
  await prisma.studentRelationship.deleteMany();
  await prisma.teacherAssignmentHistory.deleteMany();

  await prisma.companyMonthlyTarget.deleteMany();
  await prisma.companyKpiPlan.deleteMany();
  await prisma.personalNotification.deleteMany();
}

export async function seedCourseSalesAndCrm(
  prisma: PrismaClient,
  input: {
    ownerId: string;
    salesId: string;
    adminId: string;
    students: StudentRow[];
    teachers: Array<{ id: string }>;
  },
) {
  // Enable admission tracking so sales journal matches BK-21 demo path.
  await prisma.student.updateMany({
    data: { admissionTracking: true },
  });

  const leads = await prisma.lead.findMany({ orderBy: { createdAt: "asc" } });
  const openLead = leads.find((l) => l.stage !== "REGISTERED") ?? leads[0];
  const convertedLead = leads.find((l) => l.stage === "REGISTERED") ?? leads[1];

  for (const row of input.students) {
    // Skip FROZEN for sale creation rules (ACTIVE/SLOT_WAITING only in product path).
    if (
      row.student.lifecycleStatus !== StudentLifecycleStatus.ACTIVE &&
      row.student.lifecycleStatus !== StudentLifecycleStatus.SLOT_WAITING
    ) {
      continue;
    }

    const amount = Number(row.payment.amount);
    if (amount < 20) continue;

    const fee = Number(row.enrollment.monthlyFee);
    const status = amount >= fee ? "COMPLETE" : "DEPOSIT";
    const leadId =
      convertedLead && convertedLead.convertedStudentId === row.student.id
        ? convertedLead.id
        : null;

    const sale = await prisma.courseSale.create({
      data: {
        studentId: row.student.id,
        enrollmentId: row.enrollment.id,
        ownerId: row.student.managerId ?? input.adminId,
        leadId,
        cycleKey: `new:${row.student.id}`,
        kind: "NEW",
        route: leadId ? "CRM" : "DIRECT",
        qualifiedAt: row.payment.paidAt,
        contractConfirmedAt: new Date(`${row.payment.paidAt.toISOString().slice(0, 10)}T12:00:00.000Z`),
        initialFee: row.enrollment.monthlyFee,
        status,
      },
    });

    await prisma.payment.update({
      where: { id: row.payment.id },
      data: {
        courseSaleId: sale.id,
        receiptPurpose: "ADMISSION",
      },
    });
  }

  // Freeze period for the FROZEN demo student (Orkhan).
  const frozen = input.students.find(
    (s) => s.student.lifecycleStatus === StudentLifecycleStatus.FROZEN,
  );
  if (frozen) {
    await prisma.studentFreezePeriod.create({
      data: {
        id: crypto.randomUUID(),
        studentId: frozen.student.id,
        startDate: date("2026-05-21"),
        endDate: date("2026-06-20"),
        note: "Demo: yay mövsümü dondurma",
        createdById: input.adminId,
      },
    });
  }

  // Parent/payer contact relationship for first student.
  await prisma.studentRelationship.create({
    data: {
      studentId: input.students[0].student.id,
      relatedContactId: input.students[1].student.contactId,
      relationshipType: "SIBLING_CONTACT",
      isPayer: false,
      isPrimaryContact: false,
    },
  });

  if (input.students[0].enrollment.teacherId) {
    await prisma.teacherAssignmentHistory.create({
      data: {
        enrollmentId: input.students[4].enrollment.id,
        oldTeacherId: null,
        newTeacherId: input.students[0].enrollment.teacherId,
        reason: "Demo ilk təyinat",
        changedById: input.adminId,
      },
    });
  }

  if (openLead) {
    const contactEvent = await prisma.leadContactEvent.create({
      data: {
        leadId: openLead.id,
        contactId: openLead.contactId,
        actorId: input.salesId,
        channel: "PHONE",
        outcome: "TALKED",
        occurredAt: new Date("2026-06-10T10:30:00.000Z"),
        note: "Demo: ilk zəng — maraqlıdır",
        idempotencyKey: crypto.randomUUID(),
      },
    });
    void contactEvent;

    // Only one open PRIMARY work item per lead (lead_work_primary_open_key).
    const workItem = await prisma.leadWorkItem.create({
      data: {
        leadId: openLead.id,
        ownerId: input.salesId,
        kind: "CALL",
        source: "PRIMARY",
        plannedAt: new Date("2026-06-12T13:00:00.000Z"),
        completedAt: new Date("2026-06-10T10:35:00.000Z"),
        completedById: input.salesId,
        result: "TALKED",
      },
    });
    void workItem;

    const reminder = await prisma.leadWorkItem.create({
      data: {
        leadId: openLead.id,
        ownerId: input.salesId,
        kind: "APPOINTMENT",
        source: "APPOINTMENT_REMINDER",
        plannedAt: new Date("2026-06-13T15:00:00.000Z"),
      },
    });

    await prisma.crmAppointment.create({
      data: {
        leadId: openLead.id,
        ownerId: input.salesId,
        teacherId: input.teachers[0]?.id,
        kind: "CONSULTATION",
        outcome: "SCHEDULED",
        plannedAt: new Date("2026-06-13T15:00:00.000Z"),
        reminderWorkId: reminder.id,
        idempotencyKey: `demo-appt-${openLead.id}`,
      },
    });
  }
}

export async function seedHrAndKnowledge(
  prisma: PrismaClient,
  input: {
    ownerId: string;
    adminId: string;
    salesId: string;
    financeId: string;
    teacherUserId: string;
    teachers: Array<{ id: string; fullName?: string }>;
  },
) {
  const adminEmployee = await prisma.hrEmployee.create({
    data: {
      userId: input.adminId,
      staffType: HrStaffType.EMPLOYEE,
      fullName: "Operations Admin",
      email: "admin@artmonia.local",
      phone: "+994501110102",
      department: "Operations",
      position: "Admin",
      hireDate: date("2024-01-15"),
      status: HrEmployeeStatus.ACTIVE,
      salaryMode: FinanceSalaryMode.STATIC,
      salaryAmount: "1800.00",
      createdById: input.ownerId,
    },
  });

  const salesEmployee = await prisma.hrEmployee.create({
    data: {
      userId: input.salesId,
      staffType: HrStaffType.EMPLOYEE,
      fullName: "Sales Manager",
      email: "sales@artmonia.local",
      phone: "+994501110103",
      department: "Sales",
      position: "Sales Manager",
      hireDate: date("2024-03-01"),
      status: HrEmployeeStatus.ACTIVE,
      salaryMode: FinanceSalaryMode.STATIC,
      salaryAmount: "1500.00",
      createdById: input.ownerId,
    },
  });

  await prisma.hrEmployee.create({
    data: {
      userId: input.financeId,
      staffType: HrStaffType.EMPLOYEE,
      fullName: "Finance Manager",
      email: "finance@artmonia.local",
      department: "Finance",
      position: "Finance Manager",
      hireDate: date("2024-02-01"),
      status: HrEmployeeStatus.ACTIVE,
      salaryMode: FinanceSalaryMode.STATIC,
      salaryAmount: "1600.00",
      createdById: input.ownerId,
    },
  });

  if (input.teachers[0]) {
    await prisma.hrEmployee.create({
      data: {
        userId: input.teacherUserId,
        teacherId: input.teachers[0].id,
        staffType: HrStaffType.TEACHER,
        fullName: "Aysel H.",
        email: "aysel.teacher@artmonia.local",
        department: "Teaching",
        position: "Senior Teacher",
        hireDate: date("2023-09-01"),
        status: HrEmployeeStatus.ACTIVE,
        salaryMode: FinanceSalaryMode.PERCENT,
        salaryAmount: "0.00",
        salaryPercent: "45.00",
        createdById: input.ownerId,
      },
    });
  }

  await prisma.hrEmployeeNote.create({
    data: {
      employeeId: adminEmployee.id,
      title: "Onboarding qeydi",
      content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Demo HR qeydi" }] }] },
      createdById: input.ownerId,
    },
  });

  await prisma.hrStaffNotification.create({
    data: {
      employeeId: salesEmployee.id,
      creatorUserId: input.ownerId,
      category: HrNotificationCategory.INFORMATION,
      priority: HrNotificationPriority.NORMAL,
      title: "Həftəlik satış targeti",
      message: "Bu həftə 8 yeni qəbul hədəfi var.",
    },
  });

  const customer = await prisma.hrCorporateCustomer.create({
    data: {
      name: "Demo Korporativ Müştəri MMC",
      taxId: "DEMO-TAX-001",
      status: HrCorporateCustomerStatus.ACTIVE,
      monthlyBudget: "2500.00",
      contractValue: "30000.00",
      paymentDate: date("2026-06-25"),
      note: "Demo B2B müqavilə",
      createdById: input.ownerId,
    },
  });

  await prisma.hrCorporateContact.create({
    data: {
      customerId: customer.id,
      fullName: "Nigar Corporate",
      position: "HR Partner",
      phone: "+994501221100",
      email: "nigar.corp@example.com",
      isPrimary: true,
    },
  });

  const section =
    (await prisma.knowledgeSection.findFirst({ orderBy: { position: "asc" } })) ??
    (await prisma.knowledgeSection.create({
      data: {
        key: "playbook",
        name: "Playbook",
        type: KnowledgeSectionType.PLAYBOOK,
        position: 1,
        status: KnowledgeContentStatus.PUBLISHED,
      },
    }));

  const category = await prisma.knowledgeCategory.create({
    data: {
      sectionId: section.id,
      name: "Satış prosesi",
      position: 1,
      status: KnowledgeContentStatus.PUBLISHED,
      createdById: input.ownerId,
    },
  });

  await prisma.knowledgeCategoryAudience.create({
    data: {
      categoryId: category.id,
      employeeId: salesEmployee.id,
    },
  });

  const article = await prisma.knowledgeArticle.create({
    data: {
      categoryId: category.id,
      title: "Yeni qəbul checklist",
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "1) Müraciət 2) Görüş 3) Müqavilə 4) Ödəniş" }],
          },
        ],
      },
      plainText: "1) Müraciət 2) Görüş 3) Müqavilə 4) Ödəniş",
      position: 1,
      status: KnowledgeContentStatus.PUBLISHED,
      createdById: input.ownerId,
    },
  });

  await prisma.knowledgeArticleAudience.create({
    data: {
      articleId: article.id,
      employeeId: adminEmployee.id,
    },
  });
}

export async function seedMarketing(
  prisma: PrismaClient,
  input: { ownerId: string; salesId: string },
) {
  const campaign = await prisma.marketingCampaign.create({
    data: {
      name: "Demo Instagram Summer 2026",
      channel: "Instagram",
      owner: "Sales",
      objective: "Leads",
      status: MarketingCampaignStatus.ACTIVE,
      budget: "1200.00",
      startsAt: date("2026-06-01"),
      endsAt: date("2026-06-30"),
      createdById: input.ownerId,
      notes: "Demo kampaniya",
    },
  });

  await prisma.marketingCampaignStat.create({
    data: {
      campaignId: campaign.id,
      recordedOn: date("2026-06-10"),
      spend: "45.00",
      impressions: 12000,
      clicks: 340,
      leads: 18,
      conversations: 22,
    },
  });

  await prisma.marketingCampaignReport.create({
    data: {
      campaignId: campaign.id,
      outcome: MarketingReportOutcome.SUCCESSFUL,
      notes: "Demo: lead axını sabitdir",
      createdById: input.ownerId,
    },
  });

  const content = await prisma.marketingContentItem.create({
    data: {
      title: "Summer workshop reel",
      platform: "Instagram",
      format: "REEL",
      scheduledAt: new Date("2026-06-14T16:00:00.000Z"),
      responsibleUserId: input.salesId,
      campaignId: campaign.id,
      caption: "Demo caption — yay workshop",
      status: MarketingContentStatus.ACTIVE,
      createdById: input.ownerId,
      approvedById: input.ownerId,
      approvedAt: new Date("2026-06-12T10:00:00.000Z"),
    },
  });

  await prisma.marketingContentActivity.create({
    data: {
      contentId: content.id,
      action: MarketingContentAction.APPROVED,
      actorUserId: input.ownerId,
      note: "Demo approve",
    },
  });

  const strategy = await prisma.marketingStrategy.create({
    data: {
      name: "Q3 Growth",
      month: month("2026-06"),
      objective: "Artırılmış qəbul",
      status: "ACTIVE",
      responsibleUserId: input.salesId,
      salesGoal: 40,
      leadGoal: 200,
      revenueGoal: "50000.00",
      budget: "5000.00",
      createdById: input.ownerId,
    },
  });

  await prisma.marketingStrategyExpense.create({
    data: {
      strategyId: strategy.id,
      title: "Meta ads",
      category: "PAID_SOCIAL",
      amount: "800.00",
      spentOn: date("2026-06-08"),
      createdById: input.ownerId,
    },
  });

  // Attach an open lead to the campaign if possible.
  const openLead = await prisma.lead.findFirst({
    where: { stage: { not: "REGISTERED" } },
  });
  if (openLead) {
    await prisma.lead.update({
      where: { id: openLead.id },
      data: { campaignId: campaign.id },
    });
  }
}

export async function seedProgramsLessonsHomework(
  prisma: PrismaClient,
  input: {
    ownerId: string;
    students: StudentRow[];
    programs: Array<{ id: string }>;
  },
) {
  const program = input.programs[0];
  if (!program) return;

  const topic = await prisma.programLessonTopic.create({
    data: {
      programId: program.id,
      sequence: 1,
      title: "Giriş və materiallar",
    },
  });

  await prisma.programLessonMaterial.create({
    data: {
      topicId: topic.id,
      sequence: 1,
      subject: "Akvarel əsasları",
      objective: "Kağız və fırça seçimi",
      homework: "Evdə 1 skets çək",
    },
  });

  await prisma.academyAnnouncement.create({
    data: {
      programId: program.id,
      title: "Yay cədvəli",
      body: "Demo: iyul ayında dərs saatları dəyişmir.",
      publishedAt: date("2026-06-01"),
      createdById: input.ownerId,
    },
  });

  const row = input.students[0];
  if (row?.enrollment.teacherId) {
    await prisma.lesson.create({
      data: {
        studentId: row.student.id,
        enrollmentId: row.enrollment.id,
        teacherId: row.enrollment.teacherId,
        lessonDate: date("2026-06-11"),
        startTime: "11:00",
        durationMinutes: 90,
        room: "H1",
        status: LessonStatus.ATTENDED,
        note: "Demo fərdi dərs",
        createdById: input.ownerId,
      },
    });
  }

  const session = await prisma.slotSession.findFirst({
    orderBy: { createdAt: "asc" },
  });
  if (session) {
    const homework = await prisma.lessonHomework.create({
      data: {
        sessionId: session.id,
        title: "Demo ev tapşırığı",
        description: "Rəng dairəsi çək",
        dueAt: new Date("2026-06-18T18:00:00.000Z"),
        createdById: input.ownerId,
      },
    });

    await prisma.homeworkCompletion.create({
      data: {
        homeworkId: homework.id,
        enrollmentId: input.students[0].enrollment.id,
      },
    });
  }
}

export async function seedWorkshops(
  prisma: PrismaClient,
  input: { ownerId: string; salesId: string; students: StudentRow[] },
) {
  const event = await prisma.workshopEvent.create({
    data: {
      title: "Demo Yay Workshop",
      eventType: WorkshopEventType.WORKSHOP,
      category: "Painting",
      status: WorkshopEventStatus.SCHEDULED,
      eventDate: date("2026-06-21"),
      startTime: "15:00",
      durationMinutes: 120,
      room: "Studio A",
      instructor: "Aysel H.",
      capacity: 12,
      entryPrice: "40.00",
      note: "Demo workshop",
      createdById: input.ownerId,
    },
  });

  const participant = await prisma.workshopParticipant.create({
    data: {
      eventId: event.id,
      studentId: input.students[0].student.id,
      fullName: "Leyla Mammadova",
      phone: "+994504121890",
      paymentMethod: PaymentMethod.CASH,
      listPrice: "40.00",
      amountPaid: "40.00",
      isPaid: true,
      assignedById: input.salesId,
    },
  });

  await prisma.workshopPayment.create({
    data: {
      eventId: event.id,
      participantId: participant.id,
      amount: "40.00",
      paidAt: date("2026-06-15"),
      method: PaymentMethod.CASH,
      payerName: "Leyla Mammadova",
      createdById: input.salesId,
    },
  });

  // Prospect follow-up (no participant link) — avoids unique(participant, targetEvent) if auto-created.
  const followUp = await prisma.workshopParticipantFollowUp.create({
    data: {
      targetEventId: event.id,
      fullName: "Demo Prospect",
      phone: "+994507001122",
      status: WorkshopFollowUpStatus.INTERESTED,
      nextAction: WorkshopFollowUpAction.SEND_OFFER,
      outcome: WorkshopFollowUpOutcome.POSITIVE_RESPONSE,
      contactChannel: WorkshopContactChannel.WHATSAPP,
      priority: WorkshopFollowUpPriority.NORMAL,
      nextFollowUpAt: new Date("2026-06-22T12:00:00.000Z"),
      assignedToId: input.salesId,
      createdById: input.ownerId,
      note: "Demo follow-up",
    },
  });
  void participant;

  await prisma.workshopFollowUpActivity.create({
    data: {
      followUpId: followUp.id,
      activityType: "NOTE",
      status: WorkshopFollowUpStatus.INTERESTED,
      nextAction: WorkshopFollowUpAction.SEND_OFFER,
      outcome: WorkshopFollowUpOutcome.POSITIVE_RESPONSE,
      contactChannel: WorkshopContactChannel.WHATSAPP,
      note: "Demo activity",
      actorUserId: input.salesId,
    },
  });
}

export async function seedTargetsAndNotifications(
  prisma: PrismaClient,
  input: { ownerId: string; adminId: string; salesId: string },
) {
  const plan = await prisma.companyKpiPlan.create({
    data: {
      name: "2026 H2 Plan",
      startMonth: month("2026-07"),
      endMonth: month("2026-12"),
      durationMonths: 6,
      activeStudentsTarget: 180,
      newSalesTarget: 40,
      churnMaxTarget: 8,
      leadTarget: 250,
      conversionTarget: "18.00",
      revenueTarget: "120000.00",
      createdById: input.ownerId,
    },
  });

  await prisma.companyMonthlyTarget.create({
    data: {
      periodMonth: month("2026-06"),
      activeStudentsTarget: 160,
      newSalesTarget: 35,
      churnMaxTarget: 6,
      leadTarget: 200,
      conversionTarget: "16.00",
      revenueTarget: "45000.00",
      planId: plan.id,
      createdById: input.ownerId,
    },
  });

  await prisma.personalNotification.create({
    data: {
      recipientUserId: input.salesId,
      type: PersonalNotificationType.SYSTEM,
      title: "Demo: sales journal hazırdır",
      message: "Course sales və CRM seed yükləndi.",
      href: "/crm",
      dedupeKey: "demo-seed-sales-ready",
    },
  });

  await prisma.personalNotification.create({
    data: {
      recipientUserId: input.adminId,
      type: PersonalNotificationType.DOCUMENT,
      title: "Playbook yeniləndi",
      message: "Yeni qəbul checklist məqaləsi əlavə olundu.",
      href: "/knowledge",
      dedupeKey: "demo-seed-knowledge-ready",
    },
  });
}
