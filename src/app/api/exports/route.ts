import { NextResponse } from "next/server";
import { exportRequestSchema } from "@/modules/exports/export-config";
import { auditExport, prepareExport } from "@/modules/exports/export-service";
import { createCsvFile, createPdfFile } from "@/modules/exports/export-files";
import { requireErpActor } from "@/server/auth/actor";
import { toActionFailure } from "@/server/actions/safe-action";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const actor = await requireErpActor("report.export");
    const parsed = exportRequestSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "İxrac sorğusu etibarlı deyil." }, { status: 400 });
    }

    const exportData = await prepareExport(parsed.data);
    await auditExport(actor, parsed.data, exportData.rows.length);
    const filename = `${slugify(exportData.title)}-${new Date().toISOString().slice(0, 10)}.${parsed.data.format}`;

    if (parsed.data.format === "csv") {
      return new Response(createCsvFile(exportData), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }

    const pdf = await createPdfFile(exportData);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const failure = toActionFailure(error, "İxrac hazırlana bilmədi.");
    const status =
      failure.code === "UNAUTHORIZED"
        ? 401
        : failure.code === "FORBIDDEN"
          ? 403
          : failure.code === "VALIDATION"
            ? 422
            : 500;
    return NextResponse.json(
      { error: failure.message, code: failure.code, errorId: failure.errorId },
      { status, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

function slugify(value: string) {
  return value
    .toLocaleLowerCase("az")
    .replaceAll("ə", "e")
    .replaceAll("ı", "i")
    .replaceAll("ö", "o")
    .replaceAll("ü", "u")
    .replaceAll("ğ", "g")
    .replaceAll("ş", "s")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
