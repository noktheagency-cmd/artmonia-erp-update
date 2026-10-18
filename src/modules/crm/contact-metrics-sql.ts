import { Prisma } from "@/generated/prisma/client";

/**
 * BK-19: factual contact events (not stage history).
 * Lead alias must be `l`.
 */
export function leadHadRealContactSql() {
  return Prisma.sql`exists (
    select 1
    from erp.lead_contact_events e
    where e.lead_id = l.id
      and e.outcome in ('TALKED', 'ANSWERED_NO_TALK', 'WHATSAPP_REPLIED')
  )`;
}

export function leadHadPhoneTalkSql() {
  return Prisma.sql`exists (
    select 1
    from erp.lead_contact_events e
    where e.lead_id = l.id
      and e.channel = 'PHONE'
      and e.outcome = 'TALKED'
  )`;
}

export function leadHadPhoneAnsweredSql() {
  return Prisma.sql`exists (
    select 1
    from erp.lead_contact_events e
    where e.lead_id = l.id
      and e.channel = 'PHONE'
      and e.outcome in ('TALKED', 'ANSWERED_NO_TALK')
  )`;
}

export function leadHadPhoneAttemptSql() {
  return Prisma.sql`exists (
    select 1
    from erp.lead_contact_events e
    where e.lead_id = l.id
      and e.channel = 'PHONE'
  )`;
}

export function leadHadWhatsappReplySql() {
  return Prisma.sql`exists (
    select 1
    from erp.lead_contact_events e
    where e.lead_id = l.id
      and e.outcome = 'WHATSAPP_REPLIED'
  )`;
}

/**
 * BK-16: combined meeting = any consultation or trial appointment row.
 * Lead alias must be `l`.
 */
export function leadHadMeetingScheduledSql() {
  return Prisma.sql`exists (
    select 1
    from erp.crm_appointments a
    where a.lead_id = l.id
      and a.kind in ('CONSULTATION', 'TRIAL')
  )`;
}

export function leadHadMeetingAttendedSql() {
  return Prisma.sql`exists (
    select 1
    from erp.crm_appointments a
    where a.lead_id = l.id
      and a.kind in ('CONSULTATION', 'TRIAL')
      and a.outcome = 'ATTENDED'
  )`;
}
