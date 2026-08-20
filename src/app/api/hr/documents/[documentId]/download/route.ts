import { NextResponse } from "next/server";
import { writeAuditLog } from "@/modules/audit/audit-service";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { createHrDocumentDownloadUrl } from "@/server/storage/hr-documents";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ documentId: string }> },
) {
  try {
    const actor = await requireErpActor("hr.document.read");
    const { documentId } = await params;
    if (!/^[0-9a-f-]{36}$/i.test(documentId)) return jsonError("Sənəd seçimi düzgün deyil", 400);
    const document = await getPrisma().hrEmployeeDocument.findUnique({
      where: { id: documentId },
      select: { id: true, employeeId: true, objectKey: true, originalName: true },
    });
    if (!document) return jsonError("Sənəd tapılmadı", 404);
    const signedUrl = await createHrDocumentDownloadUrl(document.objectKey);
    await getPrisma().$transaction((tx) => writeAuditLog(tx, {
      actorUserId: actor.id,
      action: "hr.document.download",
      entityType: "hr_employee_document",
      entityId: document.employeeId,
      after: { documentId: document.id, fileName: document.originalName },
      reason: "Qorunan əməkdaş sənədinə baxıldı",
    }));
    return NextResponse.redirect(signedUrl, { status: 307, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sənəd açıla bilmədi";
    if (message === "Unauthorized") return jsonError("Sessiya tapılmadı", 401);
    if (message.startsWith("Missing permission")) return jsonError("Bu sənədi görmək üçün icazəniz yoxdur", 403);
    if (/missing required environment variable/i.test(message)) return jsonError("Sənəd storage konfiqurasiyası tamamlanmayıb", 503);
    return jsonError("Sənəd açıla bilmədi", 500);
  }
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });
}
