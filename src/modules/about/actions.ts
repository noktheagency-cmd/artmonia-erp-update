"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { AppRole } from "@/generated/prisma/client";
import { writeAuditLog } from "@/modules/audit/audit-service";
import {
  ABOUT_PROFILE_SINGLETON_KEY,
  normalizeAboutValues,
  type AboutProfileSnapshot,
} from "@/modules/about/about-profile";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";

const aboutProfileSchema = z.object({
  title: z.string().trim().min(3).max(80),
  tagline: z.string().trim().min(10).max(180),
  story: z.string().trim().min(40).max(2_000),
  mission: z.string().trim().min(10).max(600),
  vision: z.string().trim().min(10).max(600),
  values: z.string().max(600).transform(normalizeAboutValues).pipe(
    z.array(z.string().min(2).max(80)).min(1).max(8),
  ),
});

async function updateAboutProfileActionImpl(formData: FormData): Promise<AboutProfileSnapshot> {
  const actor = await requireMutationActor();

  if (!actor.roles.includes(AppRole.SUPER_ADMIN)) {
    throw new PublicActionError(
      "Bu məlumatı yalnız Super Admin dəyişə bilər.",
      "FORBIDDEN",
    );
  }

  const parsed = aboutProfileSchema.parse({
    title: formData.get("title"),
    tagline: formData.get("tagline"),
    story: formData.get("story"),
    mission: formData.get("mission"),
    vision: formData.get("vision"),
    values: formData.get("values"),
  });

  const saved = await getPrisma().$transaction(async (tx) => {
    const before = await tx.aboutProfile.findUnique({
      where: { singletonKey: ABOUT_PROFILE_SINGLETON_KEY },
      select: {
        id: true,
        title: true,
        tagline: true,
        story: true,
        mission: true,
        vision: true,
        values: true,
      },
    });
    const profile = await tx.aboutProfile.upsert({
      where: { singletonKey: ABOUT_PROFILE_SINGLETON_KEY },
      create: {
        singletonKey: ABOUT_PROFILE_SINGLETON_KEY,
        ...parsed,
        updatedById: actor.id,
      },
      update: {
        ...parsed,
        updatedById: actor.id,
      },
      select: {
        id: true,
        title: true,
        tagline: true,
        story: true,
        mission: true,
        vision: true,
        values: true,
        updatedAt: true,
      },
    });

    await writeAuditLog(tx, {
      actorUserId: actor.id,
      action: before ? "about_profile.update" : "about_profile.create",
      entityType: "about_profile",
      entityId: profile.id,
      before,
      after: {
        title: profile.title,
        tagline: profile.tagline,
        story: profile.story,
        mission: profile.mission,
        vision: profile.vision,
        values: profile.values,
      },
    });

    return profile;
  });

  revalidatePath("/about");

  return {
    title: saved.title,
    tagline: saved.tagline,
    story: saved.story,
    mission: saved.mission,
    vision: saved.vision,
    values: saved.values,
    updatedAt: saved.updatedAt.toISOString(),
  };
}

export const updateAboutProfileAction = safeServerAction(
  updateAboutProfileActionImpl,
  "“Biz kimik” məlumatı saxlanmadı.",
);
