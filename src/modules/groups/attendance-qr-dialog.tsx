"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Clock3, MapPin, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PlannerSlot } from "@/modules/groups/planner-queries";
import styles from "./planner.module.css";

type QrPayload = {
  challengeId: string;
  imageDataUrl: string;
  expiresAt: string;
  refreshAfterSeconds: number;
  requestId: string;
  lesson: {
    startsAt: string;
    endsAt: string;
    teacherName: string;
    location: string;
  };
};

export function AttendanceQrDialog({
  slot,
  date,
  onClose,
}: {
  slot: PlannerSlot;
  date: string;
  onClose: () => void;
}) {
  const [payload, setPayload] = useState<QrPayload>();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  const loadQr = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch("/api/attendance/qr-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slotId: slot.id, date }),
        signal,
      });
      const result = await response.json() as QrPayload & { message?: string };
      if (!response.ok) throw new Error(result.message || "QR yaradıla bilmədi.");
      setPayload(result);
      setRemainingSeconds(Math.max(0, Math.ceil(
        (new Date(result.expiresAt).getTime() - Date.now()) / 1_000,
      )));
      setError("");
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setPayload(undefined);
      setError(caught instanceof Error ? caught.message : "QR yaradıla bilmədi.");
    } finally {
      setLoading(false);
    }
  }, [date, slot.id]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void loadQr(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadQr]);

  useEffect(() => {
    if (!payload) return;
    const refreshTimer = window.setTimeout(() => void loadQr(), payload.refreshAfterSeconds * 1_000);
    return () => window.clearTimeout(refreshTimer);
  }, [loadQr, payload]);

  useEffect(() => {
    if (!payload) return;
    const update = () => setRemainingSeconds(Math.max(0, Math.ceil(
      (new Date(payload.expiresAt).getTime() - Date.now()) / 1_000,
    )));
    const timer = window.setInterval(update, 1_000);
    return () => window.clearInterval(timer);
  }, [payload]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className={styles.qrDialog}>
        <DialogHeader>
          <DialogTitle>Davamiyyət QR kodu</DialogTitle>
          <DialogDescription>
            {slot.startTime}–{slot.endTime} · {slot.teacherName} · {slot.room}
          </DialogDescription>
        </DialogHeader>

        <div className={styles.qrBody}>
          {payload ? (
            <>
              <div className={styles.qrFrame}>
                <Image
                  src={payload.imageDataUrl}
                  alt="Tələbə davamiyyəti üçün dinamik QR kod"
                  width={720}
                  height={720}
                  unoptimized
                  priority
                />
              </div>
              <div className={styles.qrStatus}>
                <span><ShieldCheck /> Dinamik və birdəfəlik token</span>
                <span><Clock3 /> {remainingSeconds} saniyə</span>
                <span><MapPin /> {payload.lesson.location}</span>
              </div>
              <p>QR avtomatik yenilənir. Tələbə uğurlu skan etdikdə ERP jurnalında dərhal “Gəldi” görünəcək.</p>
            </>
          ) : loading ? (
            <div className={styles.qrPlaceholder}>QR hazırlanır…</div>
          ) : null}
          {error ? <div className={styles.qrError} role="alert">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => void loadQr()} disabled={loading}>
            <RefreshCw data-icon="inline-start" /> Yenilə
          </Button>
          <Button type="button" onClick={onClose}>Bağla</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
