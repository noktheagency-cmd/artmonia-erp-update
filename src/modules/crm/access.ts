import { AppRole, type Lead, type Prisma } from "@/generated/prisma/client";
import { isPrivilegedActor, type ErpActor } from "@/server/auth/actor";
import { assertPermission, type PermissionCode } from "@/server/rbac/permissions";

export type LeadAccessFields = Pick<Lead, "id" | "managerId" | "stage">;

export function getLeadReadScope(actor: ErpActor): Prisma.LeadWhereInput {
  assertPermission(actor.roles, "crm.lead.read");

  if (isPrivilegedActor(actor)) {
    return {};
  }

  if (actor.roles.includes(AppRole.SALES)) {
    return { managerId: actor.id };
  }

  return { id: "__no_access__" };
}

export function getLeadManagerScope(actor: ErpActor): Prisma.UserWhereInput {
  if (canAssignLeadOwner(actor)) {
    return {
      isActive: true,
      roles: {
        some: {
          role: { code: { in: [AppRole.OWNER, AppRole.ADMIN, AppRole.SALES] } },
        },
      },
    };
  }

  return {
    id: actor.id,
    isActive: true,
  };
}

export function canAssignLeadOwner(actor: ErpActor) {
  return isPrivilegedActor(actor);
}

export function resolveLeadManagerId(
  actor: ErpActor,
  requestedManagerId: string | undefined
) {
  if (canAssignLeadOwner(actor)) {
    return requestedManagerId ?? actor.id;
  }

  return actor.id;
}

export function assertCanAccessLead(
  actor: ErpActor,
  lead: LeadAccessFields | null,
  permission: PermissionCode
): asserts lead is LeadAccessFields {
  assertPermission(actor.roles, permission);

  if (!lead) {
    throw new Error("Müraciət tapılmadı");
  }

  if (!isPrivilegedActor(actor) && lead.managerId !== actor.id) {
    throw new Error("Bu müraciətə giriş icazəniz yoxdur");
  }
}

export function getCrmScopeLabel(actor: ErpActor) {
  if (isPrivilegedActor(actor)) {
    return "Bütün CRM müraciətləri";
  }

  if (actor.roles.includes(AppRole.SALES)) {
    return "Mənə təyin olunan müraciətlər";
  }

  return "CRM giriş icazəsi yoxdur";
}
