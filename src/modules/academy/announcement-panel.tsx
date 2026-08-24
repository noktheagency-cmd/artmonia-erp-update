"use client";

import { useState, useTransition, type FormEvent } from "react";
import { BellRing, Edit3, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError } from "@/lib/app-notifications";
import type { AcademyAnnouncementsData } from "@/modules/academy/announcement-queries";
import styles from "./announcement-panel.module.css";

type Announcement = AcademyAnnouncementsData["announcements"][number];

export function AcademyAnnouncementPanel({
  data,
  saveAction,
  toggleAction,
}: {
  data: AcademyAnnouncementsData;
  saveAction: (formData: FormData) => Promise<unknown>;
  toggleAction: (formData: FormData) => Promise<unknown>;
}) {
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [pending, startTransition] = useTransition();
  if (!data.canManage) return null;

  function run(action: () => Promise<unknown>, done: () => void) {
    startTransition(async () => {
      try {
        unwrapActionResult(await action());
        done();
      } catch (error) {
        notifyCaughtError(error);
      }
    });
  }

  return (
    <section className={styles.panel}>
      <header>
        <div><BellRing /><span><strong>Mobil akademiya elanları</strong><small>Home ekranında tələbəyə göstərilən dinamik məlumat</small></span></div>
        <Button type="button" onClick={() => setEditing("new")}><Plus /> Yeni elan</Button>
      </header>
      {editing ? (
        <AnnouncementForm
          key={editing === "new" ? "new" : editing.id}
          announcement={editing === "new" ? null : editing}
          programs={data.programs}
          currentDateTime={data.currentDateTime}
          pending={pending}
          onCancel={() => setEditing(null)}
          onSubmit={(formData) => run(() => saveAction(formData), () => setEditing(null))}
        />
      ) : null}
      <div className={styles.list}>
        {data.announcements.map((announcement) => (
          <article key={announcement.id} data-inactive={!announcement.isActive || undefined}>
            <div className={styles.copy}>
              <div><strong>{announcement.title}</strong><span>{announcement.isActive ? "Aktiv" : "Deaktiv"}</span></div>
              <p>{announcement.body}</p>
              <small>{announcement.programName} · {announcement.publishedAt.replace("T", " ")}{announcement.expiresAt ? ` — ${announcement.expiresAt.replace("T", " ")}` : ""}</small>
            </div>
            <div className={styles.actions}>
              <button type="button" onClick={() => setEditing(announcement)}><Edit3 /> Redaktə et</button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const formData = new FormData();
                  formData.set("id", announcement.id);
                  formData.set("isActive", String(!announcement.isActive));
                  run(() => toggleAction(formData), () => undefined);
                }}
              >{announcement.isActive ? "Deaktiv et" : "Aktiv et"}</button>
            </div>
          </article>
        ))}
        {!data.announcements.length ? <p className={styles.empty}>Hələ mobil elan yaradılmayıb.</p> : null}
      </div>
    </section>
  );
}

function AnnouncementForm({ announcement, programs, currentDateTime, pending, onCancel, onSubmit }: {
  announcement: Announcement | null;
  programs: AcademyAnnouncementsData["programs"];
  currentDateTime: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (formData: FormData) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(new FormData(event.currentTarget));
  }
  return (
    <form className={styles.form} onSubmit={submit}>
      {announcement ? <input type="hidden" name="id" value={announcement.id} /> : null}
      <label><span>Başlıq</span><input name="title" defaultValue={announcement?.title ?? ""} maxLength={160} required /></label>
      <label><span>Proqram</span><select name="programId" defaultValue={announcement?.programId ?? ""}><option value="">Bütün proqramlar</option>{programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}</select></label>
      <label className={styles.wide}><span>Mətn</span><textarea name="body" defaultValue={announcement?.body ?? ""} maxLength={2000} rows={3} required /></label>
      <label><span>Paylaşım vaxtı</span><input name="publishedAt" type="datetime-local" defaultValue={announcement?.publishedAt ?? currentDateTime} required /></label>
      <label><span>Bitmə vaxtı</span><input name="expiresAt" type="datetime-local" defaultValue={announcement?.expiresAt ?? ""} /></label>
      <label className={styles.check}><input name="isActive" type="checkbox" defaultChecked={announcement?.isActive ?? true} /><span>Aktivdir</span></label>
      <div className={styles.formActions}><Button type="button" variant="outline" onClick={onCancel}>Ləğv et</Button><Button type="submit" disabled={pending}>{pending ? "Saxlanılır..." : "Yadda saxla"}</Button></div>
    </form>
  );
}
