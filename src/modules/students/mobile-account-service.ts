import "server-only";

import {
  StudentLifecycleStatus,
  StudentMobileAccountStatus,
  type Prisma,
} from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { PublicActionError } from "@/server/actions/safe-action";
import { getPrisma } from "@/server/db/prisma";
import { requireEnv } from "@/server/env";
import { getSupabaseAdminClient } from "@/server/supabase/admin";
import { loadMobileAuthUser, verifyMobileToken } from "@/server/supabase/mobile-auth";

const LONG_BAN_DURATION = "876000h";

export function normalizeStudentLoginEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getStudentMobileSetupUrl() {
  return new URL("/mobile-auth/setup", requireEnv("NEXT_PUBLIC_APP_URL")).toString();
}

export async function inviteStudentMobileAccount(input: {
  studentId: string;
  actorId: string;
}) {
  void input;
  throw new PublicActionError(
    "Yeni hesab mobil tətbiqdə yaradılır. Tələbə e-poçtunu təsdiqlədikdən sonra ERP bağlantısı yoxlanılacaq.",
    "FORBIDDEN",
  );
}

export async function resendStudentMobileInvite(input: {
  studentId: string;
  actorId: string;
}) {
  const prisma = getPrisma();
  const account = await prisma.studentMobileAccount.findUnique({
    where: { studentId: input.studentId },
    select: { id: true, loginEmail: true, status: true },
  });
  if (!account) throw new PublicActionError("Tələbənin mobil hesabı tapılmadı.", "NOT_FOUND");
  if (account.status === StudentMobileAccountStatus.DISABLED) {
    throw new PublicActionError("Deaktiv hesaba dəvət göndərilə bilməz.");
  }

  const { error } = await getSupabaseAdminClient().auth.resetPasswordForEmail(
    account.loginEmail,
    { redirectTo: getStudentMobileSetupUrl() },
  );
  if (error) throw error;

  await prisma.$transaction(async (tx) => {
    await tx.studentMobileAccount.update({
      where: { id: account.id },
      data: {
        lastInviteSentAt: new Date(),
        updatedById: input.actorId,
      },
    });
    await writeAuditLog(tx, {
      actorUserId: input.actorId,
      action: "student.mobile_account.resend",
      entityType: "student",
      entityId: input.studentId,
      reason: "Mobil hesab üçün yeni giriş/parol linki göndərildi",
    });
  });
}

export async function setStudentMobileAccountDisabled(input: {
  studentId: string;
  actorId: string;
  disabled: boolean;
}) {
  const prisma = getPrisma();
  const account = await prisma.studentMobileAccount.findUnique({
    where: { studentId: input.studentId },
    select: { id: true, authUserId: true, status: true, activatedAt: true },
  });
  if (!account) throw new PublicActionError("Tələbənin mobil hesabı tapılmadı.", "NOT_FOUND");

  const nextStatus = input.disabled
    ? StudentMobileAccountStatus.DISABLED
    : account.activatedAt
      ? StudentMobileAccountStatus.ACTIVE
      : StudentMobileAccountStatus.INVITED;
  const { error } = await getSupabaseAdminClient().auth.admin.updateUserById(
    account.authUserId,
    { ban_duration: input.disabled ? LONG_BAN_DURATION : "none" },
  );
  if (error) throw error;

  await prisma.$transaction(async (tx) => {
    await tx.studentMobileAccount.update({
      where: { id: account.id },
      data: {
        status: nextStatus,
        disabledAt: input.disabled ? new Date() : null,
        updatedById: input.actorId,
      },
    });
    await writeAuditLog(tx, {
      actorUserId: input.actorId,
      action: input.disabled
        ? "student.mobile_account.disable"
        : "student.mobile_account.enable",
      entityType: "student",
      entityId: input.studentId,
      after: { status: nextStatus } satisfies Prisma.InputJsonValue,
      reason: input.disabled ? "Mobil giriş deaktiv edildi" : "Mobil giriş aktiv edildi",
    });
  });
}

export async function resetStudentMobileDevice(input: {
  studentId: string;
  actorId: string;
}) {
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    const account = await tx.studentMobileAccount.findUnique({
      where: { studentId: input.studentId },
      select: { id: true, deviceInstallationId: true, deviceBoundAt: true },
    });
    if (!account) throw new PublicActionError("Tələbənin mobil hesabı tapılmadı.", "NOT_FOUND");
    await tx.studentMobileAccount.update({
      where: { id: account.id },
      data: { deviceInstallationId: null, deviceBoundAt: null, updatedById: input.actorId },
    });
    await writeAuditLog(tx, {
      actorUserId: input.actorId,
      action: "student.mobile_device.reset",
      entityType: "student",
      entityId: input.studentId,
      before: {
        wasBound: Boolean(account.deviceInstallationId),
        deviceBoundAt: account.deviceBoundAt?.toISOString() ?? null,
      },
      after: { wasBound: false },
      reason: "Tələbənin mobil cihaz bağlantısı ERP-dən sıfırlandı",
    });
  });
}

export async function resolveStudentMobileIdentity(accessToken: string) {
  const resolution = await resolveStudentMobileIdentityDetailed(accessToken);
  return resolution.ok ? resolution.identity : null;
}

export type StudentMobileIdentityResolution =
  | {
      ok: true;
      identity: {
        authUserId: string;
        studentId: string;
        studentCode: string;
        lifecycleStatus: string;
        loginEmail: string;
      };
    }
  | {
      ok: false;
      code: "STUDENT_AUTH_INVALID" | "STUDENT_MAPPING_NOT_FOUND" | "MOBILE_ACCOUNT_DISABLED";
    };

export async function resolveStudentMobileIdentityDetailed(
  accessToken: string,
): Promise<StudentMobileIdentityResolution> {
  const identity = await verifyMobileToken(accessToken);
  if (!identity) return { ok: false, code: "STUDENT_AUTH_INVALID" };
  const prisma = getPrisma();
  const user = await loadMobileAuthUser(prisma, identity);
  if (!user?.sessionActive || !user.emailConfirmed) return { ok: false, code: "STUDENT_AUTH_INVALID" };
  if (user.disabled) return { ok: false, code: "MOBILE_ACCOUNT_DISABLED" };
  const account = await prisma.studentMobileAccount.findUnique({
    where: { authUserId: user.id },
    select: {
      id: true,
      studentId: true,
      loginEmail: true,
      status: true,
      activatedAt: true,
      student: { select: { code: true, lifecycleStatus: true } },
    },
  });
  if (!account) return { ok: false, code: "STUDENT_MAPPING_NOT_FOUND" };
  if (account.status === StudentMobileAccountStatus.DISABLED) {
    return { ok: false, code: "MOBILE_ACCOUNT_DISABLED" };
  }
  if (isMobileDisabledStudentStatus(account.student.lifecycleStatus)) {
    return { ok: false, code: "MOBILE_ACCOUNT_DISABLED" };
  }

  if (account.status === StudentMobileAccountStatus.INVITED) {
    await prisma.studentMobileAccount.update({
      where: { id: account.id },
      data: {
        status: StudentMobileAccountStatus.ACTIVE,
        activatedAt: account.activatedAt ?? new Date(),
      },
    });
  }

  return {
    ok: true,
    identity: {
      authUserId: user.id,
      studentId: account.studentId,
      studentCode: account.student.code,
      lifecycleStatus: account.student.lifecycleStatus,
      loginEmail: account.loginEmail,
    },
  };
}

export function isMobileDisabledStudentStatus(status: StudentLifecycleStatus) {
  return status === StudentLifecycleStatus.FROZEN
    || status === StudentLifecycleStatus.STOPPED
    || status === StudentLifecycleStatus.DECLINED
    || status === StudentLifecycleStatus.COMPLETED;
}

export async function deleteStudentMobileAuthUser(authUserId: string) {
  const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(authUserId);
  if (error) throw error;
}
