import styles from "./setup.module.css";
import { MobilePasswordSetup } from "./password-setup";

export const dynamic = "force-dynamic";

export default function MobileAuthSetupPage() {
  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.brand}>ARTMONIA</div>
        <h1>Mobil hesabınızı tamamlayın</h1>
        <p>Dəvət linkini təsdiqləyin və yalnız sizin bildiyiniz yeni parolu yaradın.</p>
        <MobilePasswordSetup />
      </section>
    </main>
  );
}
