import { NextResponse } from "next/server";
import { z } from "zod";
import { requireErpActor } from "@/server/auth/actor";
import { getSupabaseAdminClient } from "@/server/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STORAGE_BUCKET = "playbook-documents";
const paramsSchema = z.object({ documentId: z.string().uuid() });
const querySchema = z.object({
  download: z.enum(["0", "1"]).default("0"),
});

export async function GET(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  try {
    await requireErpActor("playbook.read");

    const { documentId } = paramsSchema.parse(await context.params);
    const url = new URL(request.url);
    const { download } = querySchema.parse({
      download: url.searchParams.get("download") ?? "0",
    });

    const supabase = getSupabaseAdminClient();
    const documentResult = await supabase
      .from("playbook_documents")
      .select("storage_path, original_name")
      .eq("id", documentId)
      .maybeSingle();

    if (documentResult.error) {
      throw documentResult.error;
    }

    if (!documentResult.data) {
      return NextResponse.json(
        { error: "Sənəd tapılmadı." },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const signedUrlResult = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(
        documentResult.data.storage_path,
        300,
        download === "1" ? { download: documentResult.data.original_name } : undefined,
      );

    if (signedUrlResult.error) {
      console.error("Playbook signed URL could not be created", {
        documentId,
        message: signedUrlResult.error.message,
      });
      return NextResponse.json(
        { error: "Sənəd faylı tapılmadı." },
        { status: 404, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    return NextResponse.json(
      { url: signedUrlResult.data.signedUrl },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Sorğu parametrləri düzgün deyil." },
        { status: 400, headers: { "Cache-Control": "private, no-store" } },
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("Playbook signed URL request failed", { message });
    const status = message.includes("Missing permission")
      ? 403
      : message === "Unauthorized"
        ? 401
        : 500;

    return NextResponse.json(
      { error: "Sənəd açıla bilmədi." },
      {
        status,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
