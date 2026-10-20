"use client";

import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatBakuDate, formatBakuDateTime } from "@/modules/notifications/notification-date";
import { useState, useTransition } from "react";
import {
  Bell,
  BellRing,
  CheckCheck,
  ChevronRight,
  CircleCheck,
  Clock3,
  FileText,
  ListTodo,
  UserRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError } from "@/lib/app-notifications";
import type {
  NotificationCenterData,
  PersonalNotificationRow,
} from "@/modules/notifications/queries";
import { taskStatusLabels } from "@/modules/notifications/notification-types";
import "./notifications.css";

type FormAction = (formData: FormData) => unknown | Promise<unknown>;
type EmptyAction = () => unknown | Promise<unknown>;

export function NotificationCenter({
  data,
  markReadAction,
  markAllReadAction,
}: {
  data: NotificationCenterData;
  markReadAction: FormAction;
  markAllReadAction: EmptyAction;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [notice, setNotice] = useState("");

  function markAllRead() {
    setNotice("");
    startTransition(async () => {
      try {
        unwrapActionResult(await markAllReadAction());
        window.dispatchEvent(new Event("app-notifications:changed"));
        router.refresh();
      } catch (error) {
        setNotice(notifyCaughtError(error, "Bildirişlər yenilənmədi"));
      }
    });
  }

  function openNotification(notification: PersonalNotificationRow) {
    startTransition(async () => {
      try {
        if (!notification.readAt) {
          const formData = new FormData();
          formData.set("notificationId", notification.id);
          formData.set("source", notification.source);
          unwrapActionResult(await markReadAction(formData));
          window.dispatchEvent(new Event("app-notifications:changed"));
        }
        if (notification.href) router.push(notification.href as Route);
        else router.refresh();
      } catch (error) {
        setNotice(notifyCaughtError(error, "Bildiriş yenilənmədi"));
      }
    });
  }

  return (
    <section className="page-stack notification-center-page">
      <header className="notification-center-header">
        <div className="notification-center-heading">
          <span aria-hidden="true"><BellRing /></span>
          <div>
            <p>Şəxsi mərkəz</p>
            <h1>Bildirişlər</h1>
          </div>
        </div>
        <div className="notification-center-actions">
          {data.employeeId ? (
            <Link className="ui-button ui-button-outline" href={`/hr/${data.employeeId}` as Route}>
              <UserRound data-icon="inline-start" /> Profil məlumatları
            </Link>
          ) : null}
          <Button type="button" variant="outline" onClick={markAllRead} disabled={isPending || data.unreadCount === 0}>
            <CheckCheck data-icon="inline-start" /> Hamısını oxunmuş et
          </Button>
        </div>
      </header>

      <div className="notification-center-summary" aria-label="Bildiriş xülasəsi">
        <div><Bell /><span><strong>{data.unreadCount}</strong><small>Oxunmamış</small></span></div>
        <div><CircleCheck /><span><strong>{Math.max(0, data.notifications.length - data.unreadCount)}</strong><small>Oxunmuş</small></span></div>
        <div><ListTodo /><span><strong>{data.notifications.filter((item) => item.type.startsWith("TASK_")).length}</strong><small>Task bildirişi</small></span></div>
      </div>

      {notice ? <p className="notification-center-notice" role="alert">{notice}</p> : null}

      <section className="notification-list-panel" aria-labelledby="personal-notifications-title">
        <div className="notification-list-title">
          <div>
            <h2 id="personal-notifications-title">Son bildirişlər</h2>
            <p>Oxunmamış bildirişlər siyahının əvvəlində göstərilir.</p>
          </div>
          <span>{data.notifications.length} bildiriş</span>
        </div>

        {data.notifications.length ? (
          <div className="notification-list">
            {data.notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                disabled={isPending}
                onOpen={() => openNotification(notification)}
              />
            ))}
          </div>
        ) : (
          <div className="notification-empty">
            <span><Bell /></span>
            <h3>Bildiriş yoxdur</h3>
            <p>Yeni şəxsi bildirişlər burada görünəcək.</p>
          </div>
        )}
      </section>
    </section>
  );
}

function NotificationItem({
  notification,
  disabled,
  onOpen,
}: {
  notification: PersonalNotificationRow;
  disabled: boolean;
  onOpen: () => void;
}) {
  const Icon = notification.type === "DOCUMENT" ? FileText : notification.type.startsWith("TASK_") ? ListTodo : Bell;
  const status = notification.status && notification.status in taskStatusLabels
    ? taskStatusLabels[notification.status as keyof typeof taskStatusLabels]
    : notification.status;

  return (
    <article className={cx("notification-item", !notification.readAt && "is-unread", notification.isOverdue && "is-overdue")}>
      <span className="notification-item-icon" aria-hidden="true"><Icon /></span>
      <div className="notification-item-content">
        <div className="notification-item-meta">
          <span>{notification.typeLabel}</span>
          <time dateTime={notification.createdAt}>{formatBakuDateTime(notification.createdAt)}</time>
          {!notification.readAt ? <i>Yeni</i> : null}
        </div>
        <h3>{notification.title}</h3>
        <p>{notification.message}</p>
        {notification.deadline || status ? (
          <div className="notification-task-details">
            {notification.deadline ? <span><Clock3 /> Deadline: {formatBakuDate(notification.deadline)}</span> : null}
            {status ? <span>Status: <strong>{status}</strong></span> : null}
          </div>
        ) : null}
      </div>
      <button type="button" className="notification-open-button" onClick={onOpen} disabled={disabled}>
        <span>{notification.href ? "Əlaqəli məlumata keç" : notification.readAt ? "Oxunub" : "Oxunmuş et"}</span>
        <ChevronRight />
      </button>
    </article>
  );
}
