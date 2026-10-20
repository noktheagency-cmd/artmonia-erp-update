import { redirect } from "next/navigation";
import type { Route } from "next";
import { getErpSessionForMfa } from "@/server/auth/session";
import { isMfaChallengeExpired, mfaChallengeExpiresAt, needsMfa } from "@/server/auth/mfa-policy";
import { safeRedirectPath } from "@/server/auth/redirect-path";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { MfaForm } from "./mfa-form";
import styles from "./mfa.module.css";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRedirectPath((await searchParams).next);
  const user = await getErpSessionForMfa();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}` as Route);

  // Already fully authenticated — skip the challenge screen.
  if (!needsMfa(user.roles, user.hasVerifiedFactor, user.assuranceLevel)) {
    redirect(next as Route);
  }

  // Server-enforced deadline from password session creation (not client-resettable).
  if (isMfaChallengeExpired(user.sessionCreatedAt)) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: "local" });
    redirect(`/login?error=mfa_timeout&next=${encodeURIComponent(next)}` as Route);
  }

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <p className={styles.brand}>ARTMONIA ERP</p>
        <h1>İki mərhələli təsdiq</h1>
        <p>{user.fullName}, hesabınızı autentifikator tətbiqindəki kodla qoruyun.</p>
        <MfaForm next={next} challengeExpiresAt={mfaChallengeExpiresAt(user.sessionCreatedAt)} />
      </section>
    </main>
  );
}
