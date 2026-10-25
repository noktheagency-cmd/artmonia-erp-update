"use server";

import { revalidatePath } from "next/cache";
import { requireMutationActor } from "@/server/auth/actor";
import { safeServerAction } from "@/server/actions/safe-action";
import { getPrisma } from "@/server/db/prisma";
import { getSupabaseAdminClient } from "@/server/supabase/admin";
import { assertPermission } from "@/server/rbac/permissions";
import { accountLifecyclePermission, accountLifecycleSchema } from "./account-lifecycle-policy";
import { changeAccountLifecycle } from "./account-lifecycle-service";

async function changeRoleUserAccess(formData: FormData) {
  const actor = await requireMutationActor();
  const input = accountLifecycleSchema.parse(Object.fromEntries(formData));
  assertPermission(actor.permissions, accountLifecyclePermission(input.operation));
  const auth = getSupabaseAdminClient().auth.admin;
  try {
    return await changeAccountLifecycle(getPrisma(), {
      async apply(authUserId, operation) {
        return operation === "DELETE"
          ? auth.deleteUser(authUserId)
          : auth.updateUserById(authUserId, { ban_duration: operation === "ENABLE" ? "none" : "876000h" });
      },
    }, actor, input);
  } finally {
    revalidatePath("/settings/roles");
    revalidatePath("/audit");
    revalidatePath("/hr");
    revalidatePath("/", "layout");
  }
}

export const changeRoleUserAccessAction = safeServerAction(changeRoleUserAccess, "Giriş hesabı əməliyyatı tamamlanmadı.");
