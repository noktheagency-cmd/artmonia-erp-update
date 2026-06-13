import type { Route } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { signOutAction } from "@/modules/auth/actions";
import { formatTodayLabel } from "@/modules/shared/format";
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

  return (
    <AppShell
      currentUser={{
        fullName: actor.fullName,
        email: actor.email,
        roles: actor.roles,
      }}
      todayLabel={formatTodayLabel()}
      signOutAction={signOutAction}
    >
      {children}
    </AppShell>
  );
}
