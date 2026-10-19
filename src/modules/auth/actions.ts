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

import { safeRedirectPath } from "@/server/auth/redirect-path";
import { consumeLoginAttempt, recordLoginEvent } from "@/server/auth/login-security";

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

  const metadata = readSessionRequestMetadata(await headers());
  try {
    if (!(await consumeLoginAttempt(input.data.email, metadata))) {
      return { error: "Çox sayda giriş cəhdi. 15 dəqiqə sonra yenidən yoxlayın." };
    }
  } catch (error) {
    console.error("Security event", {
      action: "auth.login.limiter_unavailable",
      message: error instanceof Error ? error.message : String(error),
      code: error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code ?? "") : undefined,
    });
    return { error: "Giriş müvəqqəti əlçatan deyil. Bir az sonra yenidən yoxlayın." };
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.data.email,
    password: input.data.password,
  });

  if (error || !data.user) {
    await recordLoginEvent("auth.login.failed", input.data.email, metadata);
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
    await recordLoginEvent("auth.login.denied", input.data.email, metadata);
    return { error: "E-poçt və ya şifrə yanlışdır." };
  }

  await recordLoginEvent("auth.login.succeeded", input.data.email, metadata, erpUser.id);
  const next = safeRedirectPath(input.data.next);

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
