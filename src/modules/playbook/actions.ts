"use server";

import { requireErpActor } from "@/server/auth/actor";
import { getSupabaseAdminClient } from "@/server/supabase/admin";
import type { ActionResult } from "@/lib/action-result";
import {
  mapDepartmentRow,
  type PlaybookDepartment,
  type PlaybookIconName,
  type PlaybookSection,
} from "@/modules/playbook/playbook-types";
import type { EffectivePermissions } from "@/server/rbac/permissions";

const iconValues = new Set<PlaybookIconName>([
  "marketing",
  "sales",
  "people",
  "finance",
  "briefcase",
  "book",
  "shield",
  "support",
]);

const sectionValues = new Set<PlaybookSection>(["GUIDELINE", "ARCHIVE"]);
const colorPattern = /^#[0-9a-fA-F]{6}$/;

type DepartmentInput = {
  name: string;
  section: PlaybookSection;
  color: string;
  softColor: string;
  icon: PlaybookIconName;
  position?: number;
};

export async function createPlaybookDepartmentAction(
  input: DepartmentInput,
): Promise<ActionResult<PlaybookDepartment>> {
  try {
    const actor = await requireErpActor("playbook.manage");
    const payload = validateDepartmentInput(input);
    assertGuidelineAccess(actor.permissions, payload.section);

    const supabase = getSupabaseAdminClient();
    const slug = await allocateUniqueSlug(supabase, payload.name);
    const position = payload.position ?? (await nextPosition(supabase, payload.section));

    const result = await supabase
      .from("playbook_departments")
      .insert({
        name: payload.name,
        slug,
        section: payload.section,
        color: payload.color,
        soft_color: payload.softColor,
        icon: payload.icon,
        position,
        created_by: actor.authUserId,
        updated_by: actor.authUserId,
      })
      .select("id, name, slug, section, color, soft_color, icon, position, created_at, updated_at")
      .single();

    if (result.error) {
      return mapWriteError(result.error, "Departament yaradıla bilmədi.");
    }

    return { ok: true, data: mapDepartmentRow(result.data) };
  } catch (error) {
    return mapCaughtError(error, "Departament yaradıla bilmədi.");
  }
}

export async function updatePlaybookDepartmentAction(input: {
  id: string;
  name: string;
  color: string;
  softColor: string;
  icon: PlaybookIconName;
}): Promise<ActionResult<PlaybookDepartment>> {
  try {
    const actor = await requireErpActor("playbook.manage");
    const id = String(input.id ?? "").trim();
    if (!id) {
      return { ok: false, code: "VALIDATION", message: "Departament tapılmadı." };
    }

    const name = normalizeName(input.name);
    if (!name) {
      return { ok: false, code: "VALIDATION", message: "Departament adı 2–80 simvol olmalıdır." };
    }
    if (!colorPattern.test(input.color) || !colorPattern.test(input.softColor)) {
      return { ok: false, code: "VALIDATION", message: "Rəng seçimi etibarsızdır." };
    }
    if (!iconValues.has(input.icon)) {
      return { ok: false, code: "VALIDATION", message: "İkon seçimi etibarsızdır." };
    }

    const supabase = getSupabaseAdminClient();
    const existing = await supabase
      .from("playbook_departments")
      .select("id, section")
      .eq("id", id)
      .maybeSingle();

    if (existing.error) {
      return mapWriteError(existing.error, "Departament yenilənə bilmədi.");
    }
    if (!existing.data) {
      return { ok: false, code: "NOT_FOUND", message: "Departament tapılmadı." };
    }

    assertGuidelineAccess(
      actor.permissions,
      existing.data.section as PlaybookSection,
    );

    const result = await supabase
      .from("playbook_departments")
      .update({
        name,
        color: input.color,
        soft_color: input.softColor,
        icon: input.icon,
        updated_by: actor.authUserId,
      })
      .eq("id", id)
      .select("id, name, slug, section, color, soft_color, icon, position, created_at, updated_at")
      .single();

    if (result.error) {
      return mapWriteError(result.error, "Departament yenilənə bilmədi.");
    }

    return { ok: true, data: mapDepartmentRow(result.data) };
  } catch (error) {
    return mapCaughtError(error, "Departament yenilənə bilmədi.");
  }
}

export async function deletePlaybookDepartmentAction(
  departmentId: string,
): Promise<ActionResult<{ storagePaths: string[] }>> {
  try {
    const actor = await requireErpActor("playbook.manage");
    const id = String(departmentId ?? "").trim();
    if (!id) {
      return { ok: false, code: "VALIDATION", message: "Departament tapılmadı." };
    }

    const supabase = getSupabaseAdminClient();
    const existing = await supabase
      .from("playbook_departments")
      .select("id, section")
      .eq("id", id)
      .maybeSingle();

    if (existing.error) {
      return mapWriteError(existing.error, "Departament silinə bilmədi.");
    }
    if (!existing.data) {
      return { ok: false, code: "NOT_FOUND", message: "Departament tapılmadı." };
    }

    assertGuidelineAccess(
      actor.permissions,
      existing.data.section as PlaybookSection,
    );

    const documentsResult = await supabase
      .from("playbook_documents")
      .select("storage_path")
      .eq("department_id", id);

    if (documentsResult.error) {
      return mapWriteError(documentsResult.error, "Departament silinə bilmədi.");
    }

    const storagePaths = (documentsResult.data ?? [])
      .map((item: { storage_path: string }) => item.storage_path)
      .filter(Boolean);

    const deleteDocuments = await supabase
      .from("playbook_documents")
      .delete()
      .eq("department_id", id);
    if (deleteDocuments.error) {
      return mapWriteError(deleteDocuments.error, "Departament silinə bilmədi.");
    }

    const deleteDepartment = await supabase
      .from("playbook_departments")
      .delete()
      .eq("id", id);

    if (deleteDepartment.error) {
      return mapWriteError(deleteDepartment.error, "Departament silinə bilmədi.");
    }

    return { ok: true, data: { storagePaths } };
  } catch (error) {
    return mapCaughtError(error, "Departament silinə bilmədi.");
  }
}

function validateDepartmentInput(input: DepartmentInput) {
  const name = normalizeName(input.name);
  const section = input.section;
  const icon = input.icon;

  if (!name) {
    throw validationError("Departament adı 2–80 simvol olmalıdır.");
  }
  if (!sectionValues.has(section)) {
    throw validationError("Bölmə seçimi etibarsızdır.");
  }
  if (!colorPattern.test(input.color) || !colorPattern.test(input.softColor)) {
    throw validationError("Rəng seçimi etibarsızdır.");
  }
  if (!iconValues.has(icon)) {
    throw validationError("İkon seçimi etibarsızdır.");
  }

  return {
    name,
    section,
    color: input.color,
    softColor: input.softColor,
    icon,
    position: input.position,
  };
}

function normalizeName(value: string) {
  const name = String(value ?? "").trim();
  return name.length >= 2 && name.length <= 80 ? name : "";
}

function assertGuidelineAccess(
  permissions: EffectivePermissions,
  section: PlaybookSection,
) {
  if (section === "GUIDELINE" && !permissions.has("playbook.guideline.read")) {
    const error = new Error("Guideline departamentləri üçün əlavə icazə lazımdır.");
    error.name = "ForbiddenError";
    throw error;
  }
}

async function nextPosition(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  section: PlaybookSection,
) {
  const result = await supabase
    .from("playbook_departments")
    .select("position")
    .eq("section", section)
    .order("position", { ascending: false })
    .limit(1);

  if (result.error) {
    throw result.error;
  }

  return Math.max(0, ...(result.data ?? []).map((row) => row.position)) + 10;
}

async function allocateUniqueSlug(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  name: string,
) {
  const base = slugify(name);
  const existing = await supabase
    .from("playbook_departments")
    .select("slug")
    .like("slug", `${base}%`);

  if (existing.error) {
    throw existing.error;
  }

  const taken = new Set((existing.data ?? []).map((row) => row.slug));
  if (!taken.has(base)) return base;

  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function slugify(name: string) {
  return (
    name
      .toLocaleLowerCase("az")
      .replace(/ə/g, "e")
      .replace(/ı/g, "i")
      .replace(/ö/g, "o")
      .replace(/ş/g, "s")
      .replace(/ü/g, "u")
      .replace(/ç/g, "c")
      .replace(/ğ/g, "g")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "departament"
  );
}

function validationError(message: string) {
  const error = new Error(message);
  error.name = "ValidationError";
  return error;
}

function mapWriteError(
  error: { code?: string; message?: string },
  fallback: string,
): ActionResult<never> {
  if (error.code === "23505") {
    return {
      ok: false,
      code: "DUPLICATE",
      message: "Bu adda departament artıq mövcuddur.",
    };
  }

  return {
    ok: false,
    code: "INTERNAL",
    message: error.message?.trim() || fallback,
  };
}

function mapCaughtError(error: unknown, fallback: string): ActionResult<never> {
  if (error instanceof Error) {
    if (error.message === "Unauthorized") {
      return { ok: false, code: "UNAUTHORIZED", message: "Yenidən daxil olun." };
    }
    if (error.message.startsWith("Missing permission:")) {
      return {
        ok: false,
        code: "FORBIDDEN",
        message: "Bu əməliyyat üçün hesabınızda lazımi icazə yoxdur.",
      };
    }
    if (error.name === "ValidationError") {
      return { ok: false, code: "VALIDATION", message: error.message };
    }
    if (error.name === "ForbiddenError") {
      return { ok: false, code: "FORBIDDEN", message: error.message };
    }
    return { ok: false, code: "INTERNAL", message: error.message || fallback };
  }

  if (error && typeof error === "object" && "message" in error) {
    return mapWriteError(error as { code?: string; message?: string }, fallback);
  }

  return { ok: false, code: "INTERNAL", message: fallback };
}
