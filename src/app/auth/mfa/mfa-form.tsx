"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/server/supabase/browser";
import styles from "./mfa.module.css";

export function MfaForm() {
  const [factorId, setFactorId] = useState<string>();
  const [qr, setQr] = useState<string>();
  const [secret, setSecret] = useState<string>();
  const [code, setCode] = useState("");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);

  useEffect(() => {
    let active = true;
    void createSupabaseBrowserClient().auth.mfa.listFactors().then(({data, error}) => {
      if (!active) return;
      if (error) { setError("Təsdiq üsulları yüklənmədi. Səhifəni yeniləyin."); return; }
      const factor = data.totp.find((item) => item.status === "verified");
      setFactorId(factor?.id);
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  async function enroll() {
    setBusy(true); setError("");
    try {
      const supabase = createSupabaseBrowserClient();
      const {data: factors, error: listError} = await supabase.auth.mfa.listFactors();
      if (listError) throw listError;
      // Only incomplete setups may be replaced; verified factors are never removed here.
      for (const factor of factors.all.filter((item) => item.factor_type === "totp" && item.status === "unverified")) {
        const {error} = await supabase.auth.mfa.unenroll({factorId: factor.id});
        if (error) throw error;
      }
      const existing = factors.totp.find((item) => item.status === "verified");
      if (existing) { setFactorId(existing.id); return; }
      const {data, error} = await supabase.auth.mfa.enroll({factorType:"totp", issuer:"Artmonia ERP", friendlyName:"Artmonia autentifikator"});
      if (error) throw error;
      setFactorId(data.id); setQr(data.totp.qr_code); setSecret(data.totp.secret);
    } catch { setError("Autentifikator qurulmadı. Yenidən cəhd edin."); }
    finally { setBusy(false); }
  }

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!factorId || !/^\d{6}$/.test(code)) return;
    setBusy(true); setError("");
    try {
      const {error} = await createSupabaseBrowserClient().auth.mfa.challengeAndVerify({factorId,code});
      if (error) throw error;
      setQr(undefined); setSecret(undefined); setCode(""); setVerified(true);
      // A full navigation clears password-only RSC state after the assurance upgrade.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign("/dashboard");
    } catch { setError("Kod yanlışdır və ya vaxtı bitib. Cari 6 rəqəmli kodu daxil edin."); }
    finally { setBusy(false); }
  }

  async function signOut() {
    setBusy(true);
    const {error} = await createSupabaseBrowserClient().auth.signOut({scope:"local"});
    if (error) { setError("Çıxış alınmadı. Yenidən cəhd edin."); setBusy(false); return; }
    // Drop authenticated client caches after sign-out.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.assign("/login");
  }

  return <div className={styles.form}>
    {!ready && !error ? <p>Yüklənir…</p> : null}
    {ready && !factorId ? <><p>Google Authenticator, Microsoft Authenticator və ya başqa TOTP tətbiqi ilə qurun.</p><button disabled={busy} onClick={enroll}>Autentifikatoru qur</button></> : null}
    {qr ? <><p>QR kodunu autentifikatorla skan edin. Məxfi açarı təhlükəsiz yerdə saxlayın.</p>{/* Supabase-generated QR is an image, never injected as HTML. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className={styles.qr} src={qr.startsWith("data:") ? qr : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qr)}`} alt="Autentifikator üçün QR kod" width={220} height={220} />
      <details><summary>Əl ilə daxil etmə açarı</summary><code>{secret}</code></details></> : null}
    {factorId && !verified ? <form onSubmit={verify}><label htmlFor="mfa-code">Təsdiq kodu</label><input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} minLength={6} required value={code} onChange={(event)=>setCode(event.target.value.replace(/\D/g,""))} /><button disabled={busy || code.length!==6}>Təsdiqlə və daxil ol</button></form> : null}
    {error ? <p role="alert" className={styles.error}>{error}</p> : null}
    <p className={styles.help}>Cihazınızı itirmisinizsə, hesab sahibinin kimliyi yoxlanıldıqdan sonra administrator təsdiq üsulunu bərpa etməlidir.</p>
    <button className={styles.secondary} onClick={signOut} disabled={busy}>Hesabdan çıx</button>
  </div>;
}
