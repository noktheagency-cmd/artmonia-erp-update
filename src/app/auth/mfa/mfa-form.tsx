"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createSupabaseBrowserClient } from "@/server/supabase/browser";
import styles from "./mfa.module.css";

const CODE_LENGTH = 6;

export function MfaForm({
  next = "/dashboard",
  challengeExpiresAt,
}: {
  next?: string;
  challengeExpiresAt: number;
}) {
  const [factorId, setFactorId] = useState<string>();
  const [qr, setQr] = useState<string>();
  const [secret, setSecret] = useState<string>();
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length: CODE_LENGTH }, () => ""));
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(() =>
    Math.max(0, Math.ceil((challengeExpiresAt - Date.now()) / 1000)),
  );
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const code = digits.join("");

  const expireToLogin = useCallback(async () => {
    setBusy(true);
    setError("Təsdiq vaxtı bitdi. Yenidən daxil olun.");
    try {
      await createSupabaseBrowserClient().auth.signOut({ scope: "local" });
    } catch {
      // Still force navigation even if local sign-out fails.
    }
    window.location.assign(`/login?error=mfa_timeout&next=${encodeURIComponent(next)}`);
  }, [next]);

  useEffect(() => {
    let active = true;
    void createSupabaseBrowserClient().auth.mfa.listFactors().then(({ data, error: listError }) => {
      if (!active) return;
      if (listError) {
        setError("Təsdiq üsulları yüklənmədi. Səhifəni yeniləyin.");
        return;
      }
      const factor = data.totp.find((item) => item.status === "verified");
      setFactorId(factor?.id);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((challengeExpiresAt - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining <= 0) {
        void expireToLogin();
      }
    };
    tick();
    const timer = window.setInterval(tick, 250);
    return () => window.clearInterval(timer);
  }, [challengeExpiresAt, expireToLogin]);

  function focusDigit(index: number) {
    inputRefs.current[index]?.focus();
    inputRefs.current[index]?.select();
  }

  function updateDigits(nextDigits: string[]) {
    setDigits(nextDigits);
    setError("");
  }

  function handleDigitChange(index: number, raw: string) {
    const cleaned = raw.replace(/\D/g, "");
    if (!cleaned) {
      const nextDigits = [...digits];
      nextDigits[index] = "";
      updateDigits(nextDigits);
      return;
    }

    const chars = cleaned.slice(0, CODE_LENGTH - index).split("");
    const nextDigits = [...digits];
    chars.forEach((char, offset) => {
      nextDigits[index + offset] = char;
    });
    updateDigits(nextDigits);
    const nextIndex = Math.min(index + chars.length, CODE_LENGTH - 1);
    focusDigit(nextIndex);
  }

  function handleDigitKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      const nextDigits = [...digits];
      nextDigits[index - 1] = "";
      updateDigits(nextDigits);
      focusDigit(index - 1);
      return;
    }
    if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      focusDigit(index - 1);
    }
    if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      event.preventDefault();
      focusDigit(index + 1);
    }
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (!pasted) return;
    const nextDigits = Array.from({ length: CODE_LENGTH }, (_, index) => pasted[index] ?? "");
    updateDigits(nextDigits);
    focusDigit(Math.min(pasted.length, CODE_LENGTH) - 1);
  }

  async function enroll() {
    setBusy(true);
    setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      // Only incomplete setups may be replaced; verified factors are never removed here.
      for (const factor of factors.all.filter((item) => item.factor_type === "totp" && item.status === "unverified")) {
        const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
        if (unenrollError) throw unenrollError;
      }
      const existing = factors.totp.find((item) => item.status === "verified");
      if (existing) {
        setFactorId(existing.id);
        return;
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        issuer: "Artmonia ERP",
        friendlyName: "Artmonia autentifikator",
      });
      if (enrollError) throw enrollError;
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      window.setTimeout(() => focusDigit(0), 0);
    } catch {
      setError("Autentifikator qurulmadı. Yenidən cəhd edin.");
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (secondsLeft <= 0) {
      void expireToLogin();
      return;
    }
    if (!factorId || !/^\d{6}$/.test(code)) return;
    setBusy(true);
    setError("");
    try {
      const { error: verifyError } = await createSupabaseBrowserClient().auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (verifyError) throw verifyError;
      setQr(undefined);
      setSecret(undefined);
      setDigits(Array.from({ length: CODE_LENGTH }, () => ""));
      setVerified(true);
      // A full navigation clears password-only RSC state after the assurance upgrade.
      window.location.assign(next);
    } catch {
      setError("Kod yanlışdır və ya vaxtı bitib. Cari 6 rəqəmli kodu daxil edin.");
      setDigits(Array.from({ length: CODE_LENGTH }, () => ""));
      focusDigit(0);
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    const { error: signOutError } = await createSupabaseBrowserClient().auth.signOut({ scope: "local" });
    if (signOutError) {
      setError("Çıxış alınmadı. Yenidən cəhd edin.");
      setBusy(false);
      return;
    }
    // Drop authenticated client caches after sign-out.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  const minutes = String(Math.floor(secondsLeft / 60)).padStart(1, "0");
  const seconds = String(secondsLeft % 60).padStart(2, "0");
  const timerUrgent = secondsLeft <= 30;

  return (
    <div className={styles.form}>
      <p className={styles.timer} data-urgent={timerUrgent || undefined} role="timer" aria-live="polite">
        Qalan vaxt: <strong>{minutes}:{seconds}</strong>
      </p>
      {!ready && !error ? <p>Yüklənir…</p> : null}
      {ready && !factorId ? (
        <>
          <p>Google Authenticator, Microsoft Authenticator və ya başqa TOTP tətbiqi ilə qurun.</p>
          <button type="button" disabled={busy || secondsLeft <= 0} onClick={enroll}>
            Autentifikatoru qur
          </button>
        </>
      ) : null}
      {qr ? (
        <>
          <p>QR kodunu autentifikatorla skan edin. Məxfi açarı təhlükəsiz yerdə saxlayın.</p>
          {/* Supabase-generated QR is an image, never injected as HTML. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className={styles.qr}
            src={qr.startsWith("data:") ? qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`}
            alt="Autentifikator üçün QR kod"
            width={220}
            height={220}
          />
          <details>
            <summary>Əl ilə daxil etmə açarı</summary>
            <code>{secret}</code>
          </details>
        </>
      ) : null}
      {factorId && !verified ? (
        <form onSubmit={verify}>
          <label id="mfa-code-label" htmlFor="mfa-code-0">
            Təsdiq kodu
          </label>
          <div className={styles.otpRow} role="group" aria-labelledby="mfa-code-label">
            {digits.map((digit, index) => (
              <input
                key={index}
                id={`mfa-code-${index}`}
                ref={(node) => {
                  inputRefs.current[index] = node;
                }}
                className={styles.otpCell}
                type="text"
                inputMode="numeric"
                autoComplete={index === 0 ? "one-time-code" : "off"}
                autoFocus={index === 0}
                pattern="[0-9]"
                maxLength={1}
                value={digit}
                disabled={busy || secondsLeft <= 0}
                aria-label={`${index + 1}-ci rəqəm`}
                onChange={(event) => handleDigitChange(index, event.target.value)}
                onKeyDown={(event) => handleDigitKeyDown(index, event)}
                onPaste={handlePaste}
                onFocus={(event) => event.currentTarget.select()}
              />
            ))}
          </div>
          <button type="submit" disabled={busy || code.length !== CODE_LENGTH || secondsLeft <= 0}>
            Təsdiqlə və daxil ol
          </button>
        </form>
      ) : null}
      {error ? (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      ) : null}
      <p className={styles.help}>
        Kod 2 dəqiqə ərzində daxil edilməlidir. Vaxt bitərsə, yenidən giriş tələb olunur. Cihazınızı
        itirmisinizsə, hesab sahibinin kimliyi yoxlanıldıqdan sonra administrator təsdiq üsulunu bərpa
        etməlidir.
      </p>
      <button className={styles.secondary} type="button" onClick={signOut} disabled={busy}>
        Hesabdan çıx
      </button>
    </div>
  );
}
