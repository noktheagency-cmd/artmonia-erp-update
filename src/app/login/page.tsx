import { redirect } from "next/navigation";
import type { Route } from "next";
import Image from "next/image";
import { getCurrentErpUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";
import { LoginSceneLazy } from "./login-scene-lazy";

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
    <main className="kinetic-login">
      <section className="kinetic-art" aria-label="Artmonia">
        <LoginSceneLazy />

        <header className="kinetic-wordmark">
          <Image
            src="/logo-login.png"
            alt="Artmonia"
            width={1254}
            height={1254}
            priority
            sizes="(max-width: 760px) 132px, 164px"
          />
        </header>
      </section>

      <section className="kinetic-panel" aria-label="Sign in">
        <div className="kinetic-heading">
          <h1>Xoş gəldiniz</h1>
          <p>Artmonia ERP hesabınıza daxil olun.</p>
        </div>

        <LoginForm next={next} />

        <p className="kinetic-footer">Artmonia ERP <i /> Daxili idarəetmə sistemi</p>
      </section>
    </main>
  );
}
