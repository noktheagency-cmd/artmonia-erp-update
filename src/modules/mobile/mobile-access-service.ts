import "server-only";

import { Prisma } from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import { getSupabaseAdminClient } from "@/server/supabase/admin";
import { loadMobileAuthUser, verifyMobileToken, type MobileTokenIdentity } from "@/server/supabase/mobile-auth";
import { isMobileDisabledStudentStatus, normalizeStudentLoginEmail } from "@/modules/students/mobile-account-service";
import { decideMobileStudentMatch, mobileAuthProfile, type MobileAccess } from "./mobile-access-policy";

const accountSelect = {
  id: true, studentId: true, authUserId: true, loginEmail: true, status: true,
  activatedAt: true, avatarObjectPath: true,
  student: { select: { code: true, lifecycleStatus: true, contact: { select: {
    fullName: true, phoneDisplay: true,
  } } } },
} satisfies Prisma.StudentMobileAccountSelect;

type Account = Prisma.StudentMobileAccountGetPayload<{ select: typeof accountSelect }>;
type Candidate = {
  id: string; phoneDisplay: string | null; phoneNormalized: string | null; linkedAuthUserId: string | null;
};
export type MobileAccessResolution =
  | { ok: true; access: MobileAccess }
  | { ok: false; code: "STUDENT_AUTH_INVALID" | "EMAIL_NOT_VERIFIED" };

export async function resolveMobileAccess(token: string): Promise<MobileAccessResolution> {
  const identity = await verifyMobileToken(token);
  if (!identity) return { ok: false, code: "STUDENT_AUTH_INVALID" };
  for (let attempt = 0; ; attempt++) {
    try {
      return await getPrisma().$transaction(tx => resolveMobileAccessInTransaction(tx, identity));
    } catch (error) {
      // Unique constraints are the final protection if a competing writer does
      // not share this matcher's locks. Re-read, never overwrite another mapping.
      if (attempt < 2 && error instanceof Prisma.PrismaClientKnownRequestError
        && ["P2002", "P2034"].includes(error.code)) continue;
      throw error;
    }
  }
}

export async function resolveMobileAccessInTransaction(
  tx: Prisma.TransactionClient,
  identity: MobileTokenIdentity,
): Promise<MobileAccessResolution> {
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${"mobile-access:" + identity.authUserId},0))`;
  const user = await loadMobileAuthUser(tx, identity, true);
  if (!user?.sessionActive || !user.email) return { ok: false, code: "STUDENT_AUTH_INVALID" };
  if (!user.emailConfirmed) return { ok: false, code: "EMAIL_NOT_VERIFIED" };
  const email = normalizeStudentLoginEmail(user.email);
  const profile = mobileAuthProfile(user);
  const base: MobileAccess = {
    contractVersion: 1, authUserId: user.id, role: "member",
    accountStatus: user.disabled ? "disabled" : "active", matchStatus: "not_found",
    displayName: profile.displayName, email, phone: profile.phone,
    avatarUrl: null, checkedAt: new Date().toISOString(),
  };
  const existing = await tx.studentMobileAccount.findUnique({ where: { authUserId: user.id }, select: accountSelect });
  if (existing) return matchedAccess(base, await activateExisting(tx, existing, user.disabled));
  // A banned member must not acquire a new student mapping.
  if (user.disabled) return { ok: true, access: base };
  await tx.$executeRaw`select pg_advisory_xact_lock(hashtextextended(${"mobile-access-email:" + email},0))`;
  const candidates = await tx.$queryRaw<Candidate[]>(Prisma.sql`
    select s.id::text, c.phone_display as "phoneDisplay", c.phone_normalized as "phoneNormalized",
      m.auth_user_id::text as "linkedAuthUserId"
    from erp.students s join erp.contacts c on c.id = s.contact_id
    left join erp.student_mobile_accounts m on m.student_id = s.id
    where lower(btrim(c.email)) = ${email}
    order by s.id limit 2 for update of s, c
  `);
  const decision = decideMobileStudentMatch(candidates, user.id, profile.phone);
  if (decision !== "match") return { ok: true, access: { ...base, matchStatus: decision } };
  const emailOwner = await tx.studentMobileAccount.findFirst({
    where: { loginEmail: { equals: email, mode: "insensitive" } }, select: { authUserId: true },
  });
  if (emailOwner && emailOwner.authUserId !== user.id) {
    return { ok: true, access: { ...base, matchStatus: "review_required" } };
  }
  const account = await tx.studentMobileAccount.create({
    data: { studentId: candidates[0].id, authUserId: user.id, loginEmail: email, status: "ACTIVE", activatedAt: new Date() },
    select: accountSelect,
  });
  await tx.auditLog.create({ data: {
    action: "student.mobile_account.auto_match", entityType: "student", entityId: account.studentId,
    afterJson: { mobileAccountId: account.id, authUserId: user.id, method: "verified_email_phone_consistency" },
    reason: "Təsdiqlənmiş mobil hesab ERP tələbəsinə avtomatik bağlandı",
  } });
  return matchedAccess(base, account);
}

async function activateExisting(tx: Prisma.TransactionClient, account: Account, authDisabled: boolean) {
  if (account.status === "INVITED" && !authDisabled && !isMobileDisabledStudentStatus(account.student.lifecycleStatus)) {
    return tx.studentMobileAccount.update({
      where: { id: account.id }, data: { status: "ACTIVE", activatedAt: account.activatedAt ?? new Date() }, select: accountSelect,
    });
  }
  return account;
}

function matchedAccess(base: MobileAccess, account: Account): MobileAccessResolution {
  const disabled = base.accountStatus === "disabled" || account.status === "DISABLED"
    || isMobileDisabledStudentStatus(account.student.lifecycleStatus);
  const avatarUrl = account.avatarObjectPath
    ? getSupabaseAdminClient().storage.from("student-avatars").getPublicUrl(account.avatarObjectPath).data.publicUrl
    : null;
  return { ok: true, access: {
    ...base, role: "student", matchStatus: "matched", accountStatus: disabled ? "disabled" : "active",
    displayName: account.student.contact.fullName, phone: account.student.contact.phoneDisplay, avatarUrl,
  } };
}
