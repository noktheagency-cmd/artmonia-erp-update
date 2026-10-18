import type { Route } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { signOutAction } from "@/modules/auth/actions";
import { getNotificationShellCounts } from "@/modules/notifications/queries";
import { requireErpActor } from "@/server/auth/actor";

// Auth-bound shell: never prerender at build time (no session on Vercel/CI).
export const dynamic = "force-dynamic";

export default async function ErpLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let actor: Awaited<ReturnType<typeof requireErpActor>>;

  try {
    actor = await requireErpActor();
  } catch {
    redirect("/login" as Route);
  }

  const notificationCounts = await getNotificationShellCounts(actor.id);

  return (
    <AppShell
      currentUser={{
        id: actor.id,
        fullName: actor.fullName,
        email: actor.email,
        profilePhotoUrl: actor.profilePhotoUrl,
        roles: actor.roles,
        permissions: [...actor.permissions.keys()],
      }}
      initialNotificationCounts={notificationCounts}
      signOutAction={signOutAction}
      sessionGuardEnabled={Boolean(actor.currentSessionId)}
    >
      {children}
    </AppShell>
  );
}
