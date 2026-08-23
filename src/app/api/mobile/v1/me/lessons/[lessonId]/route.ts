import { z } from "zod";
import {
  authenticateMobileStudentRequest,
  mobileError,
  mobileInternalError,
  mobileJson,
} from "@/modules/mobile/mobile-api";
import { getMobileLessonDetail, MobilePortalError } from "@/modules/mobile/mobile-portal-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const lessonIdSchema = z.string().uuid();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  const auth = await authenticateMobileStudentRequest(request);
  if (!auth.ok) return auth.response;
  const requestId = auth.context.requestId;
  try {
    const lessonId = lessonIdSchema.parse((await params).lessonId);
    return mobileJson(
      await getMobileLessonDetail(auth.context.identity, lessonId),
      200,
      requestId,
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return mobileError("LESSON_NOT_FOUND", "Dərs tapılmadı.", 404, requestId);
    }
    if (error instanceof MobilePortalError) {
      return mobileError(error.code, error.message, error.status, requestId);
    }
    return mobileInternalError(error, requestId);
  }
}
