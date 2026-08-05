"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { z } from "zod";
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
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
