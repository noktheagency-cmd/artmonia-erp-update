import type { Route } from "next";
import { redirect } from "next/navigation";
import type { ErpActor } from "@/server/auth/actor";
import { safeRedirectPath } from "@/server/auth/redirect-path";
import { getCurrentErpUser } from "@/server/auth/session";

/** Pages must redirect themselves: a parent layout cannot gate their render. */
export async function requireErpPageActor(returnTo = "/dashboard"): Promise<ErpActor> {
  const next = safeRedirectPath(returnTo);
  // Let the session loader's MFA redirect propagate without catching it.
  const actor = await getCurrentErpUser(next);
  if (!actor) redirect(`/login?next=${encodeURIComponent(next)}` as Route);
  return actor;
}
