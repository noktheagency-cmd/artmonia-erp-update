"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  Info,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  APP_NOTIFICATION_EVENT,
  type AppNotificationInput,
  type AppNotificationTone,
} from "@/lib/app-notifications";

type AppNotification = Required<Pick<AppNotificationInput, "title" | "tone">> &
  Omit<AppNotificationInput, "title" | "tone"> & {
    id: number;
  };

const icons: Record<AppNotificationTone, typeof CircleAlert> = {
  success: CheckCircle2,
  error: CircleAlert,
  warning: TriangleAlert,
  info: Info,
};

let notificationId = 0;

export function AppNotifications() {
  const [items, setItems] = useState<AppNotification[]>([]);

  useEffect(() => {
    function addNotification(event: Event) {
      const detail = (event as CustomEvent<AppNotificationInput>).detail;
      if (!detail?.title) return;

      const item: AppNotification = {
        ...detail,
        id: ++notificationId,
        tone: detail.tone ?? "info",
      };

      setItems((current) => [...current.slice(-2), item]);
    }

    function handleWindowError(event: ErrorEvent) {
      if (!event.error && !event.message) return;
      addNotification(
        new CustomEvent(APP_NOTIFICATION_EVENT, {
          detail: {
            title: "Gözlənilməz xəta",
            message: "Səhifədə gözlənilməz problem yarandı. Məlumatlarınız qorunur.",
            tone: "error",
            duration: 7000,
          },
        })
      );
    }

    function handleUnhandledRejection() {
      addNotification(
        new CustomEvent(APP_NOTIFICATION_EVENT, {
          detail: {
            title: "Əməliyyat yarımçıq qaldı",
            message: "Sorğu tamamlanmadı. Yenidən cəhd edə bilərsiniz.",
            tone: "error",
            duration: 7000,
          },
        })
      );
    }

    window.addEventListener(APP_NOTIFICATION_EVENT, addNotification);
    window.addEventListener("error", handleWindowError);
    window.addEventListener("unhandledrejection", handleUnhandledRejection);

    return () => {
      window.removeEventListener(APP_NOTIFICATION_EVENT, addNotification);
      window.removeEventListener("error", handleWindowError);
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
    };
  }, []);

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  return (
    <div className="app-toast-viewport" aria-label="Sistem bildirişləri">
      {items.map((item) => (
        <AppToast key={item.id} item={item} onDismiss={dismiss} />
      ))}
    </div>
  );
}

function AppToast({
  item,
  onDismiss,
}: {
  item: AppNotification;
  onDismiss: (id: number) => void;
}) {
  const Icon = icons[item.tone];
  const duration = item.duration ?? 4800;

  useEffect(() => {
    if (duration <= 0) return;
    const timeout = window.setTimeout(() => onDismiss(item.id), duration);
    return () => window.clearTimeout(timeout);
  }, [duration, item.id, onDismiss]);

  return (
    <section
      className={`app-toast is-${item.tone}`}
      role={item.tone === "error" ? "alert" : "status"}
      aria-live={item.tone === "error" ? "assertive" : "polite"}
      style={{ "--toast-duration": `${duration}ms` } as React.CSSProperties}
    >
      <span className="app-toast-icon" aria-hidden="true">
        <Icon size={19} strokeWidth={2.15} />
      </span>
      <span className="app-toast-copy">
        <strong>{item.title}</strong>
        {item.message ? <p>{item.message}</p> : null}
      </span>
      <button type="button" onClick={() => onDismiss(item.id)} aria-label="Bildirişi bağla">
        <X size={16} />
      </button>
      {duration > 0 ? <span className="app-toast-progress" aria-hidden="true" /> : null}
    </section>
  );
}
