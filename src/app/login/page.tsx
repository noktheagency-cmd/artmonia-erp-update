import { redirect } from "next/navigation";
import Image from "next/image";
import { getCurrentErpUser } from "@/server/auth/session";
import { LoginForm } from "./login-form";
import { LoginSceneLazy } from "./login-scene-lazy";

export default async function LoginPage() {
  const currentUser = await getCurrentErpUser();

  if (currentUser) {
    redirect("/dashboard");
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

        <LoginForm />

        <p className="kinetic-footer">Artmonia ERP <i /> Daxili idarəetmə sistemi</p>
      </section>
    </main>
  );
}
