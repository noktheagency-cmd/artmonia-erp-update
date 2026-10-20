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
import styles from "./login.module.css";

const initialState: SignInState = {};

export function LoginForm({ next, authNotice }: { next?: string; authNotice?: string }) {
  const [state, formAction, pending] = useActionState(signInAction, initialState);
  const [showPassword, setShowPassword] = useState(false);
  const visibleError = state.error ?? authNotice;

  return (
    <form action={formAction} className={styles.form} aria-busy={pending}>
      {next ? <input type="hidden" name="next" value={next} /> : null}

      <div className={styles.field}>
        <label htmlFor="login-email">E-poçt</label>
        <div className={styles.inputShell}>
          <span className={styles.inputIcon} aria-hidden="true">
            <Mail />
          </span>
          <input
            id="login-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="ad@artmonia.az"
            required
            autoFocus
            disabled={pending}
          />
        </div>
      </div>

      <div className={styles.field}>
        <label htmlFor="login-password">Şifrə</label>
        <div className={styles.inputShell}>
          <span className={styles.inputIcon} aria-hidden="true">
            <LockKeyhole />
          </span>
          <input
            id="login-password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••"
            required
            minLength={6}
            disabled={pending}
          />
          <button
            className={styles.passwordToggle}
            type="button"
            aria-label={showPassword ? "Şifrəni gizlət" : "Şifrəni göstər"}
            aria-pressed={showPassword}
            onClick={() => setShowPassword((visible) => !visible)}
            disabled={pending}
          >
            {showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
          </button>
        </div>
      </div>

      <div className={styles.feedback} aria-live="polite">
        {visibleError ? (
          <p className={styles.error} role="alert">
            <AlertCircle aria-hidden="true" />
            <span>{visibleError}</span>
          </p>
        ) : pending ? (
          <p className={styles.pending}>Hesabınız yoxlanılır…</p>
        ) : null}
      </div>

      <button className={styles.submit} type="submit" disabled={pending}>
        <span>{pending ? "Daxil olunur…" : "Daxil ol"}</span>
        <span className={styles.submitIcon} aria-hidden="true">
          {pending ? <LoaderCircle className={styles.spinner} /> : <ArrowRight />}
        </span>
      </button>
    </form>
  );
}
