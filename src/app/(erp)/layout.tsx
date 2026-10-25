import { AppShell } from "@/components/layout/app-shell";
import { signOutAction } from "@/modules/auth/actions";
import { getNotificationShellCounts } from "@/modules/notifications/queries";
import { requireErpPageActor } from "@/server/auth/page-actor";

// Auth-bound shell: never prerender at build time (no session on Vercel/CI).
export const dynamic = "force-dynamic";

export default async function ErpLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const actor = await requireErpPageActor();

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
