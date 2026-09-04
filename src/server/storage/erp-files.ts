import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabaseAdminClient } from "@/server/supabase/admin";

const PUBLIC_BUCKET = "erp-public-assets";
const PRIVATE_BUCKET = "erp-private-files";
const RECEIPT_ROUTE_PREFIX = "/api/files/receipts/";

const profilePhotoExtensions = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const workshopPosterExtensions = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const programJourneyImageExtensions = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

const receiptExtensions = new Map([
  ["application/pdf", "pdf"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export async function uploadProfilePhoto(file: File) {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Profil şəkli 5 MB-dan böyük ola bilməz");
  }
  const extension = profilePhotoExtensions.get(file.type);
  if (!extension) {
    throw new Error("Profil şəkli JPEG, PNG və ya WebP formatında olmalıdır");
  }

  const objectPath = `profile-photos/${randomUUID()}.${extension}`;
  const supabase = getSupabaseAdminClient();
  const result = await supabase.storage
    .from(PUBLIC_BUCKET)
    .upload(objectPath, Buffer.from(await file.arrayBuffer()), {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });
  if (result.error) {
    throw new Error("Profil şəkli storage-a yüklənmədi");
  }
  return supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(objectPath).data
    .publicUrl;
}

export async function deleteProfilePhoto(fileUrl: string) {
  const marker = `/storage/v1/object/public/${PUBLIC_BUCKET}/`;
  const markerIndex = fileUrl.indexOf(marker);
  if (markerIndex < 0) return;
  const objectPath = decodeURIComponent(
    fileUrl.slice(markerIndex + marker.length),
  );
  if (!/^profile-photos\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(objectPath)) {
    return;
  }
  await getSupabaseAdminClient()
    .storage.from(PUBLIC_BUCKET)
    .remove([objectPath]);
}

export async function uploadWorkshopPoster(file: File) {
  if (file.size > 6 * 1024 * 1024) {
    throw new Error("Tədbir posteri 6 MB-dan böyük ola bilməz");
  }
  const extension = workshopPosterExtensions.get(file.type);
  if (!extension) {
    throw new Error("Tədbir posteri JPEG, PNG və ya WebP formatında olmalıdır");
  }

  const objectPath = `workshop-posters/${randomUUID()}.${extension}`;
  const supabase = getSupabaseAdminClient();
  const result = await supabase.storage
    .from(PUBLIC_BUCKET)
    .upload(objectPath, Buffer.from(await file.arrayBuffer()), {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });
  if (result.error) {
    throw new Error("Tədbir posteri storage-a yüklənmədi");
  }
  return supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(objectPath).data
    .publicUrl;
}

export async function deleteWorkshopPoster(fileUrl: string) {
  const marker = `/storage/v1/object/public/${PUBLIC_BUCKET}/`;
  const markerIndex = fileUrl.indexOf(marker);
  if (markerIndex < 0) return;
  const objectPath = decodeURIComponent(
    fileUrl.slice(markerIndex + marker.length),
  );
  if (!/^workshop-posters\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i.test(objectPath)) {
    return;
  }
  await getSupabaseAdminClient()
    .storage.from(PUBLIC_BUCKET)
    .remove([objectPath]);
}

export async function uploadProgramJourneyImage(
  file: File,
  input: { topicId: string; track: "H" | "HB" | "B" | "2B" },
) {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Journey şəkli 5 MB-dan böyük ola bilməz");
  }
  const extension = programJourneyImageExtensions.get(file.type);
  if (!extension) {
    throw new Error("Journey şəkli JPEG, PNG və ya WebP formatında olmalıdır");
  }
  if (!/^[0-9a-f-]{36}$/i.test(input.topicId)) {
    throw new Error("Journey addım identifikatoru yanlışdır");
  }

  const objectPath =
    "program-journey/" + input.topicId + "/" + input.track + "/" + randomUUID() + "." + extension;
  const supabase = getSupabaseAdminClient();
  const result = await supabase.storage
    .from(PUBLIC_BUCKET)
    .upload(objectPath, Buffer.from(await file.arrayBuffer()), {
      cacheControl: "31536000",
      contentType: file.type,
      upsert: false,
    });
  if (result.error) {
    throw new Error("Journey şəkli storage-a yüklənmədi");
  }
  return objectPath;
}

export function programJourneyImageUrl(objectPath: string | null) {
  if (!objectPath || !isProgramJourneyImagePath(objectPath)) return null;
  return getSupabaseAdminClient().storage.from(PUBLIC_BUCKET).getPublicUrl(objectPath).data
    .publicUrl;
}

export async function deleteProgramJourneyImage(objectPath: string | null) {
  if (!objectPath || !isProgramJourneyImagePath(objectPath)) return;
  await getSupabaseAdminClient().storage.from(PUBLIC_BUCKET).remove([objectPath]);
}

function isProgramJourneyImagePath(objectPath: string) {
  return /^program-journey\/[0-9a-f-]{36}\/(?:H|HB|B|2B)\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i
    .test(objectPath);
}

export async function uploadReceipt(file: File, idempotencyKey?: string) {
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Qəbz faylı 8 MB-dan böyük ola bilməz");
  }
  const extension = receiptExtensions.get(file.type);
  if (!extension) {
    throw new Error("Qəbz PDF, JPEG, PNG və ya WebP formatında olmalıdır");
  }

  const stableKey = idempotencyKey?.match(/^[0-9a-f-]{36}$/i)?.[0];
  const fileName = `${stableKey ?? randomUUID()}.${extension}`;
  const objectPath = `receipts/${fileName}`;
  const result = await getSupabaseAdminClient()
    .storage.from(PRIVATE_BUCKET)
    .upload(objectPath, Buffer.from(await file.arrayBuffer()), {
      cacheControl: "3600",
      contentType: file.type,
      upsert: Boolean(stableKey),
    });
  if (result.error) {
    throw new Error("Qəbz faylı storage-a yüklənmədi");
  }
  return {
    fileName: (file.name || "receipt").slice(0, 180),
    filePath: `${RECEIPT_ROUTE_PREFIX}${fileName}`,
  };
}

export function receiptObjectPath(fileName: string) {
  if (!/^[0-9a-f-]{36}\.(?:pdf|jpg|png|webp)$/i.test(fileName)) {
    return null;
  }
  return `receipts/${fileName}`;
}
