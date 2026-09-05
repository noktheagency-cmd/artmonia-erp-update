import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { PublicActionError } from "@/server/actions/public-action-error";
import { writeAuditLog } from "@/modules/audit/audit-service";
import type { CampaignInput, DeliveryResult } from "./contract";

type Db = Prisma.TransactionClient;
export type PushStudent = { id: string; name: string; code: string; programIds: string[] };
export type PushHistory = {
  id: string; title: string; body: string; category: string; author: string;
  scheduledAt: string; createdAt: string; cancelledAt: string | null;
  total: number; pending: number; processing: number; accepted: number; delivered: number;
  failed: number; skipped: number; cancelled: number;
};
export type PushPanelData = {
  students: PushStudent[];
  programs: { id: string; name: string }[];
  history: PushHistory[];
};

const eligible = Prisma.sql`
  a.status::text = 'ACTIVE' and s.lifecycle_status::text = 'ACTIVE'
  and exists (select 1 from erp.enrollments e where e.student_id=s.id and e.status::text='ACTIVE')
`;

export async function getPushPanelData(): Promise<PushPanelData> {
  const db = getPrisma();
  const [students, programs, history] = await Promise.all([
    db.$queryRaw<PushStudent[]>(Prisma.sql`
      select s.id::text, c.full_name as name, s.code,
        array(select e.program_id::text from erp.enrollments e where e.student_id=s.id and e.status::text='ACTIVE') as "programIds"
      from erp.student_mobile_accounts a join erp.students s on s.id=a.student_id
      join erp.contacts c on c.id=s.contact_id
      where ${eligible} order by c.full_name, s.id
    `),
    db.program.findMany({ where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.$queryRaw<PushHistory[]>(Prisma.sql`
      select c.id::text,c.title,c.body,c.category,u.full_name as author,
        to_char(c.scheduled_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "scheduledAt",
        to_char(c.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "createdAt",
        to_char(c.cancelled_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "cancelledAt",
        count(d.id)::int as total,
        count(d.id) filter(where d.state='pending')::int as pending,
        count(d.id) filter(where d.state='processing')::int as processing,
        count(d.id) filter(where d.state='accepted')::int as accepted,
        count(d.id) filter(where d.state='delivered')::int as delivered,
        count(d.id) filter(where d.state='failed')::int as failed,
        count(d.id) filter(where d.state='skipped')::int as skipped,
        count(d.id) filter(where d.state='cancelled')::int as cancelled
      from erp.mobile_push_campaigns c join erp.users u on u.id=c.created_by_id
      left join erp.mobile_push_deliveries d on d.campaign_id=c.id
      group by c.id,u.full_name order by c.created_at desc limit 50
    `),
  ]);
  return { students, programs, history };
}

export async function publishCampaign(db: Db, actorId: string, input: CampaignInput) {
  const { requestKey, ...content } = input;
  const hash = createHash("sha256").update(JSON.stringify(content)).digest("hex");
  const existing = await db.$queryRaw<{ id: string; requestHash: string; actorId: string }[]>(Prisma.sql`
    select id::text,request_hash as "requestHash",created_by_id::text as "actorId"
    from erp.mobile_push_campaigns where request_key=${requestKey}::uuid
  `);
  const replay = (row: typeof existing[number]) => {
    if (row.requestHash !== hash || row.actorId !== actorId)
      throw new PublicActionError("Bu göndəriş açarı fərqli məzmun üçün istifadə edilib.", "CONFLICT");
    return { id: row.id, repeated: true };
  };
  if (existing[0]) return replay(existing[0]);
  const now = new Date();
  const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : now;
  if (input.scheduledAt && (scheduledAt.getTime() < now.getTime() - 60000 ||
      scheduledAt.getTime() > now.getTime() + 90 * 86400000))
    throw new PublicActionError("Göndəriş vaxtı indi ilə növbəti 90 gün arasında olmalıdır.");
  const recipients = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    select a.id::text from erp.student_mobile_accounts a
    join erp.students s on s.id=a.student_id where ${eligible}
    ${input.audience === "program" ? Prisma.sql`and exists (
      select 1 from erp.enrollments e where e.student_id=s.id and e.status::text='ACTIVE' and e.program_id=${input.programId}::uuid
    )` : Prisma.empty}
    ${input.audience === "students" ? Prisma.sql`and s.id in (${Prisma.join(input.studentIds.map(id => Prisma.sql`${id}::uuid`))})` : Prisma.empty}
    order by a.id limit 10001
  `);
  if (!recipients.length) throw new PublicActionError("Aktiv mobil hesabı və aktiv proqramı olan alıcı tapılmadı.");
  if (recipients.length > 10000) throw new PublicActionError("Bir göndərişdə maksimum 10 000 alıcı ola bilər.");
  const id = randomUUID();
  const inserted = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    insert into erp.mobile_push_campaigns
      (id,created_by_id,request_key,request_hash,title,body,category,destination,link_url,image_url,priority,audience,scheduled_at,expires_at)
    values (${id}::uuid,${actorId}::uuid,${requestKey}::uuid,${hash},${input.title},${input.body},
      ${input.category},${input.destination},${input.destination === "external" ? input.linkUrl : null},
      ${input.imageUrl},${input.priority},${JSON.stringify({type:input.audience,programId:input.programId,studentIds:input.studentIds})}::jsonb,
      ${scheduledAt},${new Date(scheduledAt.getTime()+7*86400000)})
    on conflict(request_key) do nothing returning id::text
  `);
  if (!inserted.length) {
    const [row] = await db.$queryRaw<typeof existing>(Prisma.sql`
      select id::text,request_hash as "requestHash",created_by_id::text as "actorId"
      from erp.mobile_push_campaigns where request_key=${requestKey}::uuid
    `);
    return replay(row);
  }
  await db.$executeRaw(Prisma.sql`
    insert into erp.mobile_push_deliveries (campaign_id,mobile_account_id,available_at)
    select ${id}::uuid, x::uuid, ${scheduledAt}
    from unnest(${recipients.map(r => r.id)}::text[]) x
  `);
  await writeAuditLog(db, {
    actorUserId: actorId, action: "mobile.push.publish", entityType: "mobile_push_campaign", entityId: id,
    after: { title: input.title, audience: input.audience, recipientCount: recipients.length, scheduledAt: scheduledAt.toISOString() },
  });
  return { id, repeated: false };
}

export async function cancelCampaign(db: Db, actorId: string, id: string) {
  const rows = await db.$queryRaw<{ id: string }[]>(Prisma.sql`
    update erp.mobile_push_campaigns set cancelled_at=coalesce(cancelled_at,now())
    where id=${id}::uuid returning id::text
  `);
  if (!rows.length) throw new PublicActionError("Göndəriş tapılmadı.", "NOT_FOUND");
  await db.$executeRaw(Prisma.sql`
    update erp.mobile_push_deliveries set state='cancelled',updated_at=now()
    where campaign_id=${id}::uuid and state='pending'
  `);
  await writeAuditLog(db, { actorUserId: actorId, action: "mobile.push.cancel",
    entityType: "mobile_push_campaign", entityId: id });
}

export async function claimPushDeliveries(db: Db, limit: number) {
  // Expired leases become retryable. Terminal housekeeping prevents stuck campaigns.
  await db.$executeRaw(Prisma.sql`
    update erp.mobile_push_deliveries d set
      state=case when c.cancelled_at is not null then 'cancelled'
        when d.attempts>=5 then 'failed' else 'skipped' end,
      result_code=case when c.cancelled_at is not null then 'CANCELLED'
        when d.attempts>=5 then 'RETRY_EXHAUSTED'
        when c.expires_at<=now() then 'EXPIRED' else 'ACCOUNT_INACTIVE' end,
      updated_at=now()
    from erp.mobile_push_campaigns c,erp.student_mobile_accounts a,erp.students s
    where d.campaign_id=c.id and d.mobile_account_id=a.id and a.student_id=s.id
      and (d.state='pending' or (d.state='processing' and d.lease_until<=now()))
      and (c.cancelled_at is not null or c.expires_at<=now() or d.attempts>=5 or not (${eligible}))
  `);
  type Claimed = {
    id: string; campaignId: string; authUserId: string; leaseToken: string; leaseUntil: Date;
    attempts: number; title: string; body: string; category: string; destination: string;
    linkUrl: string | null; imageUrl: string | null; priority: string; expiresAt: Date; scheduledAt: Date;
  };
  const rows = await db.$queryRaw<Claimed[]>(Prisma.sql`
    with selected as (
      select d.id from erp.mobile_push_deliveries d join erp.mobile_push_campaigns c on c.id=d.campaign_id
      join erp.student_mobile_accounts a on a.id=d.mobile_account_id join erp.students s on s.id=a.student_id
      where (d.state='pending' or (d.state='processing' and d.lease_until<=now()))
        and d.available_at<=now() and c.scheduled_at<=now() and c.expires_at>now()
        and c.cancelled_at is null and d.attempts<5 and ${eligible}
      order by c.scheduled_at,d.id for update of d skip locked limit ${limit}
    ), claimed as (
      update erp.mobile_push_deliveries d set state='processing',attempts=d.attempts+1,
        lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes',updated_at=now()
      from selected where d.id=selected.id returning d.*
    )
    select d.id::text,d.campaign_id::text as "campaignId",a.auth_user_id::text as "authUserId",
      d.lease_token::text as "leaseToken",d.lease_until as "leaseUntil",d.attempts,
      c.title,c.body,c.category,c.destination,c.link_url as "linkUrl",c.image_url as "imageUrl",
      c.priority,c.expires_at as "expiresAt",c.scheduled_at as "scheduledAt"
    from claimed d join erp.mobile_push_campaigns c on c.id=d.campaign_id
    join erp.student_mobile_accounts a on a.id=d.mobile_account_id
  `);
  return { items: rows.map(row => ({
    deliveryId: row.id, recipientAuthUserId: row.authUserId, leaseToken: row.leaseToken,
    leaseExpiresAt: row.leaseUntil.toISOString(), attempt: row.attempts,
    notification: {
      id: "push:" + row.id, title: row.title, body: row.body, type: row.category,
      imageUrl: row.imageUrl, priority: row.priority, occurredAt: row.scheduledAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      data: { version: 1, event: "erp.push.published", notificationId: "push:" + row.id,
        campaignId: row.campaignId, destination: row.destination, url: row.linkUrl },
    },
  })), serverTime: new Date().toISOString() };
}

export async function acknowledgePush(db: Db, input: DeliveryResult) {
  const [delivery] = await db.$queryRaw<{
    state: string; leaseToken: string | null; attempts: number; cancelled: boolean; expired: boolean;
  }[]>(Prisma.sql`
    select d.state,d.lease_token::text as "leaseToken",d.attempts,
      c.cancelled_at is not null as cancelled,c.expires_at<=now() as expired
    from erp.mobile_push_deliveries d join erp.mobile_push_campaigns c on c.id=d.campaign_id
    where d.id=${input.deliveryId}::uuid for update of d
  `);
  if (!delivery) throw new PublicActionError("Göndəriş tapılmadı.", "NOT_FOUND");
  if (delivery.leaseToken !== input.leaseToken) throw new PublicActionError("Göndəriş kilidi dəyişib.", "CONFLICT");
  if (delivery.state === input.status || (input.status === "retry" && delivery.state === "pending"))
    return { id: input.deliveryId, status: delivery.state, repeated: true };
  if (delivery.state !== "processing" && !(delivery.state === "accepted" && ["delivered","failed"].includes(input.status)))
    throw new PublicActionError("Göndəriş artıq yekunlaşıb.", "CONFLICT");
  const state = input.status === "retry"
    ? delivery.cancelled ? "cancelled" : delivery.expired ? "skipped" : delivery.attempts>=5 ? "failed" : "pending"
    : input.status;
  const code = input.status === "retry" && delivery.attempts>=5 ? "RETRY_EXHAUSTED" : input.code ?? null;
  await db.$executeRaw(Prisma.sql`
    update erp.mobile_push_deliveries set state=${state},result_code=${code},
      provider_reference=coalesce(${input.providerReference ?? null},provider_reference),
      available_at=now()+(${Math.min(3600, 60 * 2 ** delivery.attempts)} * interval '1 second'),
      lease_until=null,updated_at=now() where id=${input.deliveryId}::uuid
  `);
  return { id: input.deliveryId, status: state, repeated: false };
}
