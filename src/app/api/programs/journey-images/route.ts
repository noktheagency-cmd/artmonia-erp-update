import { NextResponse } from "next/server";
import { z } from "zod";
import { getPrisma } from "@/server/db/prisma";
import { requireErpActor } from "@/server/auth/actor";
import {
  deleteProgramJourneyImage,
  programJourneyImageUrl,
  uploadProgramJourneyImage,
} from "@/server/storage/erp-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uploadSchema = z.object({
  topicId: z.string().uuid(),
  track: z.enum(["H", "HB", "B", "2B"]),
});
const deleteSchema = z.object({
  path: z.string().max(500).regex(
    /^program-journey\/[0-9a-f-]{36}\/(?:H|HB|B|2B)\/[0-9a-f-]{36}\.(?:jpg|png|webp)$/i,
  ),
});

export async function POST(request: Request) {
  try {
    await requireErpActor("settings.manage");
    const formData = await request.formData();
    const input = uploadSchema.parse({
      topicId: formData.get("topicId"),
      track: formData.get("track"),
    });
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return jsonError("Şəkil seçilməyib.", 400);
    }

    const path = await uploadProgramJourneyImage(file, input);
    return NextResponse.json(
      { path, url: programJourneyImageUrl(path) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleError(error, "Journey şəkli yüklənmədi.");
  }
}

export async function DELETE(request: Request) {
  try {
    await requireErpActor("settings.manage");
    const { path } = deleteSchema.parse(await request.json());
    const usage = await getPrisma().programLessonMaterial.count({
      where: { imageObjectPath: path },
    });
    if (usage > 0) {
      return jsonError("İstifadədə olan Journey şəkli silinə bilməz.", 409);
    }

    await deleteProgramJourneyImage(path);
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return handleError(error, "Journey şəkli silinmədi.");
  }
}

function handleError(error: unknown, fallback: string) {
  if (error instanceof z.ZodError) {
    return jsonError("Journey şəkil məlumatları düzgün deyil.", 400);
  }
  const message = error instanceof Error ? error.message : "";
  console.error("Program Journey image request failed", { message });
  if (message.includes("Missing permission")) {
    return jsonError("Bu əməliyyat üçün icazəniz yoxdur.", 403);
  }
  if (message === "Unauthorized") return jsonError("Sessiya tapılmadı.", 401);
  if (message.includes("5 MB")) return jsonError(message, 413);
  if (message.includes("JPEG")) return jsonError(message, 415);
  return jsonError(fallback, 500);
}

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
