import "server-only";

import { requireErpActor } from "@/server/auth/actor";
import { getSupabaseAdminClient } from "@/server/supabase/admin";
import {
  mapDepartmentRow,
  mapDocumentRow,
  type PlaybookData,
} from "@/modules/playbook/playbook-types";

export async function getPlaybookData(): Promise<PlaybookData> {
  await requireErpActor("playbook.read");
  const supabase = getSupabaseAdminClient();
  const [departmentResult, documentResult] = await Promise.all([
    supabase
      .from("playbook_departments")
      .select("id, name, slug, section, color, soft_color, icon, position, created_at, updated_at")
      .order("section", { ascending: true })
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("playbook_documents")
      .select("id, department_id, name, original_name, storage_path, extension, mime_type, size_bytes, page_count, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(300),
  ]);

  if (departmentResult.error) {
    throw new Error(`Playbook departments could not be loaded: ${departmentResult.error.message}`);
  }

  if (documentResult.error) {
    throw new Error(`Playbook documents could not be loaded: ${documentResult.error.message}`);
  }

  return {
    departments: departmentResult.data.map(mapDepartmentRow),
    documents: documentResult.data.map(mapDocumentRow),
  };
}
