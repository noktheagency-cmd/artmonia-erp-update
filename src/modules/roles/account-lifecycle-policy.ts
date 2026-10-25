import { z } from "zod";
import type { ErpActor } from "@/server/auth/actor";
import { assertPermission } from "@/server/rbac/permissions";
import { PublicActionError } from "@/server/actions/public-action-error";
import { isProtectedTeamRole } from "@/lib/protected-roles";
import type { AppRole } from "@/generated/prisma/client";

export const accountLifecycleSchema = z.object({
  userId: z.string().uuid(),
  requestKey: z.string().uuid(),
  operation: z.enum(["DISABLE", "ENABLE", "DELETE"]),
  expectedUpdatedAt: z.iso.datetime(),
  reason: z.string().trim().min(5, "Səbəb ən az 5 simvol olmalıdır.").max(500),
});
export type AccountLifecycleInput = z.infer<typeof accountLifecycleSchema>;
export type AccountLifecycleOperation = AccountLifecycleInput["operation"];

export function accountLifecyclePermission(operation: AccountLifecycleOperation) {
  return operation === "DELETE" ? "auth.user.delete" as const : "auth.user.status.change" as const;
}

export function isProtectedLoginRole(code: AppRole | null) {
  return isProtectedTeamRole(code) || code === "OWNER";
}

export function assertAccountLifecycleTarget(actor: ErpActor, target: {
  id: string;
  roles: Array<{ role: { code: AppRole | null } }>;
  hrEmployeeProfile: { archivedAt: Date | null; status: string } | null;
}, operation: AccountLifecycleOperation) {
  assertPermission(actor.permissions, accountLifecyclePermission(operation));
  if (target.id === actor.id) throw new PublicActionError("Öz giriş hesabınıza bu əməliyyatı edə bilməzsiniz.", "FORBIDDEN");
  if (target.roles.some(({ role }) => isProtectedLoginRole(role.code))) {
    throw new PublicActionError("Qorunan idarəçi hesabına bu bölmədən müdaxilə edilə bilməz.", "FORBIDDEN");
  }
  if (operation === "ENABLE" && target.hrEmployeeProfile
    && (target.hrEmployeeProfile.archivedAt || target.hrEmployeeProfile.status === "INACTIVE")) {
    throw new PublicActionError("İşdən ayrılmış və ya arxivdəki əməkdaşın girişi bərpa edilə bilməz.");
  }
}
