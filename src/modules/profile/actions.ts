"use server";

import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { requireMutationActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { PublicActionError, safeServerAction } from "@/server/actions/safe-action";
import { deleteProfilePhoto, uploadProfilePhoto } from "@/server/storage/erp-files";

async function updateOwnProfilePhotoActionImpl(formData: FormData) {
  const actor = await requireMutationActor();
  const file = formData.get("profilePhoto");
  if (!(file instanceof File) || file.size === 0) {
    throw new PublicActionError("Profil şəkli seçilməyib.");
  }

  const uploadedUrl = await uploadProfilePhoto(file);
  let previousUrls: string[] = [];
  try {
    previousUrls = await getPrisma().$transaction(async (tx) => {
      const current = await tx.user.findUnique({
        where: { id: actor.id },
        select: {
          profilePhotoUrl: true,
          hrEmployeeProfile: { select: { id: true, profilePhotoUrl: true, archivedAt: true } },
        },
      });
      if (!current) throw new PublicActionError("Profil tapılmadı.", "NOT_FOUND");
      if (current.hrEmployeeProfile?.archivedAt) {
        throw new PublicActionError("Arxiv profilində şəkil dəyişdirilə bilməz.", "FORBIDDEN");
      }

      await tx.user.update({ where: { id: actor.id }, data: { profilePhotoUrl: uploadedUrl } });
      if (current.hrEmployeeProfile) {
        await tx.hrEmployee.update({
          where: { id: current.hrEmployeeProfile.id },
          data: { profilePhotoUrl: uploadedUrl },
        });
      }
      await writeAuditLog(tx, {
        actorUserId: actor.id,
        action: "profile.photo.update",
        entityType: "user",
        entityId: actor.id,
        before: { profilePhotoUrl: current.profilePhotoUrl },
        after: { profilePhotoUrl: uploadedUrl },
        reason: "İstifadəçi profil şəklini yenilədi",
      });
      return [current.profilePhotoUrl, current.hrEmployeeProfile?.profilePhotoUrl]
        .filter((value): value is string => Boolean(value));
    });
  } catch (error) {
    await deleteProfilePhoto(uploadedUrl).catch(() => undefined);
    throw error;
  }

  await Promise.all(
    [...new Set(previousUrls)]
      .filter((url) => url !== uploadedUrl)
      .map((url) => deleteProfilePhoto(url).catch(() => undefined)),
  );
  revalidatePath("/profile");
  revalidatePath("/hr");
  revalidatePath("/", "layout");
  return { profilePhotoUrl: uploadedUrl };
}

export const updateOwnProfilePhotoAction = safeServerAction(
  updateOwnProfilePhotoActionImpl,
  "Profil şəkli yenilənə bilmədi.",
);
