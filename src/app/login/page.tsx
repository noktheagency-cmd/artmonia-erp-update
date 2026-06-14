import Image from "next/image";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, AtSign, LockKeyhole } from "lucide-react";
import { signInAction } from "@/modules/auth/actions";
import { getCurrentErpUser } from "@/server/auth/session";

const errorMessages: Record<string, string> = {
  credentials: "Email or password is incorrect.",
  invalid: "Enter a valid email and password.",
  unlinked: "This Supabase user is not linked to an active ERP user.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const currentUser = await getCurrentErpUser();

  if (currentUser) {
    redirect("/dashboard");
  }

  const { error } = await searchParams;
  const message = error ? errorMessages[error] ?? errorMessages.credentials : null;

  return (
    <main className="login-screen">
      <section className="login-shell" aria-label="Artmonia ERP login">
        <div className="login-art" aria-hidden="true">
          <div className="login-art-dots">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <div className="login-brush-orbit" />
          <div className="login-art-copy">
            <div className="login-art-logo-wrap">
              <Image className="login-art-logo" src="/logo-login.png" alt="" width={168} height={168} priority />
            </div>
            <h2>Artmonia ERP</h2>
            <p>Secure access for studio operations.</p>
          </div>
          <div className="login-art-lines">
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>

        <section className="login-panel" aria-label="Sign in">
          <div className="login-brand">
            <Image className="login-logo" src="/logo-login.png" alt="Artmonia ERP" width={56} height={56} priority />
            <div>
              <p>Artmonia ERP</p>
              <h1>Sign in</h1>
            </div>
          </div>

          <p className="login-mobile-copy">Secure access for studio operations.</p>

          <form action={signInAction} className="login-form">
            <label className="login-field">
              <span>Email</span>
              <span className="login-input-shell">
                <AtSign aria-hidden="true" />
                <input name="email" type="email" autoComplete="email" required autoFocus />
              </span>
            </label>
            <label className="login-field">
              <span>Password</span>
              <span className="login-input-shell">
                <LockKeyhole aria-hidden="true" />
                <input
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  minLength={6}
                />
              </span>
            </label>

            {message ? (
              <p className="login-error" role="alert">
                <AlertTriangle aria-hidden="true" />
                <span>{message}</span>
              </p>
            ) : null}

            <button className="ui-button login-submit" type="submit">
              <span>Sign in</span>
              <ArrowRight aria-hidden="true" />
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}
