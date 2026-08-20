import { NextResponse } from "next/server";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import {
  createHrDocumentObjectKey,
  createHrDocumentUploadUrl,
  validateHrDocument,
} from "@/server/storage/hr-documents";

export async function POST(request: Request) {
  try {
    await requireErpActor("hr.document.manage");
    const body = await request.json() as { employeeId?: unknown; name?: unknown; type?: unknown; size?: unknown };
    const employeeId = String(body.employeeId ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(employeeId)) {
      return jsonError("Əməkdaş seçimi düzgün deyil", 400);
    }
    const [employee, documentCount] = await Promise.all([
      getPrisma().hrEmployee.findUnique({ where: { id: employeeId }, select: { id: true } }),
      getPrisma().hrEmployeeDocument.count({ where: { employeeId } }),
    ]);
    if (!employee) return jsonError("Əməkdaş tapılmadı", 404);
    if (documentCount >= 250) return jsonError("Bir əməkdaş üçün maksimum 250 sənəd əlavə edilə bilər", 409);
    const file = validateHrDocument({
      name: String(body.name ?? ""),
      type: String(body.type ?? ""),
      size: Number(body.size),
    });
    const objectKey = createHrDocumentObjectKey(employeeId, file.extension);
    const uploadUrl = await createHrDocumentUploadUrl({
      objectKey,
      mimeType: file.mimeType,
      size: file.size,
    });
    return NextResponse.json(
      { uploadUrl, objectKey, expiresIn: 300 },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sənəd yükləmə sorğusu hazırlanmadı";
    if (message === "Unauthorized") return jsonError("Sessiya tapılmadı", 401);
    if (message.startsWith("Missing permission")) return jsonError("Bu əməliyyat üçün icazəniz yoxdur", 403);
    if (/missing required environment variable/i.test(message)) return jsonError("Sənəd storage konfiqurasiyası tamamlanmayıb", 503);
    return jsonError(/[ƏəĞğİıÖöŞşÜüÇç]/.test(message) ? message : "Sənəd yükləmə sorğusu hazırlanmadı", 400);
  }
}

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status, headers: { "Cache-Control": "private, no-store" } });
}
