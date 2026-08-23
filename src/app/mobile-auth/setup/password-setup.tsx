"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/server/supabase/browser";
import styles from "./setup.module.css";

type SetupState = "loading" | "ready" | "saving" | "success" | "error";

export function MobilePasswordSetup() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [state, setState] = useState<SetupState>("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.session) {
        setMessage("Dəvət linki etibarsızdır və ya vaxtı bitib. ERP-dən yeni link istəyin.");
        setState("error");
        return;
      }
      setState("ready");
    });
    return () => { active = false; };
  }, [supabase]);

  async function submit(formData: FormData) {
    const password = String(formData.get("password") ?? "");
    const confirmation = String(formData.get("confirmation") ?? "");
    if (password.length < 8) {
      setMessage("Parol ən azı 8 simvol olmalıdır.");
      setState("error");
      return;
    }
    if (password !== confirmation) {
      setMessage("Parollar eyni deyil.");
      setState("error");
      return;
    }

    setState("saving");
    setMessage("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setMessage(error.message || "Parol yadda saxlanılmadı.");
      setState("error");
      return;
    }
    await supabase.auth.signOut({ scope: "local" });
    setState("success");
  }

  if (state === "loading") return <div className={styles.feedback}>Dəvət yoxlanılır…</div>;
  if (state === "success") {
    return (
      <div className={styles.success} role="status">
        Parolunuz yaradıldı. Artıq Artmonia mobil tətbiqində e-poçt və bu parolla daxil ola bilərsiniz.
      </div>
    );
  }

  return (
    <form action={submit} className={styles.form}>
      <label>
        <span>Yeni parol</span>
        <input name="password" type="password" autoComplete="new-password" minLength={8} required disabled={state === "saving"} />
      </label>
      <label>
        <span>Parolu təkrar edin</span>
        <input name="confirmation" type="password" autoComplete="new-password" minLength={8} required disabled={state === "saving"} />
      </label>
      {message ? <div className={styles.error} role="alert">{message}</div> : null}
      <button type="submit" disabled={state === "saving"}>
        {state === "saving" ? "Yadda saxlanılır…" : "Parolu yarat"}
      </button>
    </form>
  );
}
