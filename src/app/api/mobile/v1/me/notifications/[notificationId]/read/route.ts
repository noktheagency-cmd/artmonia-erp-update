import { z } from "zod";
import {
  authenticateMobileStudentRequest,
  mobileError,
  mobileInternalError,
  mobileJson,
} from "@/modules/mobile/mobile-api";
import { setMobileNotificationRead } from "@/modules/mobile/mobile-academic-service";
import { mobileNotificationReadSchema } from "@/modules/mobile/mobile-portal-contract";
import { MobilePortalError } from "@/modules/mobile/mobile-portal-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const notificationIdSchema = z.string().trim().min(3).max(180).regex(/^[a-z_]+:[a-z0-9:-]+$/i);

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ notificationId: string }> },
) {
  const auth = await authenticateMobileStudentRequest(request);
  if (!auth.ok) return auth.response;
  const requestId = auth.context.requestId;
  try {
    const notificationId = notificationIdSchema.parse((await params).notificationId);
    const input = mobileNotificationReadSchema.parse(await request.json());
    return mobileJson(
      await setMobileNotificationRead(auth.context.identity, notificationId, input),
      200,
      requestId,
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return mobileError("INVALID_REQUEST", "Sorğu məlumatı düzgün deyil.", 400, requestId);
    }
    if (error instanceof MobilePortalError) {
      return mobileError(error.code, error.message, error.status, requestId);
    }
    return mobileInternalError(error, requestId);
  }
}
