import { randomUUID } from "node:crypto";
import QRCode from "qrcode";
import {
  getAttendanceSiteQr,
  rotateAttendanceSiteQr,
} from "@/modules/attendance/attendance-site-qr-service";
import { toActionFailure } from "@/server/actions/safe-action";
import { requireErpActor } from "@/server/auth/actor";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return handle(false);
}

export async function POST() {
  return handle(true);
}

async function handle(rotate: boolean) {
  const requestId = randomUUID();
  try {
    const actor = await requireErpActor("group.read");
    const site = rotate
      ? await rotateAttendanceSiteQr(actor)
      : await getAttendanceSiteQr(actor);
    const imageDataUrl = await QRCode.toDataURL(site.deepLink, {
      width: 1400,
      margin: 3,
      errorCorrectionLevel: "H",
      color: { dark: "#101828", light: "#ffffff" },
    });
    return json({ ...site, imageDataUrl, requestId }, 200, requestId);
  } catch (error) {
    const failure = toActionFailure(error, "Ümumi QR hazırlana bilmədi.");
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
