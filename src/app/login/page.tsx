import Image from "next/image";
import { redirect } from "next/navigation";
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
      <section className="login-panel" aria-label="Artmonia ERP login">
        <div className="login-brand">
          <Image className="login-logo" src="/logo.png" alt="Artmonia ERP" width={46} height={46} priority />
          <div>
            <p>Artmonia ERP</p>
            <h1>Sign in</h1>
          </div>
        </div>

        <form action={signInAction} className="login-form">
          <label className="form-field">
            <span>Email</span>
            <input name="email" type="email" autoComplete="email" required />
          </label>
          <label className="form-field">
            <span>Password</span>
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              minLength={6}
            />
          </label>

          {message ? <p className="login-error">{message}</p> : null}

          <button className="ui-button login-submit" type="submit">
            Sign in
          </button>
        </form>
      </section>
    </main>
  );
}
