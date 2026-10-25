import "server-only";
import { revalidatePath, updateTag } from "next/cache";
import { getPrisma } from "@/server/db/prisma";
import type { ErpActor } from "@/server/auth/actor";
import { erpCacheTags } from "@/modules/shared/cache-tags";
import { registerGuestStudent } from "./guest-registration-service";

export async function registerGuestStudentFromForm(form: FormData, actor: ErpActor) {
  await getPrisma().$transaction(tx => registerGuestStudent(tx, Object.fromEntries(form), actor), { timeout: 20000 });
  for (const tag of [erpCacheTags.students, erpCacheTags.crm, erpCacheTags.dashboard, erpCacheTags.slots]) updateTag(tag);
  for (const path of ["/students", "/students/single-lessons", "/crm", "/dashboard", "/groups", "/calendar"]) revalidatePath(path);
  return { redirectTo: "/students?tab=list" };
}
