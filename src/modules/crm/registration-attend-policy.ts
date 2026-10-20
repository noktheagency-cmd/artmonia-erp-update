import { Prisma } from "@/generated/prisma/client";
import { PublicActionError } from "@/server/actions/public-action-error";

/**
 * BK-18: when converting from a lead that has a scheduled meeting without
 * attendance, the registration window must confirm attendance (or refuse).
 * Direct admission (no appointment rows) does not invent attendance.
 */
export async function resolveRegistrationMeetingAttendance(
  tx: Prisma.TransactionClient,
  input: {
    leadId: string;
    confirmMeetingAttended: boolean;
    actorId: string;
    now?: Date;
  },
) {
  const appointments = await tx.crmAppointment.findMany({
    where: {
      leadId: input.leadId,
      kind: { in: ["MEETING", "CONSULTATION", "TRIAL"] },
    },
    orderBy: [{ plannedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      outcome: true,
      plannedAt: true,
      teacherId: true,
      kind: true,
    },
  });

  if (appointments.length === 0) {
    return { required: false as const, confirmed: false as const };
  }

  const alreadyAttended = appointments.some((row) => row.outcome === "ATTENDED");
  if (alreadyAttended) {
    return { required: false as const, confirmed: true as const };
  }

  const openScheduled = appointments.find((row) => row.outcome === "SCHEDULED");
  if (!openScheduled) {
    // NO_SHOW / CANCELLED only — direct-style completion is allowed without inventing attendance.
    return { required: false as const, confirmed: false as const };
  }

  if (!input.confirmMeetingAttended) {
    throw new PublicActionError(
      "Görüşdən qeydiyyata keçərkən eyni pəncərədə iştirakı təsdiqləyin.",
    );
  }

  const now = input.now ?? new Date();
  await tx.crmAppointment.update({
    where: { id: openScheduled.id },
    data: {
      outcome: "ATTENDED",
      occurredAt: now,
    },
  });

  return {
    required: true as const,
    confirmed: true as const,
    appointmentId: openScheduled.id,
  };
}

/** Lead alias must be `l`. */
export function leadNeedsMeetingAttendanceConfirmSql() {
  return Prisma.sql`(
    exists (
      select 1 from erp.crm_appointments a
      where a.lead_id = l.id
        and a.kind in ('MEETING', 'CONSULTATION', 'TRIAL')
        and a.outcome = 'SCHEDULED'
    )
    and not exists (
      select 1 from erp.crm_appointments a2
      where a2.lead_id = l.id
        and a2.kind in ('MEETING', 'CONSULTATION', 'TRIAL')
        and a2.outcome = 'ATTENDED'
    )
  )`;
}
