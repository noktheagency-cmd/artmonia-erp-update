import { z } from "zod";
import { isBearerTokenAllowed } from "@/modules/attendance/mobile-attendance-auth";
import { getEnv } from "@/server/env";
import {
  getMobileRequestId,
  mobileError,
  mobileInternalError,
  mobileJson,
} from "@/modules/mobile/mobile-api";
import { MobilePortalError } from "@/modules/mobile/mobile-portal-errors";
import { boundedBody } from "@/modules/firca/request-body";
import { commentEventSchema } from "@/modules/firca/contract";
import { applyCommentEvent } from "@/modules/firca/service";
import { getPrisma } from "@/server/db/prisma";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const id = getMobileRequestId(request);
  const secret = getEnv().FIRCA_COMMUNITY_SERVER_TOKEN;
  if (
    !secret ||
    !isBearerTokenAllowed(request.headers.get("authorization"), [secret])
  )
    return mobileError(
      "UNAUTHORIZED",
      "Server autentifikasiyası tələb olunur.",
      401,
      id,
    );
  try {
    const raw = new TextDecoder().decode(await boundedBody(request, 16000));
    const input = commentEventSchema.parse(JSON.parse(raw));
    return mobileJson(
      await getPrisma().$transaction((tx) => applyCommentEvent(tx, input), {
        timeout: 15000,
      }),
      200,
      id,
    );
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError)
      return mobileError("INVALID_REQUEST", "Sorğu düzgün deyil.", 400, id);
    if (error instanceof MobilePortalError)
      return mobileError(error.code, error.message, error.status, id);
    return mobileInternalError(error, id);
  }
}
