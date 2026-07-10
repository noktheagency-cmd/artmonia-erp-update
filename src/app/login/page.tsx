import { redirect } from "next/navigation";
import { AlertTriangle, ArrowUpRight, AtSign, LockKeyhole } from "lucide-react";
import { signInAction } from "@/modules/auth/actions";
import { getCurrentErpUser } from "@/server/auth/session";
import { LoginScene } from "./login-scene";

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
    <main className="kinetic-login">
      <LoginScene />

      <header className="kinetic-wordmark" aria-label="Artmonia ERP">
        <span className="kinetic-wordmark-mark" aria-hidden="true">
          <i />
          <i />
        </span>
        <span>
          Art<span>monia</span>
        </span>
      </header>

      <section className="kinetic-panel" aria-label="Sign in">
        <div className="kinetic-panel-light" aria-hidden="true" />

        <div className="kinetic-heading">
          <h1>Sign in</h1>
        </div>

        <form action={signInAction} className="kinetic-form">
          <label className="kinetic-field">
            <span>Email</span>
            <span className="kinetic-input-shell">
              <AtSign aria-hidden="true" />
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                autoFocus
              />
              <i aria-hidden="true" />
            </span>
          </label>

          <label className="kinetic-field">
            <span>Password</span>
            <span className="kinetic-input-shell">
              <LockKeyhole aria-hidden="true" />
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={6}
              />
              <i aria-hidden="true" />
            </span>
          </label>

          {message ? (
            <p className="kinetic-error" role="alert">
              <AlertTriangle aria-hidden="true" />
              <span>{message}</span>
            </p>
          ) : null}

          <button className="kinetic-submit" type="submit">
            <span>Sign in</span>
            <span className="kinetic-submit-icon" aria-hidden="true">
              <ArrowUpRight />
            </span>
          </button>
        </form>
      </section>
    </main>
  );
}
