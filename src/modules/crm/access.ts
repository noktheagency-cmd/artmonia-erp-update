import { AppRole, type Lead, type Prisma } from "@/generated/prisma/client";
import type { ErpActor } from "@/server/auth/actor";
import { assertPermission, scopeFor, type PermissionCode } from "@/server/rbac/permissions";

export type LeadAccessFields = Pick<Lead, "id" | "managerId" | "stage">;

export function getLeadReadScope(actor: ErpActor): Prisma.LeadWhereInput {
  assertPermission(actor.permissions, "crm.lead.read");

  if (scopeFor(actor.permissions, "crm.lead.read") === "ALL") {
    return {};
  }

  if (scopeFor(actor.permissions, "crm.lead.read") === "ASSIGNED") {
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
  return scopeFor(actor.permissions, "crm.lead.update") === "ALL";
}

export function resolveLeadManagerId(
  actor: ErpActor,
  requestedManagerId: string | undefined,
  currentManagerId: string | null
) {
  if (canAssignLeadOwner(actor)) {
    return requestedManagerId ?? currentManagerId;
  }

  return currentManagerId;
}

// Follow-up edits are shared among CRM editors within their readable records.
// Assignment, deletion and conversion retain their separate scope checks.
export function assertCanEditLead(
  actor: ErpActor,
  lead: LeadAccessFields | null,
): asserts lead is LeadAccessFields {
  assertPermission(actor.permissions, "crm.lead.update");
  assertCanAccessLead(actor, lead, "crm.lead.read");
}

export function assertCanAccessLead(
  actor: ErpActor,
  lead: LeadAccessFields | null,
  permission: PermissionCode
): asserts lead is LeadAccessFields {
  assertPermission(actor.permissions, permission);

  if (!lead) {
    throw new Error("Müraciət tapılmadı");
  }

  if (scopeFor(actor.permissions, permission) !== "ALL" && lead.managerId !== actor.id) {
    throw new Error("Bu müraciətə giriş icazəniz yoxdur");
  }
}

export function getCrmScopeLabel(actor: ErpActor) {
  if (scopeFor(actor.permissions, "crm.lead.read") === "ALL") {
    return "Bütün CRM müraciətləri";
  }

  if (scopeFor(actor.permissions, "crm.lead.read") === "ASSIGNED") {
    return "Mənə təyin olunan müraciətlər";
  }

  return "CRM giriş icazəsi yoxdur";
}
