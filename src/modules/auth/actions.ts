"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { z } from "zod";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { readSessionRequestMetadata } from "@/modules/audit/session-device";
import { getCurrentErpUser } from "@/server/auth/session";
import { getPrisma } from "@/server/db/prisma";
import { createSupabaseServerClient } from "@/server/supabase/server";

const signInSchema = z.object({
  email: z.string().trim().email().max(180),
  password: z.string().min(6).max(160),
  next: z.string().max(2_000).optional(),
});

export type SignInState = {
  error?: string;
};

export async function signInAction(
  _previousState: SignInState,
  formData: FormData,
): Promise<SignInState> {
  const input = signInSchema.safeParse(Object.fromEntries(formData));

  if (!input.success) {
    return { error: "Düzgün e-poçt və şifrə daxil edin." };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.data.email,
    password: input.data.password,
  });

  if (error || !data.user) {
    return { error: "E-poçt və ya şifrə yanlışdır." };
  }

  const erpUser = await getPrisma().user.findUnique({
    where: { authUserId: data.user.id },
    select: {
      id: true,
      isActive: true,
    },
  });

  if (!erpUser?.isActive) {
    await supabase.auth.signOut();
    return { error: "Bu hesab aktiv Artmonia ERP istifadəçisinə bağlı deyil." };
  }

  const next =
    input.data.next?.startsWith("/") && !input.data.next.startsWith("//")
      ? input.data.next
      : "/dashboard";

  revalidatePath("/", "layout");
  redirect(next as Route);
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  const currentUser = await getCurrentErpUser();

  if (currentUser) {
    const metadata = readSessionRequestMetadata(await headers());
    await getPrisma().$transaction(async (tx) => {
      await tx.authSessionRecord.updateMany({
        where: { id: currentUser.currentSessionId, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokedById: currentUser.id,
          revokeReason: "İstifadəçi bu cihazdan çıxış etdi",
        },
      });
      await writeAuditLog(tx, {
        actorUserId: currentUser.id,
        action: "SESSION_SIGNED_OUT",
        entityType: "auth_session",
        entityId: currentUser.currentSessionId,
        reason: "İstifadəçi bu cihazdan çıxış etdi",
        ipAddress: metadata.ipAddress,
        userAgent: metadata.userAgent,
      });
    });
  }

  await supabase.auth.signOut({ scope: "local" });
  revalidatePath("/", "layout");
  redirect("/login");
}
