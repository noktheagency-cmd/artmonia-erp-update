import { NextResponse } from "next/server";
import { z } from "zod";
import { requireErpActor } from "@/server/auth/actor";
import { getSupabaseAdminClient } from "@/server/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_BUCKET = "marketing-content-media";
const MAX_FILE_SIZE = 6 * 1024 * 1024;
const mimeExtensions = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["video/mp4", "mp4"],
  ["video/webm", "webm"],
  ["video/quicktime", "mov"],
]);
const deleteSchema = z.object({
  path: z.string().max(500).regex(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpg|png|webp|gif|mp4|webm|mov)$/i),
});

export async function POST(request: Request) {
  try {
    const actor = await requireErpActor("marketing.manage");
    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return jsonError("Şəkil və ya video seçilməyib.", 400);
    }
    if (file.size > MAX_FILE_SIZE) {
      return jsonError("Fayl 6 MB limitini keçir.", 413);
    }
    const extension = mimeExtensions.get(file.type);
    if (!extension) {
      return jsonError("JPG, PNG, WEBP, GIF, MP4, WEBM və ya MOV faylı seçin.", 415);
    }

    const path = `${actor.id}/${crypto.randomUUID()}.${extension}`;
    const supabase = getSupabaseAdminClient();
    const uploadResult = await supabase.storage
      .from(STORAGE_BUCKET)
      .upload(path, Buffer.from(await file.arrayBuffer()), {
        cacheControl: "31536000",
        contentType: file.type,
        upsert: false,
      });

    if (uploadResult.error) {
      console.error("Marketing content media upload failed", {
        actorUserId: actor.id,
        message: uploadResult.error.message,
      });
      return jsonError("Media faylı storage-a yüklənmədi.", 502);
    }

    const publicUrlResult = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return NextResponse.json(
      { path, url: publicUrlResult.data.publicUrl },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleError(error, "Media faylı yüklənmədi.");
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireErpActor("marketing.manage");
    const { path } = deleteSchema.parse(await request.json());
    const result = await getSupabaseAdminClient().storage.from(STORAGE_BUCKET).remove([path]);
    if (result.error) {
      console.error("Marketing content media cleanup failed", {
        actorUserId: actor.id,
        message: result.error.message,
      });
      return jsonError("Media faylı silinmədi.", 502);
    }
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return handleError(error, "Media faylı silinmədi.");
  }
}

function handleError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) return jsonError("Media yolu düzgün deyil.", 400);
  const message = error instanceof Error ? error.message : "";
  console.error("Marketing content media request failed", { message });
  if (message.includes("Missing permission")) return jsonError("Bu əməliyyat üçün icazəniz yoxdur.", 403);
  if (message === "Unauthorized") return jsonError("Sessiya tapılmadı.", 401);
  if (isDatabaseConnectionError(message)) {
    return jsonError("Database bağlantısı müvəqqəti əlçatan deyil. Bir neçə saniyə sonra yenidən yoxlayın.", 503);
  }
  return jsonError(fallback, 500);
}

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}

function isDatabaseConnectionError(message: string) {
  return /can't reach database server|connection terminated|connection timeout|econnrefused/i.test(message);
}
