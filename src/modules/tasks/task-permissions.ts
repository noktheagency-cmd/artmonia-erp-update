import "server-only";

import { AppRole } from "@/generated/prisma/client";
import type { ErpActor } from "@/server/auth/actor";
import { PublicActionError } from "@/server/actions/safe-action";
import { getPrisma } from "@/server/db/prisma";

const OPERATION_HEAD_NAME = "operation head";
const OPERATION_HEAD_KEY_PREFIX = "custom.operation-head.";

export async function canAdministerTasks(
  actor: Pick<ErpActor, "id" | "roles">,
) {
  if (actor.roles.includes(AppRole.SUPER_ADMIN)) return true;

  const role = await getPrisma().userRole.findFirst({
    where: {
      userId: actor.id,
      role: {
        OR: [
          { name: { equals: OPERATION_HEAD_NAME, mode: "insensitive" } },
          { key: { startsWith: OPERATION_HEAD_KEY_PREFIX } },
        ],
      },
    },
    select: { roleId: true },
  });

  return Boolean(role);
}

export async function assertCanAdministerTasks(
  actor: Pick<ErpActor, "id" | "roles">,
) {
  if (!(await canAdministerTasks(actor))) {
    throw new PublicActionError(
      "Task yaratmaq, dəyişmək və silmək yalnız Super Admin və Operation Head rolları üçün açıqdır.",
      "FORBIDDEN",
    );
  }
}
