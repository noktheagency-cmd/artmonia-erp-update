import type { Prisma } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";

type StandaloneUserDb = {
  user: {
    create(args: {
      data: Prisma.UserUncheckedCreateInput;
      select: { id: true; email: true; fullName: true };
    }): Promise<{ id: string; email: string; fullName: string }>;
  };
  userRole: {
    create(args: {
      data: Prisma.UserRoleUncheckedCreateInput;
    }): Promise<unknown>;
  };
  auditLog: {
    create(args: {
      data: Prisma.AuditLogUncheckedCreateInput;
    }): Promise<unknown>;
  };
};

type StandaloneUserInput = {
  authUserId: string;
  email: string;
  fullName: string;
  role: { id: string; name: string };
  actorUserId: string;
};

/**
 * Persists an ERP login that is intentionally outside the HR staff directory.
 * The narrow database contract prevents this workflow from writing HrEmployee.
 */
export async function persistStandaloneUser(
  db: StandaloneUserDb,
  input: StandaloneUserInput,
) {
  const created = await db.user.create({
    data: {
      authUserId: input.authUserId,
      fullName: input.fullName,
      email: input.email,
      isActive: true,
    },
    select: { id: true, email: true, fullName: true },
  });

  await db.userRole.create({
    data: { userId: created.id, roleId: input.role.id },
  });
  await writeAuditLog(db, {
    actorUserId: input.actorUserId,
    action: "auth.user.create",
    entityType: "user",
    entityId: created.id,
    after: {
      fullName: input.fullName,
      email: input.email,
      role: input.role,
      loginCreated: true,
      hrEmployeeCreated: false,
    } as Prisma.InputJsonValue,
    reason: "HR profilindən kənar ERP giriş hesabı yaradıldı",
  });

  return created;
}
