import type { Route } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { signOutAction } from "@/modules/auth/actions";
import { getAboutProfile } from "@/modules/about/queries";
import { requireErpActor } from "@/server/auth/actor";

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

  const aboutProfile = await getAboutProfile();

  return (
    <AppShell
      currentUser={{
        fullName: actor.fullName,
        email: actor.email,
        profilePhotoUrl: actor.profilePhotoUrl,
        roles: actor.roles,
        permissions: [...actor.permissions.keys()],
      }}
      aboutProfile={aboutProfile}
      signOutAction={signOutAction}
      sessionGuardEnabled={Boolean(actor.currentSessionId)}
    >
      {children}
    </AppShell>
  );
}
