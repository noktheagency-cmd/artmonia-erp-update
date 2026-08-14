"use client";

import { useRef, useState, useTransition } from "react";
import {
  BadgeInfo,
  Check,
  Eye,
  LoaderCircle,
  Pencil,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { updateAboutProfileAction } from "@/modules/about/actions";
import type { AboutProfileSnapshot } from "@/modules/about/about-profile";

export function AboutDialog({
  initialProfile,
  canEdit,
}: {
  initialProfile: AboutProfileSnapshot;
  canEdit: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [savedProfile, setSavedProfile] = useState<AboutProfileSnapshot | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const profile = savedProfile ?? initialProfile;

  function handleOpenChange(open: boolean) {
    setIsOpen(open);
    if (!open) {
      setIsEditing(false);
      setFeedback(null);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setFeedback(null);

    startTransition(async () => {
      const result = await updateAboutProfileAction(formData);

      if (!result.ok) {
        setFeedback({ tone: "error", text: result.message });
        return;
      }

      setSavedProfile(result.data);
      setIsEditing(false);
      setFeedback({ tone: "success", text: "Məlumat uğurla yeniləndi." });
    });
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <button className="about-rail-badge" type="button" aria-label="Biz kimik məlumatını aç">
          <BadgeInfo size={15} strokeWidth={2} aria-hidden="true" />
          <span>Biz kimik</span>
          <span className="about-rail-badge-dot" aria-hidden="true" />
        </button>
      </DialogTrigger>

      <DialogContent className="about-dialog">
        <div className="about-dialog-ambient" aria-hidden="true" />
        <div className="about-dialog-topline" aria-hidden="true" />

        <header className="about-dialog-hero">
          <div className="about-dialog-emblem" aria-hidden="true">
            <Sparkles size={25} strokeWidth={1.8} />
          </div>
          <div className="about-dialog-heading">
            <DialogTitle>{profile.title}</DialogTitle>
            <DialogDescription>{profile.tagline}</DialogDescription>
          </div>
          {canEdit && !isEditing ? (
            <button
              className="about-dialog-edit-button"
              type="button"
              onClick={() => {
                setFeedback(null);
                setIsEditing(true);
              }}
            >
              <Pencil size={15} aria-hidden="true" />
              <span>Redaktə et</span>
            </button>
          ) : null}
        </header>

        {isEditing ? (
          <form ref={formRef} className="about-editor" onSubmit={handleSubmit}>
            <div className="about-editor-grid">
              <label className="about-editor-field">
                <span>Başlıq</span>
                <input name="title" defaultValue={profile.title} minLength={3} maxLength={80} required />
              </label>
              <label className="about-editor-field about-editor-field-wide">
                <span>Qısa təqdimat</span>
                <textarea
                  name="tagline"
                  defaultValue={profile.tagline}
                  minLength={10}
                  maxLength={180}
                  rows={2}
                  required
                />
              </label>
              <label className="about-editor-field about-editor-field-wide">
                <span>Haqqımızda</span>
                <textarea
                  name="story"
                  defaultValue={profile.story}
                  minLength={40}
                  maxLength={2_000}
                  rows={5}
                  required
                />
              </label>
              <label className="about-editor-field">
                <span>Missiyamız</span>
                <textarea
                  name="mission"
                  defaultValue={profile.mission}
                  minLength={10}
                  maxLength={600}
                  rows={4}
                  required
                />
              </label>
              <label className="about-editor-field">
                <span>Vizyonumuz</span>
                <textarea
                  name="vision"
                  defaultValue={profile.vision}
                  minLength={10}
                  maxLength={600}
                  rows={4}
                  required
                />
              </label>
              <label className="about-editor-field about-editor-field-wide">
                <span>Dəyərlər — hər sətrə bir dəyər</span>
                <textarea
                  name="values"
                  defaultValue={profile.values.join("\n")}
                  maxLength={600}
                  rows={3}
                  required
                />
              </label>
            </div>

            {feedback ? (
              <p className={`about-dialog-feedback is-${feedback.tone}`} role="status">
                {feedback.text}
              </p>
            ) : null}

            <div className="about-editor-actions">
              <button
                className="about-editor-cancel"
                type="button"
                disabled={isPending}
                onClick={() => {
                  formRef.current?.reset();
                  setIsEditing(false);
                  setFeedback(null);
                }}
              >
                Ləğv et
              </button>
              <button className="about-editor-save" type="submit" disabled={isPending}>
                {isPending ? (
                  <LoaderCircle className="about-editor-spinner" size={16} aria-hidden="true" />
                ) : (
                  <Save size={16} aria-hidden="true" />
                )}
                {isPending ? "Saxlanılır..." : "Yadda saxla"}
              </button>
            </div>
          </form>
        ) : (
          <div className="about-dialog-body">
            <section className="about-story" aria-label="Artmonia haqqında">
              <span className="about-story-rule" aria-hidden="true" />
              <p>{profile.story}</p>
            </section>

            <div className="about-perspectives">
              <article className="about-perspective">
                <div className="about-perspective-icon" aria-hidden="true">
                  <Target size={18} strokeWidth={1.9} />
                </div>
                <div>
                  <h3>Missiyamız</h3>
                  <p>{profile.mission}</p>
                </div>
              </article>
              <article className="about-perspective">
                <div className="about-perspective-icon is-vision" aria-hidden="true">
                  <Eye size={18} strokeWidth={1.9} />
                </div>
                <div>
                  <h3>Vizyonumuz</h3>
                  <p>{profile.vision}</p>
                </div>
              </article>
            </div>

            <section className="about-values" aria-labelledby="about-values-title">
              <div>
                <span className="about-values-kicker">Bizi birləşdirən</span>
                <h3 id="about-values-title">Dəyərlərimiz</h3>
              </div>
              <ul>
                {profile.values.map((value) => (
                  <li key={value}>
                    <Check size={13} strokeWidth={2.4} aria-hidden="true" />
                    {value}
                  </li>
                ))}
              </ul>
            </section>

            <footer className="about-dialog-footer">
              <span className="about-dialog-signature">Artmonia — yaradıcılığın ünvanı</span>
              <span className="about-dialog-meta">
                {canEdit ? <ShieldCheck size={14} aria-hidden="true" /> : null}
                {profile.updatedAt ? `Son yenilənmə: ${formatDate(profile.updatedAt)}` : "Artmonia ERP"}
              </span>
            </footer>

            {feedback ? (
              <p className={`about-dialog-feedback is-${feedback.tone}`} role="status">
                {feedback.text}
              </p>
            ) : null}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}
