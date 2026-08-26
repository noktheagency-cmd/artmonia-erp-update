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
  const prisma = getPrisma();
  const student = await prisma.student.findUnique({
    where: { id: input.studentId },
    select: {
      id: true,
      code: true,
      contact: { select: { fullName: true, email: true } },
      mobileAccount: { select: { id: true, status: true } },
    },
  });

  if (!student) throw new PublicActionError("Tələbə tapılmadı.", "NOT_FOUND");
  if (student.mobileAccount) {
    throw new PublicActionError(
      student.mobileAccount.status === StudentMobileAccountStatus.DISABLED
        ? "Mobil hesab deaktivdir. Əvvəlcə hesabı aktivləşdirin."
        : "Bu tələbənin mobil hesabı artıq mövcuddur.",
      "DUPLICATE",
    );
  }

  const email = student.contact.email
    ? normalizeStudentLoginEmail(student.contact.email)
    : "";
  if (!email) {
    throw new PublicActionError("Mobil hesab yaratmaq üçün tələbənin e-poçtu daxil edilməlidir.");
  }

  const duplicate = await prisma.studentMobileAccount.findUnique({
    where: { loginEmail: email },
    select: { id: true },
  });
  if (duplicate) {
    throw new PublicActionError("Bu e-poçt başqa tələbənin mobil hesabına bağlıdır.", "DUPLICATE");
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: getStudentMobileSetupUrl(),
    data: {
      account_type: "student",
      full_name: student.contact.fullName,
    },
  });
  if (error) throw error;
  if (!data.user?.id) throw new Error("Supabase dəvəti istifadəçi ID-si qaytarmadı.");

  const authUserId = data.user.id;
  try {
    const { error: metadataError } = await supabase.auth.admin.updateUserById(authUserId, {
      app_metadata: {
        ...data.user.app_metadata,
        account_type: "student",
      },
    });
    if (metadataError) throw metadataError;

    return await prisma.$transaction(async (tx) => {
      const account = await tx.studentMobileAccount.create({
        data: {
          studentId: student.id,
          authUserId,
          loginEmail: email,
          status: StudentMobileAccountStatus.INVITED,
          createdById: input.actorId,
          updatedById: input.actorId,
        },
        select: { id: true, loginEmail: true, status: true, invitedAt: true },
      });
      await writeAuditLog(tx, {
        actorUserId: input.actorId,
        action: "student.mobile_account.invite",
        entityType: "student",
        entityId: student.id,
        after: {
          mobileAccountId: account.id,
          loginEmail: account.loginEmail,
          status: account.status,
        } satisfies Prisma.InputJsonValue,
        reason: `${student.code} üçün mobil giriş dəvəti göndərildi`,
      });
      return account;
    });
  } catch (error) {
    const { error: cleanupError } = await supabase.auth.admin.deleteUser(authUserId);
    if (cleanupError) {
      console.error("Failed to roll back invited Supabase Auth user", {
        authUserId,
        message: cleanupError.message,
      });
    }
    throw error;
  }
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
  const { data, error } = await getSupabaseAdminClient().auth.getUser(accessToken);
  if (error || !data.user) return { ok: false, code: "STUDENT_AUTH_INVALID" };

  const prisma = getPrisma();
  const account = await prisma.studentMobileAccount.findUnique({
    where: { authUserId: data.user.id },
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
      authUserId: data.user.id,
      studentId: account.studentId,
      studentCode: account.student.code,
      lifecycleStatus: account.student.lifecycleStatus,
      loginEmail: account.loginEmail,
    },
  };
}

function isMobileDisabledStudentStatus(status: StudentLifecycleStatus) {
  return status === StudentLifecycleStatus.FROZEN
    || status === StudentLifecycleStatus.STOPPED
    || status === StudentLifecycleStatus.DECLINED
    || status === StudentLifecycleStatus.COMPLETED;
}

export async function deleteStudentMobileAuthUser(authUserId: string) {
  const { error } = await getSupabaseAdminClient().auth.admin.deleteUser(authUserId);
  if (error) throw error;
}
