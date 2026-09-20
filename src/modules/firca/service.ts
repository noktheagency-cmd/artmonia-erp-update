import "server-only";
import { createHash } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { MobilePortalError } from "@/modules/mobile/mobile-portal-errors";
import {
  bakuMonth,
  monthBounds,
  normalizeComment,
  qualifiesComment,
  type CommentEvent,
} from "./contract";

export type FircaDb = Prisma.TransactionClient;
export type FircaSettings = {
  enabled: boolean;
  startsAt: Date | null;
  minCommentLength: number;
  attendancePoints: number;
  homeworkPoints: number;
  commentPoints: number;
  weeklyCommentLimit: number;
};
export async function settings(db: FircaDb = getPrisma()) {
  const [row] = await db.$queryRaw<
    FircaSettings[]
  >`select enabled,starts_at as "startsAt",min_comment_length as "minCommentLength",attendance_points as "attendancePoints",homework_points as "homeworkPoints",comment_points as "commentPoints",weekly_comment_limit as "weeklyCommentLimit" from erp.firca_settings where id=1`;
  return row;
}
export async function setBalance(
  db: FircaDb,
  student: string,
  source: string,
  sourceId: string,
  points: number,
  reason: string,
  actor: string | null = null,
) {
  const [row] = await db.$queryRaw<
    { delta: number }[]
  >`select erp.firca_set_balance(${student}::uuid,${source},${sourceId}::uuid,${points}::integer,${reason},${actor}::uuid) as delta`;
  return row.delta;
}
export async function getFircaSummary(studentId: string, month = bakuMonth()) {
  const db = getPrisma();
  const { start, end } = monthBounds(month);
  const [cfg, rows, excluded] = await Promise.all([
    settings(db),
    db.$queryRaw<
      { lifetime: number; monthly: number }[]
    >`select coalesce(sum(l.delta),0)::int as lifetime,coalesce(sum(l.delta) filter(where l.occurred_at>=${start} and l.occurred_at<${end}),0)::int as monthly from erp.firca_awards a join erp.firca_ledger l on l.award_id=a.id where a.student_id=${studentId}::uuid`,
    db.$queryRaw<
      { excluded: boolean }[]
    >`select not erp.firca_student_eligible(${studentId}::uuid) as excluded`,
  ]);
  return {
    currency: "firca",
    monthly: rows[0].monthly,
    lifetime: rows[0].lifetime,
    month,
    enabled: cfg.enabled,
    startsAt: cfg.startsAt?.toISOString() ?? null,
    excludedFromLeaderboard: excluded[0].excluded,
    rules: {
      attendance: cfg.attendancePoints,
      homework: cfg.homeworkPoints,
      comment: cfg.commentPoints,
      weeklyCommentLimit: cfg.weeklyCommentLimit,
      minCommentLength: cfg.minCommentLength,
    },
    updatedAt: new Date().toISOString(),
  };
}
export async function getFircaLeaderboard(
  studentId: string,
  month = bakuMonth(),
) {
  const { start, end } = monthBounds(month);
  type Row = {
    identifier: string;
    displayName: string;
    points: number;
    rank: number;
    own: boolean;
  };
  const rows = await getPrisma().$queryRaw<Row[]>(Prisma.sql`
    with totals as (
      select s.id,c.full_name as name,coalesce(sum(l.delta),0)::int as points
      from erp.students s join erp.contacts c on c.id=s.contact_id
      join erp.student_mobile_accounts m on m.student_id=s.id
      left join erp.firca_awards a on a.student_id=s.id
      left join erp.firca_ledger l on l.award_id=a.id and l.occurred_at>=${start} and l.occurred_at<${end}
      where erp.firca_student_eligible(s.id) group by s.id,c.full_name
    ), ranked as (
      select *,rank() over(order by points desc)::int as rank,row_number() over(order by points desc,id) as position from totals
    ) select ('participant:'||id::text) as identifier,name as "displayName",points,rank,id=${studentId}::uuid as own
      from ranked where position<=10 or id=${studentId}::uuid order by position
  `);
  return {
    title: "Bu ayın ən aktivləri",
    month,
    timezone: "Asia/Baku",
    scope: "academy",
    metric: "firca",
    top: rows.slice(0, 10).map(({ own, ...r }) => ({ ...r, isMe: own })),
    me: rows.filter((r) => r.own).map(({own,...r}) => ({...r,isMe:own}))[0] ?? null,
    updatedAt: new Date().toISOString(),
  };
}
export async function getFircaHistory(studentId: string, before?: string) {
  const rows = await getPrisma().$queryRaw<
    {
      id: string;
      delta: number;
      source: string;
      sourceId: string;
      reason: string;
      occurredAt: Date;
    }[]
  >(Prisma.sql`
    select l.id::text,l.delta,a.source,a.source_id::text as "sourceId",l.reason,l.occurred_at as "occurredAt"
    from erp.firca_ledger l join erp.firca_awards a on a.id=l.award_id
    where a.student_id=${studentId}::uuid ${before ? Prisma.sql`and (l.occurred_at,l.id)<(select cursor.occurred_at,cursor.id from erp.firca_ledger cursor join erp.firca_awards owner on owner.id=cursor.award_id where cursor.id=${before}::uuid and owner.student_id=${studentId}::uuid)` : Prisma.empty}
    order by l.occurred_at desc,l.id desc limit 51
  `);
  return {
    items: rows
      .slice(0, 50)
      .map((r) => ({ ...r, occurredAt: r.occurredAt.toISOString() })),
    nextCursor: rows.length > 50 ? rows[49].id : null,
  };
}

// Only a trusted community dispatcher calls this, never a student gateway.
export async function applyCommentEvent(db: FircaDb, input: CommentEvent) {
  const mapping = await db.studentMobileAccount.findUnique({
    where: { authUserId: input.authorAuthUserId },
    select: { studentId: true },
  });
  if (!mapping)
    throw new MobilePortalError(
      "STUDENT_MAPPING_NOT_FOUND",
      404,
      "Tələbə tapılmadı.",
    );
  const student = mapping.studentId;
  await db.$queryRaw`select pg_advisory_xact_lock(hashtextextended(${"firca-comment:" + input.commentId},0))`;
  await db.$queryRaw`select pg_advisory_xact_lock(hashtextextended(${"firca:" + student},0))`;
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  const existing = await db.$queryRaw<
    { payloadHash: string }[]
  >`select payload_hash as "payloadHash" from erp.firca_comment_events where comment_id=${input.commentId}::uuid and revision=${input.revision}`;
  if (existing[0]) {
    if (existing[0].payloadHash !== hash)
      throw new MobilePortalError(
        "EVENT_CONFLICT",
        409,
        "Eyni versiyada fərqli məlumat var.",
      );
    return { status: "duplicate", delta: 0 };
  }
  const cfg = await settings(db);
  const postAuthor = await db.studentMobileAccount.findUnique({
    where: { authUserId: input.postAuthorAuthUserId, status: "ACTIVE" },
    select: { studentId: true },
  });
  const normalized = normalizeComment(input.body);
  const eligible = !!postAuthor && qualifiesComment(
    { ...input, isOwn: input.authorAuthUserId === input.postAuthorAuthUserId },
    cfg.minCommentLength,
  );
  type Comment = {
    id: string;
    revision: number;
    moderated: boolean;
    studentId: string;
    postId: string;
    postAuthorId: string;
    createdAt: Date;
    parentId: string | null;
  };
  const byId = await db.$queryRaw<
    Comment[]
  >`select id::text,revision,moderated,student_id::text as "studentId",post_id::text as "postId",post_author_id::text as "postAuthorId",created_at as "createdAt",parent_id::text as "parentId" from erp.firca_comments where id=${input.commentId}::uuid`;
  if (
    byId[0] &&
    (byId[0].studentId !== student ||
      byId[0].postId !== input.postId ||
      byId[0].postAuthorId !== input.postAuthorAuthUserId ||
      byId[0].parentId !== input.parentId ||
      byId[0].createdAt.toISOString() !==
        new Date(input.createdAt).toISOString())
  )
    throw new MobilePortalError(
      "EVENT_CONFLICT",
      409,
      "Rəyin mənbəyi dəyişə bilməz.",
    );
  if (byId[0] && byId[0].revision >= input.revision)
    return { status: "stale", delta: 0 };
  await db.$executeRaw`insert into erp.firca_comment_events(comment_id,revision,payload_hash) values(${input.commentId}::uuid,${input.revision},${hash})`;
  await db.$executeRaw`insert into erp.firca_comments(id,student_id,post_id,post_author_id,body,normalized_text,parent_id,revision,eligible,deleted,created_at)
    values(${input.commentId}::uuid,${student}::uuid,${input.postId}::uuid,${input.postAuthorAuthUserId}::uuid,${input.body},${normalized},${input.parentId}::uuid,${input.revision},${eligible},${input.deleted},${new Date(input.createdAt)})
    on conflict(id) do update set body=excluded.body,normalized_text=excluded.normalized_text,revision=excluded.revision,eligible=excluded.eligible,deleted=excluded.deleted,received_at=clock_timestamp()`;
  const [postClaim] = await db.$queryRaw<
    { id: string }[]
  >`select comment_id::text as id from erp.firca_comment_claims where student_id=${student}::uuid and post_id=${input.postId}::uuid`;
  if (postClaim && postClaim.id !== input.commentId)
    return { status: "post_already_evaluated", delta: 0 };
  const [dupe] = await db.$queryRaw<
    { found: boolean }[]
  >`select exists(select 1 from erp.firca_comments c join erp.firca_comment_claims claim on claim.comment_id=c.id where c.student_id=${student}::uuid and c.id<>${input.commentId}::uuid and c.normalized_text=${normalized} and c.eligible and not c.deleted and not c.moderated) as found`;
  if (!postClaim && (!eligible || dupe.found))
    return { status: "ineligible", delta: 0 };
  const [eligibility] = await db.$queryRaw<
    { ok: boolean }[]
  >`select erp.firca_student_eligible(${student}::uuid) as ok`;
  const [award] = await db.$queryRaw<
    { balance: number; first: Date | null }[]
  >`select balance,first_awarded_at as first from erp.firca_awards where student_id=${student}::uuid and source='comment' and source_id=${input.postId}::uuid`;
  let points = 0;
  if (
    eligible &&
    !byId[0]?.moderated &&
    eligibility.ok &&
    cfg.enabled &&
    cfg.startsAt &&
    cfg.startsAt.getTime() <= Date.now() &&
    new Date(input.createdAt) >= cfg.startsAt &&
    new Date(input.createdAt).getTime() <= Date.now() + 60000
  ) {
    const [week] = await db.$queryRaw<
      { n: number }[]
    >`select count(*)::int as n from erp.firca_awards where student_id=${student}::uuid and source='comment' and first_awarded_at >= (date_trunc('week',clock_timestamp() at time zone 'Asia/Baku') at time zone 'Asia/Baku')`;
    if (
      !dupe.found &&
      (award?.first || (!postClaim && week.n < cfg.weeklyCommentLimit))
    )
      points = cfg.commentPoints;
  }
  // Pausing scoring alone does not revoke already-valid comments.
  if (
    !cfg.enabled &&
    eligible &&
    !dupe.found &&
    !byId[0]?.moderated &&
    award?.balance
  )
    return { status: "recorded", delta: 0 };
  if (points > 0 && !postClaim)
    await db.$executeRaw`insert into erp.firca_comment_claims(student_id,post_id,comment_id) values(${student}::uuid,${input.postId}::uuid,${input.commentId}::uuid)`;
  const delta = await setBalance(
    db,
    student,
    "comment",
    input.postId,
    points,
    "İcma rəyi yeniləndi",
  );
  return { status: "recorded", delta };
}
