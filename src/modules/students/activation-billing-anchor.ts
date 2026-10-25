import { Prisma } from "@/generated/prisma/client";

/** Only called after the first PRESENT has passed the activation guards.
 * The legacy DB guard remains enabled for ordinary profile/payment writes.
 */
export async function setActivationBillingAnchor(
  tx: Prisma.TransactionClient,
  input: { studentId: string; lessonDate: Date; actorId?: string | null },
) {
  const [previous] = await tx.$queryRaw<Array<{ allow: string | null; actor: string | null }>>(Prisma.sql`
    select current_setting('app.allow_billing_anchor_update', true) as allow,
      current_setting('app.actor_user_id', true) as actor
  `);
  await tx.$queryRaw(Prisma.sql`select
    set_config('app.allow_billing_anchor_update', 'on', true),
    set_config('app.actor_user_id', ${input.actorId ?? ""}, true)
  `);
  try {
    await tx.student.update({ where: { id: input.studentId }, data: { billingAnchorDate: input.lessonDate } });
  } finally {
    await tx.$queryRaw(Prisma.sql`select
      set_config('app.allow_billing_anchor_update', ${previous?.allow ?? ""}, true),
      set_config('app.actor_user_id', ${previous?.actor ?? ""}, true)
    `);
  }
}
