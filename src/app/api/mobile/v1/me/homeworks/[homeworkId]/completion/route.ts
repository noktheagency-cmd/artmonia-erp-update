import { z } from "zod";
import {
  authenticateMobileStudentRequest,
  mobileError,
  mobileInternalError,
  mobileJson,
} from "@/modules/mobile/mobile-api";
import { mobileHomeworkCompletionSchema } from "@/modules/mobile/mobile-portal-contract";
import {
  MobilePortalError,
  setMobileHomeworkCompletion,
} from "@/modules/mobile/mobile-portal-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const homeworkIdSchema = z.string().uuid();

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ homeworkId: string }> },
) {
  const auth = await authenticateMobileStudentRequest(request);
  if (!auth.ok) return auth.response;
  const requestId = auth.context.requestId;
  try {
    const homeworkId = homeworkIdSchema.parse((await params).homeworkId);
    const input = mobileHomeworkCompletionSchema.parse(await request.json());
    return mobileJson(
      await setMobileHomeworkCompletion(auth.context.identity, homeworkId, input),
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
