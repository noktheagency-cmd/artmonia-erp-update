"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import type { PermissionCode } from "@/server/rbac/permissions";
import { can } from "@/server/rbac/permissions";
import { requireErpActor, requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";
import { writeAuditLog } from "@/modules/audit/audit-service";
import type { Prisma } from "@/generated/prisma/client";
import {
  dropdownCatalogKeys,
  type DropdownCatalogKey,
  type DropdownCatalogSnapshot,
} from "@/modules/settings/dropdown-option-types";

const catalogSchema = z.enum(dropdownCatalogKeys);
const optionLabelSchema = z.string().trim().min(2).max(80);
const optionValueSchema = z.string().trim().min(1).max(100);

const catalogConfig: Record<
  DropdownCatalogKey,
  { permission: PermissionCode; revalidate: readonly string[]; renameValue: boolean }
> = {
  CRM_SOURCE: { permission: "crm.lead.update", revalidate: ["/crm", "/students"], renameValue: true },
  STUDENT_EDUCATION_LEVEL: { permission: "settings.manage", revalidate: ["/students", "/crm"], renameValue: true },
  HR_DEPARTMENT: { permission: "hr.employee.manage", revalidate: ["/hr"], renameValue: true },
  HR_POSITION: { permission: "hr.employee.manage", revalidate: ["/hr"], renameValue: true },
  WORKSHOP_EVENT_TYPE: { permission: "workshop.manage", revalidate: ["/workshops"], renameValue: false },
  MARKETING_CHANNEL: { permission: "marketing.manage", revalidate: ["/marketing"], renameValue: true },
  MARKETING_CONTENT_PLATFORM: { permission: "marketing.manage", revalidate: ["/marketing"], renameValue: true },
  MARKETING_CONTENT_FORMAT: { permission: "marketing.manage", revalidate: ["/marketing"], renameValue: true },
  MARKETING_EXPENSE_CATEGORY: { permission: "marketing.manage", revalidate: ["/marketing"], renameValue: true },
};

async function getDropdownCatalogOptionsActionImpl(
  rawCatalog: DropdownCatalogKey,
): Promise<DropdownCatalogSnapshot> {
  const catalog = catalogSchema.parse(rawCatalog);
  const actor = await requireErpActor();
  const config = catalogConfig[catalog];
  const records = await getPrisma().dropdownCatalogOption.findMany({
    where: { catalog },
    orderBy: [{ label: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      value: true,
      label: true,
      isActive: true,
      isCustom: true,
    },
  });

  return {
    canManage: can(actor.permissions, config.permission),
    records,
  };
}

async function saveDropdownCatalogOptionActionImpl(input: {
  catalog: DropdownCatalogKey;
  value?: string;
  label: string;
}) {
  const parsed = z.object({
    catalog: catalogSchema,
    value: optionValueSchema.optional(),
    label: optionLabelSchema,
  }).parse(input);
  const config = catalogConfig[parsed.catalog];
  const actor = await requireMutationActor(config.permission);
  const label = parsed.label.replace(/\s+/g, " ").trim();
  const requestedValue = parsed.value ?? label;

  if (requestedValue.startsWith("__")) {
    throw new PublicActionError("Bu dəyər sistem tərəfindən rezerv olunub.");
  }

  const record = await getPrisma().$transaction(async (tx) => {
    const before = await tx.dropdownCatalogOption.findUnique({
      where: { catalog_value: { catalog: parsed.catalog, value: requestedValue } },
      select: { id: true, value: true, label: true, isActive: true, isCustom: true },
    });
    const value = config.renameValue || before?.isCustom ? label : requestedValue;
    if (value.startsWith("__")) {
      throw new PublicActionError("Bu dəyər sistem tərəfindən rezerv olunub.");
    }
    const duplicate = await tx.dropdownCatalogOption.findFirst({
      where: {
        catalog: parsed.catalog,
        value: { equals: value, mode: "insensitive" },
        ...(before ? { NOT: { id: before.id } } : {}),
      },
      select: { id: true },
    });
    if (duplicate) {
      throw new PublicActionError("Bu seçim artıq mövcuddur.", "DUPLICATE");
    }

    if (parsed.value && parsed.value !== value) {
      await migrateDropdownCatalogValue(tx, parsed.catalog, parsed.value, value);
    }

    const saved = before
      ? await tx.dropdownCatalogOption.update({
          where: { id: before.id },
          data: { value, label, isActive: true },
          select: { id: true, value: true, label: true, isActive: true, isCustom: true },
        })
      : await tx.dropdownCatalogOption.create({
          data: {
            catalog: parsed.catalog,
            value,
            label,
            isActive: true,
            isCustom: parsed.value === undefined,
            createdById: actor.id,
          },
          select: { id: true, value: true, label: true, isActive: true, isCustom: true },
        });

    if (parsed.value && parsed.value !== saved.value) {
      await tx.dropdownCatalogOption.upsert({
        where: { catalog_value: { catalog: parsed.catalog, value: parsed.value } },
        create: {
          catalog: parsed.catalog,
          value: parsed.value,
          label: before?.label ?? parsed.value,
          isActive: false,
          isCustom: false,
          createdById: actor.id,
        },
        update: { isActive: false },
      });
    }
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: before ? "dropdown_option.update" : "dropdown_option.create",
      entityType: "dropdown_catalog_option",
      entityId: saved.id,
      before,
      after: { ...saved, catalog: parsed.catalog },
    });
    return saved;
  });

  revalidateCatalog(config.revalidate);
  return record;
}

async function migrateDropdownCatalogValue(
  tx: Prisma.TransactionClient,
  catalog: DropdownCatalogKey,
  from: string,
  to: string,
) {
  switch (catalog) {
    case "CRM_SOURCE":
      await Promise.all([
        tx.contact.updateMany({ where: { source: from }, data: { source: to } }),
        tx.lead.updateMany({ where: { source: from }, data: { source: to } }),
      ]);
      return;
    case "STUDENT_EDUCATION_LEVEL":
      await Promise.all([
        tx.student.updateMany({ where: { educationLevel: from }, data: { educationLevel: to } }),
        tx.lead.updateMany({ where: { educationLevel: from }, data: { educationLevel: to } }),
      ]);
      return;
    case "HR_DEPARTMENT":
      await Promise.all([
        tx.hrEmployee.updateMany({ where: { department: from }, data: { department: to } }),
        tx.hrBonusCampaign.updateMany({ where: { department: from }, data: { department: to } }),
      ]);
      return;
    case "HR_POSITION":
      await tx.hrEmployee.updateMany({ where: { position: from }, data: { position: to } });
      return;
    case "WORKSHOP_EVENT_TYPE":
      await tx.workshopEvent.updateMany({ where: { category: from }, data: { category: to } });
      return;
    case "MARKETING_CHANNEL":
      await tx.marketingCampaign.updateMany({ where: { channel: from }, data: { channel: to } });
      return;
    case "MARKETING_CONTENT_PLATFORM":
      await tx.marketingContentItem.updateMany({ where: { platform: from }, data: { platform: to } });
      return;
    case "MARKETING_CONTENT_FORMAT":
      await tx.marketingContentItem.updateMany({ where: { format: from }, data: { format: to } });
      return;
    case "MARKETING_EXPENSE_CATEGORY":
      await tx.marketingStrategyExpense.updateMany({ where: { category: from }, data: { category: to } });
  }
}

async function deleteDropdownCatalogOptionActionImpl(input: {
  catalog: DropdownCatalogKey;
  value: string;
  label: string;
}) {
  const parsed = z.object({
    catalog: catalogSchema,
    value: optionValueSchema,
    label: optionLabelSchema,
  }).parse(input);
  const config = catalogConfig[parsed.catalog];
  const actor = await requireMutationActor(config.permission);

  const record = await getPrisma().$transaction(async (tx) => {
    const before = await tx.dropdownCatalogOption.findUnique({
      where: { catalog_value: { catalog: parsed.catalog, value: parsed.value } },
      select: { id: true, value: true, label: true, isActive: true, isCustom: true },
    });
    const deleted = await tx.dropdownCatalogOption.upsert({
      where: { catalog_value: { catalog: parsed.catalog, value: parsed.value } },
      create: {
        catalog: parsed.catalog,
        value: parsed.value,
        label: parsed.label,
        isActive: false,
        isCustom: false,
        createdById: actor.id,
      },
      update: { isActive: false },
      select: { id: true },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "dropdown_option.delete",
      entityType: "dropdown_catalog_option",
      entityId: deleted.id,
      before: before ?? { value: parsed.value, label: parsed.label, catalog: parsed.catalog },
      after: { active: false },
    });
    return deleted;
  });

  revalidateCatalog(config.revalidate);
  return record;
}

function revalidateCatalog(paths: readonly string[]) {
  for (const path of paths) revalidatePath(path);
}

export const getDropdownCatalogOptionsAction = safeServerAction(
  getDropdownCatalogOptionsActionImpl,
  "Dropdown seçimləri yüklənmədi.",
);

export const saveDropdownCatalogOptionAction = safeServerAction(
  saveDropdownCatalogOptionActionImpl,
  "Dropdown seçimi saxlanmadı.",
);

export const deleteDropdownCatalogOptionAction = safeServerAction(
  deleteDropdownCatalogOptionActionImpl,
  "Dropdown seçimi silinmədi.",
);
