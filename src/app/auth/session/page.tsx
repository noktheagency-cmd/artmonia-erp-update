"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/server/supabase/browser";
import styles from "./session.module.css";

export default function AuthSessionPage() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const supabase = createSupabaseBrowserClient();
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (accessToken || refreshToken) window.history.replaceState(null, "", window.location.pathname + window.location.search);

    const sessionPromise = accessToken && refreshToken
      ? supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
      : supabase.auth.getSession();

    void sessionPromise.then(({ data, error }) => {
      if (!active) return;
      if (error || !data.session) {
        setFailed(true);
        return;
      }
      router.replace("/playbook");
    });

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <main className={styles.page}>
      <span className={styles.icon}><LoaderCircle aria-hidden="true" /></span>
      <h1>{failed ? "Sessiya yaradıla bilmədi" : "Təhlükəsiz giriş tamamlanır"}</h1>
      <p>{failed ? "Giriş linki etibarsızdır və ya vaxtı bitib." : "Bir neçə saniyə gözləyin."}</p>
      {failed ? <button type="button" onClick={() => router.replace("/login")}>Giriş səhifəsinə qayıt</button> : null}
    </main>
  );
}
