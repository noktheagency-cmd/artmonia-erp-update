"use client";

import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { RefreshCw } from "lucide-react";
import {
  APP_BUILD_ID, APP_VERSION_STALE_EVENT, hasNewAppVersion, isMissingServerAction,
} from "@/lib/app-version";

export function AppVersionNotice() {
  const [stale, setStale] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const allowReload = useRef(false);
  const edited = useRef(false);
  const staleRef = useRef(false);
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let disposed = false;
    let controller: AbortController | undefined;
    let lastCheck = 0;

    function markStale(actionFailed = false) {
      staleRef.current = true;
      setStale(true);
      if (actionFailed) setConfirmOpen(true);
    }

    async function checkVersion() {
      if (document.visibilityState !== "visible" || !navigator.onLine || controller || staleRef.current) return;
      if (Date.now() - lastCheck < 5_000) return;
      lastCheck = Date.now();
      controller = new AbortController();
      const timeout = window.setTimeout(() => controller?.abort(), 8_000);
      try {
        if (await hasNewAppVersion(APP_BUILD_ID, fetch, controller.signal) && !disposed) markStale();
      } finally {
        window.clearTimeout(timeout);
        controller = undefined;
      }
    }

    function actionFailed() { markStale(true); }
    function onRejection(event: PromiseRejectionEvent) {
      if (!isMissingServerAction(event.reason)) return;
      event.preventDefault();
      actionFailed();
    }
    function onError(event: ErrorEvent) {
      if (!isMissingServerAction(event.error ?? event.message)) return;
      event.preventDefault();
      actionFailed();
    }
    function onEdit(event: Event) {
      if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable='true']")) edited.current = true;
    }
    function beforeUnload(event: BeforeUnloadEvent) {
      if (!staleRef.current || !edited.current || allowReload.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener(APP_VERSION_STALE_EVENT, actionFailed);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("error", onError);
    window.addEventListener("focus", checkVersion);
    window.addEventListener("online", checkVersion);
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("visibilitychange", checkVersion);
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    const interval = window.setInterval(checkVersion, 30_000);
    void checkVersion();
    return () => {
      disposed = true;
      controller?.abort();
      window.clearInterval(interval);
      window.removeEventListener(APP_VERSION_STALE_EVENT, actionFailed);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("error", onError);
      window.removeEventListener("focus", checkVersion);
      window.removeEventListener("online", checkVersion);
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("visibilitychange", checkVersion);
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
    };
  }, []);

  if (!stale) return null;

  return (
    <>
      <section className="app-version-notice" role="status" aria-live="polite" aria-label="Versiya bildirişi">
        <RefreshCw size={20} aria-hidden="true" />
        <div>
          <strong>Sistemin yeni versiyası mövcuddur</strong>
          <p>Dəyişikliklər avtomatik göndərilməyəcək. Hazır olduqda səhifəni yeniləyin.</p>
        </div>
        <button type="button" onClick={() => setConfirmOpen(true)}>Yeniləməni aç</button>
      </section>
      <Dialog.Root open={confirmOpen} onOpenChange={setConfirmOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="app-version-overlay" />
          <Dialog.Content className="app-version-dialog" onOpenAutoFocus={(event) => {
            event.preventDefault();
            cancelButton.current?.focus();
          }}>
            <span className="app-version-symbol"><RefreshCw size={24} aria-hidden="true" /></span>
            <Dialog.Title>Səhifəni yeniləməyə hazırsınız?</Dialog.Title>
            <Dialog.Description>
              Yeni versiyaya keçid üçün səhifə yenidən açılacaq. Saxlanmamış forma məlumatları silinəcək — lazım olan məlumatları əvvəlcə köçürün.
            </Dialog.Description>
            <p className="app-version-warning">Ödəniş və digər əməliyyatlar avtomatik təkrarlanmayacaq. Ödənişi yenidən daxil etməzdən əvvəl onun tarixçədə olub-olmadığını yoxlayın.</p>
            <div className="app-version-actions">
              <button ref={cancelButton} type="button" onClick={() => setConfirmOpen(false)}>Hələlik qal</button>
              <button type="button" className="app-version-primary" onClick={() => {
                allowReload.current = true;
                window.location.reload();
              }}>Bəli, səhifəni yenilə</button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
