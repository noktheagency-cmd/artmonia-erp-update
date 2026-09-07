"use client";

import Link from "next/link";
import { CircleAlert, House, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { announceStaleVersion, isMissingServerAction } from "@/lib/app-version";
import { AppVersionNotice } from "@/components/app-version-notice";

export function RouteErrorState({
  error,
  reset,
  global = false,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  global?: boolean;
}) {
  const staleVersion = isMissingServerAction(error);
  useEffect(() => {
    if (!staleVersion) console.error("Artmonia ERP route error", error);
  }, [error, staleVersion]);

  return (
    <main className={`route-error-state${global ? " is-global" : ""}`}>
      <div className="route-error-orbit" aria-hidden="true">
        <span />
      </div>
      <section className="route-error-card" role="alert">
        <span className="route-error-icon" aria-hidden="true">
          <CircleAlert size={27} strokeWidth={1.9} />
        </span>
        <p className="route-error-label">Sistem bildirişi</p>
        <h1>{staleVersion ? "Sistemin yeni versiyası mövcuddur" : "Bu səhifəni aça bilmədik"}</h1>
        <p className="route-error-description">
          {staleVersion
            ? "Açıq səhifə serverin cari versiyasına uyğun deyil. Səhifəni yeniləyin. Ödəniş və digər əməliyyatlar avtomatik təkrarlanmayacaq."
            : "Müvəqqəti texniki problem yarandı. Məlumatlarınız qorunur — səhifəni yenidən yükləyin və ya idarə panelinə qayıdın."}
        </p>
        {error.digest ? <code>Xəta kodu: {error.digest}</code> : null}
        <div className="route-error-actions">
          <button type="button" onClick={staleVersion ? announceStaleVersion : reset}>
            <RefreshCw size={17} />
            {staleVersion ? "Yeniləməni aç" : "Yenidən cəhd et"}
          </button>
          <Link href="/dashboard">
            <House size={17} />
            İdarə paneli
          </Link>
        </div>
      </section>
      {global ? <AppVersionNotice /> : null}
    </main>
  );
}
