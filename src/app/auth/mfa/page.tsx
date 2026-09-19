import { redirect } from "next/navigation";
import { getErpSessionForMfa } from "@/server/auth/session";
import { MfaForm } from "./mfa-form";
import styles from "./mfa.module.css";
import { safeRedirectPath } from "@/server/auth/redirect-path";
import type { Route } from "next";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = safeRedirectPath((await searchParams).next);
  const user = await getErpSessionForMfa();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}` as Route);
  return <main className={styles.page}><section className={styles.card}>
    <p className={styles.brand}>ARTMONIA ERP</p>
    <h1>İki mərhələli təsdiq</h1>
    <p>{user.fullName}, hesabınızı autentifikator tətbiqindəki kodla qoruyun.</p>
    <MfaForm next={next} />
  </section></main>;
}
