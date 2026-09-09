import { redirect } from "next/navigation";
import { getErpSessionForMfa } from "@/server/auth/session";
import { MfaForm } from "./mfa-form";
import styles from "./mfa.module.css";

export default async function MfaPage() {
  const user = await getErpSessionForMfa();
  if (!user) redirect("/login");
  return <main className={styles.page}><section className={styles.card}>
    <p className={styles.brand}>ARTMONIA ERP</p>
    <h1>İki mərhələli təsdiq</h1>
    <p>{user.fullName}, hesabınızı autentifikator tətbiqindəki kodla qoruyun.</p>
    <MfaForm />
  </section></main>;
}
