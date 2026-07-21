"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppRole, Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { getSupabaseAdminClient } from "@/server/supabase/admin";

const credentialSchema = z.object({
  employeeId: z.string().uuid(),
  loginEmail: z.string().trim().email("Düzgün login e-poçtu daxil edin"),
  password: z.string().max(72).default(""),
  roleId: z.union([z.string().uuid(), z.literal("")]).default(""),
});

export async function upsertHrStaffCredentialsAction(formData: FormData) {
  const actor = await requireMutationActor("auth.user.manage");
  const input = credentialSchema.parse(Object.fromEntries(formData));
  const prisma = getPrisma();
  const employee = await prisma.hrEmployee.findUnique({
    where: { id: input.employeeId },
    include: { user: { include: { roles: true } }, teacher: true },
  });
  if (!employee) throw new Error("Əməkdaş profili tapılmadı");

  const emailOwner = await prisma.user.findFirst({
    where: {
      email: input.loginEmail,
      id: employee.userId ? { not: employee.userId } : undefined,
    },
    select: { id: true },
  });
  if (emailOwner)
    throw new Error("Bu login e-poçtu başqa istifadəçiyə məxsusdur");

  if (employee.user?.authUserId) {
    return updateExistingCredentials({
      employee,
      actorId: actor.id,
      loginEmail: input.loginEmail,
      password: input.password,
    });
  }

  if (input.password.length < 8)
    throw new Error("Yeni hesab üçün parol ən az 8 simvol olmalıdır");
  if (!input.roleId)
    throw new Error("Yeni hesab üçün sistem rolu seçilməlidir");
  const role = await prisma.role.findFirst({
    where: {
      id: input.roleId,
      OR: [{ code: null }, { code: { not: AppRole.SUPER_ADMIN } }],
    },
  });
  if (!role) throw new Error("Seçilmiş rol tapılmadı və ya təyin edilə bilməz");

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
    throw new Error(error?.message ?? "Login hesabı yaradıla bilmədi");

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

      await tx.userRole.upsert({
        where: { userId_roleId: { userId: erpUser.id, roleId: role.id } },
        create: { userId: erpUser.id, roleId: role.id },
        update: {},
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
          role: role.name,
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

async function updateExistingCredentials({
  employee,
  actorId,
  loginEmail,
  password,
}: {
  employee: {
    id: string;
    fullName: string;
    user: { id: string; authUserId: string | null; email: string } | null;
  };
  actorId: string;
  loginEmail: string;
  password: string;
}) {
  if (!employee.user?.authUserId) throw new Error("Login hesabı tapılmadı");
  const emailChanged =
    employee.user.email.toLocaleLowerCase() !== loginEmail.toLocaleLowerCase();
  const passwordChanged = password.length > 0;
  if (!emailChanged && !passwordChanged)
    throw new Error("Dəyişiklik üçün yeni e-poçt və ya parol daxil edin");
  if (passwordChanged && password.length < 8)
    throw new Error("Yeni parol ən az 8 simvol olmalıdır");

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
  const { error } = await getSupabaseAdminClient().auth.admin.updateUserById(
    employee.user.authUserId,
    attributes,
  );
  if (error) throw new Error(error.message);

  try {
    await getPrisma().$transaction(async (tx) => {
      if (emailChanged)
        await tx.user.update({
          where: { id: employee.user!.id },
          data: { email: loginEmail },
        });
      await writeAuditLog(tx, {
        actorUserId: actorId,
        action: "hr.credentials.update",
        entityType: "hr_employee",
        entityId: employee.id,
        before: { loginEmail: employee.user!.email },
        after: {
          loginEmail,
          emailChanged,
          passwordChanged,
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
