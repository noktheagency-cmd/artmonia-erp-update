import type { Route } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { getCurrentErpUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";
import { LoginSceneLazy } from "./login-scene-lazy";
import styles from "./login.module.css";

type LoginPageProps = {
  searchParams: Promise<{ next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { next: requestedNext } = await searchParams;
  const next =
    requestedNext?.startsWith("/") && !requestedNext.startsWith("//")
      ? requestedNext
      : undefined;
  const currentUser = await getCurrentErpUser();

  if (currentUser) {
    redirect((next ?? "/dashboard") as Route);
  }

  return (
    <main className={styles.login}>
      <section className={styles.art} aria-label="Artmonia 3D animasiyası">
        <header className={styles.wordmark}>
          <Image
            src="/logo-login.png"
            alt="Artmonia"
            width={1254}
            height={1254}
            priority
            sizes="(max-width: 760px) 126px, 170px"
          />
        </header>

        <LoginSceneLazy />
      </section>

      <section className={styles.panel} aria-label="Daxil ol">
        <div className={styles.panelContent}>
          <div className={styles.heading}>
            <h1>
              <span className={styles.headingTitle}>Xoş gəlmisiniz</span>
            </h1>
            <p className={styles.motto}>Xəyal etdiyin hər şey gerçəkdir</p>
          </div>

          <LoginForm next={next} />

          <p className={styles.footer}>
            <span>Artmonia ERP</span>
            <i aria-hidden="true" />
            <span>Daxili idarəetmə sistemi</span>
          </p>
        </div>
      </section>
    </main>
  );
}
