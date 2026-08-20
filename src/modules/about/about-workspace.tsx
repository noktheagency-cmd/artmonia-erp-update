"use client";

import { useRef, useState, useTransition } from "react";
import {
  ArrowDown,
  Check,
  Compass,
  Eye,
  HeartHandshake,
  LoaderCircle,
  Pencil,
  Quote,
  Save,
  ShieldCheck,
  Sparkles,
  Target,
  X,
} from "lucide-react";
import { updateAboutProfileAction } from "@/modules/about/actions";
import type { AboutProfileSnapshot } from "@/modules/about/about-profile";

const sectionLinks = [
  { href: "#hekayemiz", label: "Hekayəmiz" },
  { href: "#istiqametimiz", label: "İstiqamətimiz" },
  { href: "#deyerlerimiz", label: "Dəyərlərimiz" },
] as const;

export function AboutWorkspace({
  initialProfile,
  canEdit,
}: {
  initialProfile: AboutProfileSnapshot;
  canEdit: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [savedProfile, setSavedProfile] = useState<AboutProfileSnapshot | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const editorRef = useRef<HTMLElement>(null);
  const profile = savedProfile ?? initialProfile;

  function openEditor() {
    setFeedback(null);
    setIsEditing(true);
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function closeEditor() {
    formRef.current?.reset();
    setIsEditing(false);
    setFeedback(null);
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
    <div className="about-page">
      <section className="about-page-hero" aria-labelledby="about-page-title">
        <div className="about-page-hero-glow" aria-hidden="true" />
        <div className="about-page-hero-copy">
          <span className="about-page-eyebrow">
            <Sparkles size={14} strokeWidth={2} aria-hidden="true" />
            Artmonia haqqında
          </span>
          <h1 id="about-page-title">{profile.title}</h1>
          <p>{profile.tagline}</p>

          <div className="about-page-hero-actions">
            <a className="about-page-primary-link" href="#hekayemiz">
              Hekayəmizi kəşf et
              <ArrowDown size={15} aria-hidden="true" />
            </a>
            {canEdit ? (
              <button className="about-page-edit-button" type="button" onClick={openEditor}>
                <Pencil size={15} aria-hidden="true" />
                Məzmunu redaktə et
              </button>
            ) : null}
          </div>
        </div>

        <div className="about-page-emblem" aria-hidden="true">
          <span className="about-page-emblem-orbit" />
          <span className="about-page-emblem-mark">A</span>
          <span className="about-page-emblem-caption">Art · Community · Growth</span>
        </div>
      </section>

      <nav className="about-page-section-nav" aria-label="Səhifə bölmələri">
        <span>Mündəricat</span>
        <div>
          {sectionLinks.map((link, index) => (
            <a href={link.href} key={link.href}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              {link.label}
            </a>
          ))}
        </div>
      </nav>

      {feedback && !isEditing ? (
        <p className={`about-page-feedback is-${feedback.tone}`} role="status">
          {feedback.text}
        </p>
      ) : null}

      {isEditing ? (
        <section ref={editorRef} className="about-page-editor" aria-labelledby="about-editor-title">
          <div className="about-page-editor-heading">
            <div>
              <span className="about-page-section-kicker">Super Admin</span>
              <h2 id="about-editor-title">“Biz kimik” məzmununu redaktə et</h2>
              <p>Dəyişikliklər bu səhifədə bütün əməkdaşlar üçün görünəcək.</p>
            </div>
            <button type="button" onClick={closeEditor} aria-label="Redaktəni bağla">
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <form ref={formRef} className="about-page-editor-form" onSubmit={handleSubmit}>
            <div className="about-page-editor-grid">
              <label className="about-page-field">
                <span>Başlıq</span>
                <input name="title" defaultValue={profile.title} minLength={3} maxLength={80} required />
              </label>
              <label className="about-page-field is-wide">
                <span>Qısa təqdimat</span>
                <textarea name="tagline" defaultValue={profile.tagline} minLength={10} maxLength={180} rows={2} required />
              </label>
              <label className="about-page-field is-wide">
                <span>Hekayəmiz</span>
                <textarea name="story" defaultValue={profile.story} minLength={40} maxLength={2_000} rows={6} required />
              </label>
              <label className="about-page-field">
                <span>Missiyamız</span>
                <textarea name="mission" defaultValue={profile.mission} minLength={10} maxLength={600} rows={5} required />
              </label>
              <label className="about-page-field">
                <span>Vizyonumuz</span>
                <textarea name="vision" defaultValue={profile.vision} minLength={10} maxLength={600} rows={5} required />
              </label>
              <label className="about-page-field is-wide">
                <span>Dəyərlər — hər sətrə bir dəyər</span>
                <textarea name="values" defaultValue={profile.values.join("\n")} maxLength={600} rows={4} required />
              </label>
            </div>

            {feedback ? (
              <p className={`about-page-feedback is-${feedback.tone}`} role="status">
                {feedback.text}
              </p>
            ) : null}

            <div className="about-page-editor-actions">
              <button className="about-page-cancel" type="button" disabled={isPending} onClick={closeEditor}>
                Ləğv et
              </button>
              <button className="about-page-save" type="submit" disabled={isPending}>
                {isPending ? (
                  <LoaderCircle className="about-page-spinner" size={17} aria-hidden="true" />
                ) : (
                  <Save size={17} aria-hidden="true" />
                )}
                {isPending ? "Saxlanılır..." : "Dəyişiklikləri saxla"}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="about-page-content">
        <section id="hekayemiz" className="about-page-story" aria-labelledby="about-story-title">
          <div className="about-page-story-heading">
            <span className="about-page-section-kicker">01 · Başlanğıc nöqtəmiz</span>
            <h2 id="about-story-title">Hekayəmiz</h2>
          </div>
          <div className="about-page-story-copy">
            <Quote size={34} strokeWidth={1.4} aria-hidden="true" />
            <p>{profile.story}</p>
          </div>
        </section>

        <section id="istiqametimiz" className="about-page-direction" aria-labelledby="about-direction-title">
          <header>
            <div>
              <span className="about-page-section-kicker">02 · Gələcəyə baxış</span>
              <h2 id="about-direction-title">İstiqamətimiz</h2>
            </div>
            <Compass size={27} strokeWidth={1.55} aria-hidden="true" />
          </header>

          <div className="about-page-perspectives">
            <article>
              <div className="about-page-perspective-icon">
                <Target size={21} strokeWidth={1.8} aria-hidden="true" />
              </div>
              <span>Bu gün nə edirik?</span>
              <h3>Missiyamız</h3>
              <p>{profile.mission}</p>
            </article>
            <article>
              <div className="about-page-perspective-icon is-vision">
                <Eye size={21} strokeWidth={1.8} aria-hidden="true" />
              </div>
              <span>Sabahı necə görürük?</span>
              <h3>Vizyonumuz</h3>
              <p>{profile.vision}</p>
            </article>
          </div>
        </section>

        <section id="deyerlerimiz" className="about-page-values" aria-labelledby="about-values-title">
          <div className="about-page-values-intro">
            <HeartHandshake size={28} strokeWidth={1.55} aria-hidden="true" />
            <span className="about-page-section-kicker">03 · Bizi birləşdirən</span>
            <h2 id="about-values-title">Dəyərlərimiz</h2>
            <p>Hər qərarda, hər dərsdə və hər əməkdaşlıqda bizi istiqamətləndirən prinsiplər.</p>
          </div>
          <ol>
            {profile.values.map((value, index) => (
              <li key={value}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{value}</strong>
                <Check size={17} strokeWidth={2.2} aria-hidden="true" />
              </li>
            ))}
          </ol>
        </section>
      </div>

      <footer className="about-page-footer">
        <div>
          <span className="about-page-footer-mark">A</span>
          <div>
            <strong>Artmonia</strong>
            <span>Yaradıcılığın ünvanı</span>
          </div>
        </div>
        <span className="about-page-meta">
          {canEdit ? <ShieldCheck size={14} aria-hidden="true" /> : null}
          {profile.updatedAt ? `Son yenilənmə: ${formatDate(profile.updatedAt)}` : "Artmonia ERP"}
        </span>
      </footer>
    </div>
  );
}

function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}.${month}.${year}`;
}
