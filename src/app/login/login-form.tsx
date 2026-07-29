"use client";

import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  LoaderCircle,
  LockKeyhole,
  Mail,
} from "lucide-react";
import { useActionState, useState } from "react";
import { signInAction, type SignInState } from "@/modules/auth/actions";

const initialState: SignInState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(signInAction, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="kinetic-form" aria-busy={pending}>
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label className="kinetic-field">
        <span>E-poçt</span>
        <span className="kinetic-input-shell">
          <Mail aria-hidden="true" />
          <input
            name="email"
            type="email"
            autoComplete="email"
            placeholder="ad@artmonia.az"
            required
            autoFocus
            disabled={pending}
          />
        </span>
      </label>

      <label className="kinetic-field">
        <span>Şifrə</span>
        <span className="kinetic-input-shell">
          <LockKeyhole aria-hidden="true" />
          <input
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            required
            minLength={6}
            disabled={pending}
          />
          <button
            className="kinetic-password-toggle"
            type="button"
            aria-label={showPassword ? "Şifrəni gizlət" : "Şifrəni göstər"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
            disabled={pending}
          >
            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
        </span>
      </label>

      <div className="kinetic-feedback" aria-live="polite">
        {state.error ? (
          <p className="kinetic-error" role="alert">
            <AlertCircle aria-hidden="true" />
            <span>{state.error}</span>
          </p>
        ) : pending ? (
          <p className="kinetic-pending-copy">Hesabınız yoxlanılır…</p>
        ) : null}
      </div>

      <button className="kinetic-submit" type="submit" disabled={pending}>
        <span>{pending ? "Daxil olunur…" : "Daxil ol"}</span>
        <span className="kinetic-submit-icon" aria-hidden="true">
          {pending ? <LoaderCircle className="kinetic-spinner" /> : <ArrowRight />}
        </span>
      </button>
    </form>
  );
}
