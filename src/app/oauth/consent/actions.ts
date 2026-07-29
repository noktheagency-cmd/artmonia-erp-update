"use server";

import { redirect } from "next/navigation";
import type { Route } from "next";
import { z } from "zod";
import { AppRole } from "@/generated/prisma/client";
import { getCurrentErpUser } from "@/server/auth/session";
import { requireEnv } from "@/server/env";
import { createSupabaseServerClient } from "@/server/supabase/server";

const decisionSchema = z.object({
  authorizationId: z.string().uuid(),
  decision: z.enum(["approve", "deny"]),
});

export async function decideOAuthConsent(formData: FormData) {
  const input = decisionSchema.parse(Object.fromEntries(formData));
  const currentUser = await getCurrentErpUser();

  if (!currentUser?.roles.includes(AppRole.SUPER_ADMIN)) {
    throw new Error("Only the active ERP Founder can authorize this connector");
  }

  const supabase = await createSupabaseServerClient();
  const detailsResult =
    await supabase.auth.oauth.getAuthorizationDetails(
      input.authorizationId,
    );

  if (
    detailsResult.error ||
    !detailsResult.data ||
    !("authorization_id" in detailsResult.data)
  ) {
    throw new Error("OAuth authorization request is no longer valid");
  }

  if (detailsResult.data.client.id !== requireEnv("MCP_OAUTH_CLIENT_ID")) {
    throw new Error("OAuth client is not approved for the ERP connector");
  }

  const result =
    input.decision === "approve"
      ? await supabase.auth.oauth.approveAuthorization(
          input.authorizationId,
          { skipBrowserRedirect: true },
        )
      : await supabase.auth.oauth.denyAuthorization(
          input.authorizationId,
          { skipBrowserRedirect: true },
        );

  if (result.error || !result.data?.redirect_url) {
    throw new Error("OAuth consent decision could not be completed");
  }

  redirect(result.data.redirect_url as Route);
}
