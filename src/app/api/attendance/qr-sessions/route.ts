import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import { z } from "zod";
import { createAttendanceQrChallenge } from "@/modules/attendance/attendance-qr-service";
import { AttendanceIntegrationError } from "@/modules/attendance/mobile-attendance-contract";
import { toActionFailure } from "@/server/actions/safe-action";
import { requireErpActor } from "@/server/auth/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  slotId: z.string().uuid(),
  date: z.string().date(),
}).strict();

export async function POST(request: Request) {
  const requestId = randomUUID();
  try {
    const actor = await requireErpActor("attendance.manage");
    const body = bodySchema.parse(await request.json());
    const challenge = await createAttendanceQrChallenge(body, actor);
    const imageDataUrl = await QRCode.toDataURL(challenge.deepLink, {
      width: 720,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#101828", light: "#ffffff" },
    });
    return json({ ...challenge, imageDataUrl, requestId }, 200, requestId);
  } catch (error) {
    if (error instanceof AttendanceIntegrationError) {
      return json({ code: error.code, message: error.message, requestId }, error.httpStatus, requestId);
    }
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return json({ code: "INVALID_REQUEST", message: "QR sorğusu düzgün deyil.", requestId }, 400, requestId);
    }
    const failure = toActionFailure(error, "QR yaradıla bilmədi.");
    const status = failure.code === "UNAUTHORIZED" ? 401 : failure.code === "FORBIDDEN" ? 403 : 500;
    return json({ code: failure.code, message: failure.message, requestId }, status, requestId);
  }
}

function json(body: object, status: number, requestId: string) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store", "X-Request-Id": requestId },
  });
}
