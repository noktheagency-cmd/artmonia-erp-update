import "server-only";

import { requireErpActor } from "@/server/auth/actor";
import { createSupabaseServerClient } from "@/server/supabase/server";
import {
  mapDepartmentRow,
  mapDocumentRow,
  type PlaybookData,
} from "@/modules/playbook/playbook-types";

export async function getPlaybookData(): Promise<PlaybookData> {
  await requireErpActor("playbook.read");
  const supabase = await createSupabaseServerClient();
  const [departmentResult, documentResult] = await Promise.all([
    supabase
      .from("playbook_departments")
      .select("*")
      .order("position", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("playbook_documents")
      .select("*")
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
