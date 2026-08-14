import "server-only";

import { getPrisma } from "@/server/db/prisma";
import {
  ABOUT_PROFILE_SINGLETON_KEY,
  defaultAboutProfile,
  type AboutProfileSnapshot,
} from "@/modules/about/about-profile";

export async function getAboutProfile(): Promise<AboutProfileSnapshot> {
  let profile;

  try {
    profile = await getPrisma().aboutProfile.findUnique({
      where: { singletonKey: ABOUT_PROFILE_SINGLETON_KEY },
      select: {
        title: true,
        tagline: true,
        story: true,
        mission: true,
        vision: true,
        values: true,
        updatedAt: true,
      },
    });
  } catch (error) {
    if (process.env.NODE_ENV !== "production" && getErrorCode(error) === "P2021") {
      return defaultAboutProfile;
    }
    throw error;
  }

  if (!profile) return defaultAboutProfile;

  return {
    ...profile,
    updatedAt: profile.updatedAt.toISOString(),
  };
}

function getErrorCode(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return undefined;
  const value = (error as { code?: unknown }).code;
  return typeof value === "string" ? value : undefined;
}
