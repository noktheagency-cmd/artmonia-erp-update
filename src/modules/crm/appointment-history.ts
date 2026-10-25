export type AppointmentHistoryRow = {
  id: string;
  plannedAt: string;
  occurredAt: string | null;
  kind: string;
  outcome: string;
  teacherId: string | null;
  isLegacy: boolean;
  previousId: string | null;
  source: "APPOINTMENT" | "LEAD_PLAN";
};

type LeadMeetingPlan = {
  id: string;
  stage: string;
  convertedStudentId: string | null;
  nextActionType: string | null;
  nextFollowUpAt: Date | null;
};

export function isMeetingReminder(kind: string | null | undefined) {
  return kind === "CONSULTATION_REMINDER" || kind === "TRIAL_LESSON_REMINDER";
}

export function appointmentOutcomeTarget(row: AppointmentHistoryRow): Record<string, string> {
  return row.source === "LEAD_PLAN" ? { leadPlanAt: row.plannedAt } : { appointmentId: row.id };
}

function bakuDay(date: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Baku" }).format(date);
}

/** Read-only compatibility for meeting plans saved before appointment records existed. */
export function appointmentHistory(
  appointments: Omit<AppointmentHistoryRow, "source">[],
  lead: LeadMeetingPlan,
): AppointmentHistoryRow[] {
  const rows: AppointmentHistoryRow[] = appointments.map((row) => ({ ...row, source: "APPOINTMENT" }));
  const plannedAt = lead.nextFollowUpAt;
  if (plannedAt && isMeetingReminder(lead.nextActionType)
    && !lead.convertedStudentId && !["REGISTERED", "LOST"].includes(lead.stage)
    // A real appointment, including its final outcome, takes precedence over a stale reminder.
    && !rows.some((row) => row.outcome === "SCHEDULED" || bakuDay(new Date(row.plannedAt)) === bakuDay(plannedAt))) {
    rows.push({
      id: `lead-plan:${lead.id}`,
      plannedAt: plannedAt.toISOString(),
      occurredAt: null,
      kind: lead.nextActionType === "TRIAL_LESSON_REMINDER" ? "TRIAL" : "CONSULTATION",
      outcome: "SCHEDULED",
      teacherId: null,
      isLegacy: true,
      previousId: null,
      source: "LEAD_PLAN",
    });
  }
  return rows.sort((first, second) => second.plannedAt.localeCompare(first.plannedAt));
}
