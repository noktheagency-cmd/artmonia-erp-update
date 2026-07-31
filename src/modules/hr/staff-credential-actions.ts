"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppRole, Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { getSupabaseAdminClient } from "@/server/supabase/admin";
import {
  PublicActionError,
  safeServerAction,
} from "@/server/actions/safe-action";

const roleIdsSchema = z.preprocess((value) => {
  if (value == null || value === "") return [];
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}, z.array(z.string().uuid()).min(1).max(20));

const credentialSchema = z.object({
  employeeId: z.string().uuid(),
  loginEmail: z.string().trim().email("Düzgün login e-poçtu daxil edin"),
  password: z.string().max(72).default(""),
  roleIds: roleIdsSchema,
});

async function upsertHrStaffCredentialsActionImpl(formData: FormData) {
  const actor = await requireMutationActor("auth.user.manage");
  const input = credentialSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const employee = await prisma.hrEmployee.findUnique({
    where: { id: input.employeeId },
    include: {
      user: { include: { roles: { include: { role: true } } } },
      teacher: true,
    },
  });
  if (!employee) throw new PublicActionError("Əməkdaş profili tapılmadı", "NOT_FOUND");

  const emailOwner = await prisma.user.findFirst({
    where: {
      email: input.loginEmail,
      id: employee.userId ? { not: employee.userId } : undefined,
    },
    select: { id: true },
  });
  if (emailOwner)
    throw new PublicActionError("Bu login e-poçtu başqa istifadəçiyə məxsusdur", "DUPLICATE");

  const roles = await prisma.role.findMany({
    where: { id: { in: input.roleIds } },
    select: { id: true, name: true, code: true },
  });
  if (
    roles.length !== new Set(input.roleIds).size ||
    roles.some((role) => role.code === AppRole.SUPER_ADMIN)
  )
    throw new PublicActionError(
      "Seçilmiş rollardan biri tapılmadı və ya təyin edilə bilməz",
      "NOT_FOUND",
    );

  if (employee.user?.authUserId) {
    return updateExistingCredentials({
      employee,
      actorId: actor.id,
      loginEmail: input.loginEmail,
      password: input.password,
      roleIds: input.roleIds,
      roles,
    });
  }

  if (input.password.length < 8)
    throw new PublicActionError("Yeni hesab üçün parol ən az 8 simvol olmalıdır");
  const { data, error } = await getSupabaseAdminClient().auth.admin.createUser({
    email: input.loginEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      full_name: employee.fullName,
      avatar_url: employee.profilePhotoUrl,
    },
  });
  if (error || !data.user)
    throw new PublicActionError(
      error?.message ?? "Login hesabı yaradıla bilmədi",
      error?.message && /already|exists|registered/i.test(error.message)
        ? "DUPLICATE"
        : "VALIDATION",
    );

  try {
    await prisma.$transaction(async (tx) => {
      const erpUser = employee.user
        ? await tx.user.update({
            where: { id: employee.user.id },
            data: {
              authUserId: data.user.id,
              email: input.loginEmail,
              isActive: true,
            },
          })
        : await tx.user.create({
            data: {
              authUserId: data.user.id,
              fullName: employee.fullName,
              email: input.loginEmail,
              phone: employee.phone,
              isActive: true,
            },
          });

      await tx.userRole.deleteMany({ where: { userId: erpUser.id } });
      await tx.userRole.createMany({
        data: roles.map((role) => ({ userId: erpUser.id, roleId: role.id })),
      });
      await tx.hrEmployee.update({
        where: { id: employee.id },
        data: { userId: erpUser.id },
      });
      if (employee.teacherId)
        await tx.teacher.update({
          where: { id: employee.teacherId },
          data: { userId: erpUser.id },
        });
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "hr.credentials.create",
        entityType: "hr_employee",
        entityId: employee.id,
        after: {
          loginEmail: input.loginEmail,
          roles: roles.map((role) => role.name),
          passwordConfigured: true,
        } as Prisma.InputJsonValue,
        reason: `${employee.fullName} üçün ERP login hesabı yaradıldı`,
      });
    });
  } catch (dbError) {
    await getSupabaseAdminClient()
      .auth.admin.deleteUser(data.user.id)
      .catch(() => undefined);
    throw dbError;
  }

  revalidateCredentials(employee.id);
  return { created: true };
}

export const upsertHrStaffCredentialsAction = safeServerAction(
  upsertHrStaffCredentialsActionImpl,
  "Login məlumatları yenilənə bilmədi.",
);

async function updateExistingCredentials({
  employee,
  actorId,
  loginEmail,
  password,
  roleIds,
  roles,
}: {
  employee: {
    id: string;
    fullName: string;
    user: {
      id: string;
      authUserId: string | null;
      email: string;
      roles: Array<{ role: { id: string; name: string } }>;
    } | null;
  };
  actorId: string;
  loginEmail: string;
  password: string;
  roleIds: string[];
  roles: Array<{ id: string; name: string }>;
}) {
  if (!employee.user?.authUserId) throw new PublicActionError("Login hesabı tapılmadı", "NOT_FOUND");
  const emailChanged =
    employee.user.email.toLocaleLowerCase() !== loginEmail.toLocaleLowerCase();
  const passwordChanged = password.length > 0;
  const currentRoleIds = employee.user.roles
    .map(({ role }) => role.id)
    .sort();
  const nextRoleIds = [...roleIds].sort();
  const rolesChanged = currentRoleIds.join(",") !== nextRoleIds.join(",");
  if (!emailChanged && !passwordChanged && !rolesChanged)
    throw new PublicActionError(
      "Dəyişiklik üçün yeni e-poçt, parol və ya rol seçimi daxil edin",
    );
  if (passwordChanged && password.length < 8)
    throw new PublicActionError("Yeni parol ən az 8 simvol olmalıdır");

  const attributes: {
    email?: string;
    email_confirm?: boolean;
    password?: string;
  } = {};
  if (emailChanged) {
    attributes.email = loginEmail;
    attributes.email_confirm = true;
  }
  if (passwordChanged) attributes.password = password;
  if (emailChanged || passwordChanged) {
    const { error } = await getSupabaseAdminClient().auth.admin.updateUserById(
      employee.user.authUserId,
      attributes,
    );
    if (error) {
      throw new PublicActionError(
        error.message,
        /already|exists|registered/i.test(error.message)
          ? "DUPLICATE"
          : "VALIDATION",
      );
    }
  }

  try {
    await getPrisma().$transaction(async (tx) => {
      if (emailChanged)
        await tx.user.update({
          where: { id: employee.user!.id },
          data: { email: loginEmail },
        });
      if (rolesChanged) {
        await tx.userRole.deleteMany({ where: { userId: employee.user!.id } });
        await tx.userRole.createMany({
          data: roles.map((role) => ({
            userId: employee.user!.id,
            roleId: role.id,
          })),
        });
      }
      await writeAuditLog(tx, {
        actorUserId: actorId,
        action: "hr.credentials.update",
        entityType: "hr_employee",
        entityId: employee.id,
        before: {
          loginEmail: employee.user!.email,
          roles: employee.user!.roles.map(({ role }) => role.name),
        },
        after: {
          loginEmail,
          emailChanged,
          passwordChanged,
          roles: roles.map((role) => role.name),
          rolesChanged,
        } as Prisma.InputJsonValue,
        reason: `${employee.fullName} üçün ERP login məlumatları yeniləndi`,
      });
    });
  } catch (dbError) {
    if (emailChanged) {
      await getSupabaseAdminClient()
        .auth.admin.updateUserById(employee.user.authUserId, {
          email: employee.user.email,
          email_confirm: true,
        })
        .catch(() => undefined);
    }
    throw dbError;
  }

  revalidateCredentials(employee.id);
  return { created: false };
}

function revalidateCredentials(employeeId: string) {
  revalidatePath(`/hr/${employeeId}`);
  revalidatePath("/hr");
  revalidatePath("/profile");
  revalidatePath("/", "layout");
}
