"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Download, MapPin, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import styles from "./planner.module.css";

type SiteQrPayload = {
  id: string;
  name: string;
  location: string | null;
  isActive: boolean;
  imageDataUrl: string;
  rotatedAt: string;
  requestId: string;
};

export function AttendanceSiteQrDialog({ onClose }: { onClose: () => void }) {
  const [payload, setPayload] = useState<SiteQrPayload>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadQr = useCallback(async (rotate = false, signal?: AbortSignal) => {
    setLoading(true);
    try {
      const response = await fetch("/api/attendance/site-qr", {
        method: rotate ? "POST" : "GET",
        signal,
      });
      const result = await response.json() as SiteQrPayload & { message?: string };
      if (!response.ok) throw new Error(result.message || "Ümumi QR alına bilmədi.");
      setPayload(result);
      setError("");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Ümumi QR alına bilmədi.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadQr(false, controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadQr]);

  function downloadQr() {
    if (!payload) return;
    const link = document.createElement("a");
    link.href = payload.imageDataUrl;
    link.download = "artmonia-umumi-davamiyyet-qr.png";
    link.click();
  }

  function rotateQr() {
    if (!window.confirm("Köhnə çap olunmuş QR dərhal etibarsız olacaq. Yeni QR yaradılsın?")) return;
    void loadQr(true);
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={styles.qrDialog}>
        <DialogHeader>
          <DialogTitle>Ümumi davamiyyət QR-ı</DialogTitle>
          <DialogDescription>
            Bir dəfə çap edin. ERP tələbənin dərsini scan vaxtına və aktiv planına görə özü tapır.
          </DialogDescription>
        </DialogHeader>

        <div className={styles.qrBody}>
          {payload ? (
            <>
              <div className={styles.qrFrame}>
                <Image
                  src={payload.imageDataUrl}
                  alt="Artmonia Academy ümumi davamiyyət QR kodu"
                  width={1400}
                  height={1400}
                  unoptimized
                  priority
                />
              </div>
              <div className={styles.qrStatus}>
                <span><ShieldCheck /> Daimi, revocable v2 token</span>
                <span><MapPin /> {payload.location ?? "Artmonia Academy"}</span>
              </div>
              <p>Scan zamanı tələbə JWT-si, bağlı cihaz və açıq dərs pəncərəsi serverdə yoxlanılır.</p>
            </>
          ) : loading ? <div className={styles.qrPlaceholder}>Ümumi QR hazırlanır…</div> : null}
          {error ? <div className={styles.qrError} role="alert">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={rotateQr} disabled={loading}>
            <RefreshCw data-icon="inline-start" /> Tokeni yenilə
          </Button>
          <Button type="button" variant="outline" onClick={downloadQr} disabled={!payload}>
            <Download data-icon="inline-start" /> Çap üçün PNG
          </Button>
          <Button type="button" onClick={onClose}>Bağla</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
