"use client";

import Link from "next/link";
import { CircleAlert, House, RefreshCw } from "lucide-react";
import { useEffect } from "react";

export function RouteErrorState({
  error,
  reset,
  global = false,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  global?: boolean;
}) {
  useEffect(() => {
    console.error("Artmonia ERP route error", error);
  }, [error]);

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
        <h1>Bu səhifəni aça bilmədik</h1>
        <p className="route-error-description">
          Müvəqqəti texniki problem yarandı. Məlumatlarınız qorunur — səhifəni yenidən
          yükləyin və ya idarə panelinə qayıdın.
        </p>
        {error.digest ? <code>Xəta kodu: {error.digest}</code> : null}
        <div className="route-error-actions">
          <button type="button" onClick={reset}>
            <RefreshCw size={17} />
            Yenidən cəhd et
          </button>
          <Link href="/dashboard">
            <House size={17} />
            İdarə paneli
          </Link>
        </div>
      </section>
    </main>
  );
}
