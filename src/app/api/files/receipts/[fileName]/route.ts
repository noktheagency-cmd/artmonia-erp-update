import { NextResponse } from "next/server";
import { requireErpActor } from "@/server/auth/actor";
import { getSupabaseAdminClient } from "@/server/supabase/admin";
import { receiptObjectPath } from "@/server/storage/erp-files";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ fileName: string }> },
) {
  try {
    const actor = await requireErpActor();
    if (
      !actor.permissions.has("billing.payment.read") &&
      !actor.permissions.has("billing.expense.read") &&
      !actor.permissions.has("workshop.finance.read")
    ) {
      return jsonError("Bu qəbzə baxmaq üçün icazəniz yoxdur.", 403);
    }

    const { fileName } = await context.params;
    const objectPath = receiptObjectPath(fileName);
    if (!objectPath) {
      return jsonError("Qəbz yolu düzgün deyil.", 400);
    }

    const signedUrl = await getSupabaseAdminClient()
      .storage.from("erp-private-files")
      .createSignedUrl(objectPath, 60);
    if (signedUrl.error) {
      return jsonError("Qəbz faylı tapılmadı.", 404);
    }
    return NextResponse.redirect(signedUrl.data.signedUrl, {
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return jsonError(
      message === "Unauthorized"
        ? "Sessiya tapılmadı."
        : "Qəbz faylı açıla bilmədi.",
      message === "Unauthorized" ? 401 : 500,
    );
  }
}

function jsonError(error: string, status: number) {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "private, no-store" } },
  );
}
