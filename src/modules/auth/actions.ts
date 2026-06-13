"use server";

import type { Route } from "next";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getPrisma } from "@/server/db/prisma";
import { createSupabaseServerClient } from "@/server/supabase/server";

const signInSchema = z.object({
  email: z.string().trim().email().max(180),
  password: z.string().min(6).max(160),
});

export async function signInAction(formData: FormData) {
  const input = signInSchema.safeParse(Object.fromEntries(formData));

  if (!input.success) {
    redirectToLogin("invalid");
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: input.data.email,
    password: input.data.password,
  });

  if (error || !data.user) {
    redirectToLogin("credentials");
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
    redirectToLogin("unlinked");
  }

  redirect("/dashboard");
}

export async function signOutAction() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login" as Route);
}

function redirectToLogin(reason: string): never {
  redirect(`/login?error=${encodeURIComponent(reason)}` as Route);
}
