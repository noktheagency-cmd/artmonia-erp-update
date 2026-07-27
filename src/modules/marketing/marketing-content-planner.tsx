"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Clock3,
  Edit3,
  FileImage,
  Megaphone,
  MessageSquareText,
  Plus,
  RotateCcw,
  Send,
  Sparkles,
  ThumbsUp,
  Trash2,
  UploadCloud,
  UserRound,
  Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { notifyCaughtError } from "@/lib/app-notifications";
import { unwrapActionResult } from "@/lib/action-result";
import {
  approveMarketingContentAction,
  requestMarketingContentRevisionAction,
  saveMarketingContentAction,
} from "@/modules/marketing/content-actions";
import type { MarketingContentData, MarketingContentItemRow } from "@/modules/marketing/content-queries";
import { MarketingViewTabs } from "@/modules/marketing/marketing-view-tabs";

const monthNames = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "İyun", "İyul", "Avqust", "Sentyabr", "Oktyabr", "Noyabr", "Dekabr"];
const weekDays = ["B.e.", "Ç.a.", "Ç.", "C.a.", "C.", "Ş.", "B."];
const platforms = ["Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn", "Digər"];
const formats = ["Reel", "Story", "Karusel", "Post", "Video"];
const allowedMediaTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"]);
const maxMediaSize = 6 * 1024 * 1024;
const statusMeta = {
  DRAFT: { label: "Qaralama", short: "Qaralama", tone: "draft" },
  PENDING_APPROVAL: { label: "CEO təsdiqi gözləyir", short: "CEO gözləyir", tone: "pending" },
  ACTIVE: { label: "Aktiv", short: "Aktiv", tone: "active" },
  REVISION_REQUIRED: { label: "Düzəliş tələb olunur", short: "Düzəliş", tone: "revision" },
} as const;

export function MarketingContentPlanner({ data }: { data: MarketingContentData }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(data.items[0]?.id ?? "");
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("all");
  const [person, setPerson] = useState("all");
  const [editor, setEditor] = useState<{ open: boolean; item: MarketingContentItemRow | null; date: string }>({
    open: false,
    item: null,
    date: firstDateOfMonth(data.month),
  });
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const filteredItems = useMemo(
    () => data.items.filter((item) =>
      (platform === "all" || item.platform === platform)
      && (status === "all" || item.status === status)
      && (person === "all" || item.responsibleUserId === person)),
    [data.items, person, platform, status],
  );
  const selected = data.items.find((item) => item.id === selectedId) ?? filteredItems[0] ?? null;
  const days = useMemo(() => calendarDays(data.month), [data.month]);
  const stats = useMemo(() => ({
    total: data.items.length,
    pending: data.items.filter((item) => item.status === "PENDING_APPROVAL").length,
    active: data.items.filter((item) => item.status === "ACTIVE").length,
    revision: data.items.filter((item) => item.status === "REVISION_REQUIRED").length,
  }), [data.items]);

  function navigateMonth(offset: number) {
    const nextMonth = addMonths(data.month, offset);
    startTransition(() => router.push(`/marketing?view=content&month=${nextMonth}`));
  }

  function approve() {
    if (!selected) return;
    const formData = new FormData();
    formData.set("id", selected.id);
    startTransition(async () => {
      try {
        unwrapActionResult(await approveMarketingContentAction(formData));
        router.refresh();
      } catch (error) {
        notifyCaughtError(error, "Content təsdiqlənmədi", "Təsdiq uğursuz oldu");
      }
    });
  }

  return (
    <section className="page-stack content-planner">
      <header className="content-topbar">
        <div className="content-heading">
          <span className="content-heading-icon"><CalendarDays size={20} /></span>
          <div>
            <h1>Content plan</h1>
            <p>Marketing paylaşımlarını planla, təsdiqə göndər və yayıma hazırla.</p>
          </div>
        </div>
        <div className="content-topbar-actions">
          <Button variant="outline" onClick={() => router.push(`/marketing?view=content&month=${currentMonthKey()}`)}>Bu gün</Button>
          <span className="content-arrow-group">
            <Button variant="outline" size="icon" aria-label="Əvvəlki ay" onClick={() => navigateMonth(-1)} disabled={pending}><ChevronLeft /></Button>
            <Button variant="outline" size="icon" aria-label="Növbəti ay" onClick={() => navigateMonth(1)} disabled={pending}><ChevronRight /></Button>
          </span>
          <span className="content-view-mode"><CalendarDays size={15} /> Ay</span>
          {data.permissions.canManage ? (
            <Button className="content-create-button" onClick={() => setEditor({ open: true, item: null, date: todayDateKey() })}>
              <Plus size={16} /> Content yarat
            </Button>
          ) : null}
        </div>
      </header>

      <MarketingViewTabs active="content" />

      <section className="content-stat-strip" aria-label="Content status icmalı">
        <Stat icon={CalendarDays} label="Planlaşdırılıb" value={stats.total} tone="planned" />
        <Stat icon={Clock3} label="CEO təsdiqi gözləyir" value={stats.pending} tone="pending" />
        <Stat icon={CheckCircle2} label="Aktiv" value={stats.active} tone="active" />
        <Stat icon={RotateCcw} label="Düzəliş tələb olunur" value={stats.revision} tone="revision" />
      </section>

      <section className="content-filter-row" aria-label="Content filtrləri">
        <FilterSelect label="Platforma" value={platform} onChange={setPlatform} options={platforms} />
        <FilterSelect label="Status" value={status} onChange={setStatus} options={Object.entries(statusMeta).map(([value, meta]) => ({ value, label: meta.label }))} />
        <FilterSelect label="Məsul şəxs" value={person} onChange={setPerson} options={data.people.map((item) => ({ value: item.id, label: item.name }))} />
        <span className="content-filter-count">{filteredItems.length} content görünür</span>
      </section>

      <div className="content-workspace">
        <section className="content-calendar-shell" aria-label={`${monthLabel(data.month)} content calendar`}>
          <header className="content-calendar-title"><h2>{monthLabel(data.month)}</h2></header>
          <div className="content-weekdays">
            {weekDays.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="content-calendar-grid">
            {days.map((day) => {
              const dayItems = filteredItems.filter((item) => dateKey(item.scheduledAt) === day.key);
              return (
                <div
                  key={day.key}
                  className={cx("content-day", !day.inMonth && "is-outside", day.key === todayDateKey() && "is-today")}
                  onDoubleClick={() => data.permissions.canManage && setEditor({ open: true, item: null, date: day.key })}
                >
                  <button
                    type="button"
                    className="content-day-number"
                    onClick={() => data.permissions.canManage && setEditor({ open: true, item: null, date: day.key })}
                    aria-label={`${day.key} tarixinə content əlavə et`}
                  >
                    {day.day}
                  </button>
                  <div className="content-day-events">
                    {dayItems.slice(0, 3).map((item) => (
                      <ContentCard
                        key={item.id}
                        item={item}
                        selected={selected?.id === item.id}
                        onSelect={() => setSelectedId(item.id)}
                      />
                    ))}
                    {dayItems.length > 3 ? <span className="content-more">+{dayItems.length - 3} content</span> : null}
                  </div>
                </div>
              );
            })}
          </div>
          {filteredItems.length === 0 ? (
            <div className="content-empty-overlay">
              <span><Sparkles size={21} /></span>
              <strong>Bu ay üçün content yoxdur</strong>
              <p>İlk paylaşımı yaradıb calendar-a yerləşdirin.</p>
              {data.permissions.canManage ? <Button onClick={() => setEditor({ open: true, item: null, date: firstDateOfMonth(data.month) })}><Plus /> Content yarat</Button> : null}
            </div>
          ) : null}
        </section>

        <ContentInspector
          item={selected}
          canManage={data.permissions.canManage}
          canApprove={data.permissions.canApprove}
          pending={pending}
          onEdit={() => selected && setEditor({ open: true, item: selected, date: dateKey(selected.scheduledAt) })}
          onApprove={approve}
          onRevision={() => setRevisionOpen(true)}
        />
      </div>

      <ContentEditor
        key={`${editor.item?.id ?? "new"}:${editor.date}:${editor.open}`}
        open={editor.open}
        item={editor.item}
        initialDate={editor.date}
        data={data}
        onOpenChange={(open) => setEditor((current) => ({ ...current, open }))}
      />
      <RevisionDialog
        open={revisionOpen}
        item={selected}
        onOpenChange={setRevisionOpen}
      />
    </section>
  );
}

function ContentCard({ item, selected, onSelect }: { item: MarketingContentItemRow; selected: boolean; onSelect: () => void }) {
  const meta = statusMeta[item.status];
  return (
    <button type="button" className={cx("content-event-card", `is-${meta.tone}`, selected && "is-selected")} onClick={onSelect}>
      <span className="content-event-line">
        <PlatformIcon platform={item.platform} />
        <small>{item.format}</small>
        <time>{timeLabel(item.scheduledAt)}</time>
      </span>
      <strong>{item.title}</strong>
      <span className="content-event-footer">
        <i>{initials(item.responsibleName)}</i>
        <small>{meta.short}</small>
      </span>
    </button>
  );
}

function ContentInspector({
  item,
  canManage,
  canApprove,
  pending,
  onEdit,
  onApprove,
  onRevision,
}: {
  item: MarketingContentItemRow | null;
  canManage: boolean;
  canApprove: boolean;
  pending: boolean;
  onEdit: () => void;
  onApprove: () => void;
  onRevision: () => void;
}) {
  if (!item) {
    return (
      <aside className="content-inspector is-empty">
        <span><MessageSquareText size={22} /></span>
        <strong>Content seçilməyib</strong>
        <p>Detalları və təsdiq tarixçəsini görmək üçün calendar-dan content seçin.</p>
      </aside>
    );
  }
  const meta = statusMeta[item.status];
  return (
    <aside className="content-inspector">
      <header className="content-inspector-head">
        <div>
          <span className={cx("content-status-pill", `is-${meta.tone}`)}><i /> {meta.label}</span>
          <h2>{item.title}</h2>
          <p><PlatformIcon platform={item.platform} /> {item.platform} · {item.format}</p>
        </div>
        {canManage && item.status !== "ACTIVE" && item.status !== "PENDING_APPROVAL" ? (
          <Button variant="ghost" size="icon" aria-label="Content-i düzəlt" onClick={onEdit}><Edit3 /></Button>
        ) : null}
      </header>

      <div className={cx("content-preview", !item.mediaUrl && "is-placeholder")}>
        {item.mediaUrl ? <span className="content-preview-image" style={safeBackground(item.mediaUrl)} role="img" aria-label={`${item.title} önizləməsi`} /> : <><FileImage size={28} /><span>Media önizləməsi</span></>}
      </div>

      <dl className="content-detail-list">
        <div><dt><CalendarDays /> Plan tarixi</dt><dd>{fullDateLabel(item.scheduledAt)} · {timeLabel(item.scheduledAt)}</dd></div>
        <div><dt><UserRound /> Məsul şəxs</dt><dd>{item.responsibleName}</dd></div>
        {item.campaignName ? <div><dt><Megaphone /> Kampaniya</dt><dd>{item.campaignName}</dd></div> : null}
      </dl>

      <section className="content-copy-block">
        <span>Caption</span>
        <p>{item.caption || "Caption əlavə edilməyib."}</p>
      </section>

      {item.revisionNote ? <section className="content-revision-note"><strong>Düzəliş qeydi</strong><p>{item.revisionNote}</p></section> : null}

      <section className="content-timeline">
        <h3>Təsdiq tarixçəsi</h3>
        {item.activities.length ? item.activities.map((activity) => (
          <div key={activity.id}>
            <span className={cx("content-timeline-dot", `is-${activity.action.toLowerCase()}`)}><Check size={11} /></span>
            <p><strong>{activityLabel(activity.action)}</strong><small>{activity.actorName} · {dateTimeLabel(activity.createdAt)}</small>{activity.note ? <em>{activity.note}</em> : null}</p>
          </div>
        )) : <p className="content-no-activity">Tarixçə yoxdur.</p>}
      </section>

      {canApprove && item.status === "PENDING_APPROVAL" ? (
        <footer className="content-approval-actions">
          <Button variant="outline" onClick={onRevision} disabled={pending}><RotateCcw /> Düzəliş istə</Button>
          <Button onClick={onApprove} disabled={pending}><CheckCircle2 /> Təsdiqlə və aktiv et</Button>
        </footer>
      ) : null}
    </aside>
  );
}

function ContentEditor({
  open,
  item,
  initialDate,
  data,
  onOpenChange,
}: {
  open: boolean;
  item: MarketingContentItemRow | null;
  initialDate: string;
  data: MarketingContentData;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [intent, setIntent] = useState<"DRAFT" | "SUBMIT">("SUBMIT");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState(item?.mediaUrl ?? "");
  const [removeExistingMedia, setRemoveExistingMedia] = useState(false);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => () => {
    if (mediaPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(mediaPreviewUrl);
  }, [mediaPreviewUrl]);

  function chooseMedia(file?: File) {
    if (!file) return;
    if (!allowedMediaTypes.has(file.type)) {
      setError("JPG, PNG, WEBP, GIF, MP4, WEBM və ya MOV faylı seçin.");
      return;
    }
    if (file.size > maxMediaSize) {
      setError("Fayl 6 MB limitini keçir.");
      return;
    }
    setError("");
    setMediaFile(file);
    setMediaPreviewUrl(URL.createObjectURL(file));
    setRemoveExistingMedia(false);
  }

  function clearMedia() {
    setMediaFile(null);
    setMediaPreviewUrl("");
    setRemoveExistingMedia(Boolean(item?.mediaUrl));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("intent", intent);
    setError("");
    setProgressLabel(mediaFile ? "Media yüklənir..." : "Content saxlanır...");
    startTransition(async () => {
      let uploadedPath = "";
      try {
        if (mediaFile) {
          const uploaded = await uploadContentMedia(mediaFile);
          uploadedPath = uploaded.path;
          formData.set("mediaUrl", uploaded.url);
          formData.set("mediaPath", uploaded.path);
          setProgressLabel("Content saxlanır...");
        } else if (removeExistingMedia) {
          formData.set("mediaUrl", "");
          formData.set("mediaPath", "");
        }

        unwrapActionResult(await saveMarketingContentAction(formData));
        if (item?.mediaPath && item.mediaPath !== uploadedPath && (uploadedPath || removeExistingMedia)) {
          await deleteContentMedia(item.mediaPath);
        }
        onOpenChange(false);
        router.refresh();
      } catch (caught) {
        if (uploadedPath) await deleteContentMedia(uploadedPath);
        setError(notifyCaughtError(caught, "Content yadda saxlanmadı", "Content saxlanmadı"));
      } finally {
        setProgressLabel("");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="content-editor-modal">
        <DialogHeader>
          <DialogTitle>{item ? "Content-i düzəlt" : "Yeni content yarat"}</DialogTitle>
          <DialogDescription>Paylaşımı planla və CEO təsdiqinə göndər.</DialogDescription>
        </DialogHeader>
        <form className="content-editor-form" onSubmit={submit}>
          {item ? <input type="hidden" name="id" value={item.id} /> : null}
          <input type="hidden" name="mediaUrl" value={item?.mediaUrl ?? ""} />
          <input type="hidden" name="mediaPath" value={item?.mediaPath ?? ""} />
          <div className="content-editor-layout">
            <section className="content-media-column">
              <input
                ref={fileInputRef}
                className="content-media-input"
                type="file"
                accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.mov,image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
                onChange={(event) => chooseMedia(event.target.files?.[0])}
              />
              <div
                className={cx("content-media-drop", mediaPreviewUrl && "has-media")}
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click();
                }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  chooseMedia(event.dataTransfer.files[0]);
                }}
              >
                {mediaPreviewUrl
                  ? isVideoMedia(mediaFile?.type, mediaPreviewUrl)
                    ? <video className="content-media-video" src={mediaPreviewUrl} muted controls onClick={(event) => event.stopPropagation()} />
                    : <span className="content-media-image" style={safeBackground(mediaPreviewUrl)} role="img" aria-label="Content media önizləməsi" />
                  : <><span><UploadCloud size={25} /></span><strong>Şəkil və ya video yüklə</strong><p>Faylı bura sürükləyin və ya seçmək üçün klikləyin.</p><small>JPG, PNG, WEBP, GIF, MP4, WEBM, MOV · maksimum 6 MB</small></>}
                {mediaPreviewUrl ? (
                  <button
                    type="button"
                    className="content-media-remove"
                    onClick={(event) => {
                      event.stopPropagation();
                      clearMedia();
                    }}
                    aria-label="Medianı sil"
                  >
                    <Trash2 />
                  </button>
                ) : null}
              </div>
              {mediaFile ? <p className="content-media-selected"><FileImage /> <span><strong>{mediaFile.name}</strong><small>{formatBytes(mediaFile.size)}</small></span></p> : null}
            </section>

            <section className="content-fields-column">
              <label className="content-form-field is-wide"><span>Content adı</span><Input name="title" defaultValue={item?.title} placeholder="Məsələn: Yay kampaniyası — Reel 01" required maxLength={120} /></label>
              <div className="content-form-grid">
                <FieldSelect name="platform" label="Platforma" defaultValue={item?.platform ?? "Instagram"} options={platforms} />
                <FieldSelect name="format" label="Format" defaultValue={item?.format ?? "Reel"} options={formats} />
                <label className="content-form-field"><span>Tarix</span><Input name="scheduledDate" type="date" defaultValue={item ? dateKey(item.scheduledAt) : initialDate} required /></label>
                <label className="content-form-field"><span>Saat</span><Input name="scheduledTime" type="time" defaultValue={item ? timeLabel(item.scheduledAt) : "11:00"} required /></label>
                <FieldSelect name="responsibleUserId" label="Məsul şəxs" defaultValue={item?.responsibleUserId ?? ""} options={data.people.map((person) => ({ value: person.id, label: person.name }))} emptyLabel="Təyin edilməyib" />
                <FieldSelect name="campaignId" label="Kampaniya" defaultValue={item?.campaignId ?? ""} options={data.campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))} emptyLabel="Kampaniyasız" />
              </div>
              <label className="content-form-field"><span>Caption</span><textarea name="caption" rows={4} maxLength={2200} defaultValue={item?.caption} placeholder="Paylaşım mətnini yazın..." /></label>
              <label className="content-form-field"><span>Komanda üçün qeyd <small>(istəyə bağlı)</small></span><textarea name="notes" rows={2} maxLength={1000} defaultValue={item?.notes} placeholder="Dizayn, hashtag və ya çəkiliş qeydləri..." /></label>
              <div className="content-workflow-choice">
                <button type="button" className={cx(intent === "DRAFT" && "is-selected")} onClick={() => setIntent("DRAFT")}>
                  <CircleDashed /><span><strong>Qaralama saxla</strong><small>Komanda üzərində işləməyə davam etsin</small></span>
                </button>
                <button type="button" className={cx(intent === "SUBMIT" && "is-selected")} onClick={() => setIntent("SUBMIT")}>
                  <Send /><span><strong>CEO təsdiqinə göndər</strong><small>Təsdiqdən sonra content aktiv olacaq</small></span>
                </button>
              </div>
            </section>
          </div>
          {error ? <p className="content-form-error">{error}</p> : null}
          <DialogFooter className="content-editor-footer">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Ləğv et</Button>
            {intent === "SUBMIT" ? <Button type="submit" disabled={pending}><Send /> {pending ? progressLabel || "Göndərilir..." : "CEO təsdiqinə göndər"}</Button> : <Button type="submit" variant="outline" disabled={pending}>{pending ? progressLabel || "Saxlanır..." : "Qaralama saxla"}</Button>}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RevisionDialog({ open, item, onOpenChange }: { open: boolean; item: MarketingContentItemRow | null; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setError("");
    startTransition(async () => {
      try {
        unwrapActionResult(await requestMarketingContentRevisionAction(formData));
        onOpenChange(false);
        router.refresh();
      } catch (caught) {
        setError(notifyCaughtError(caught, "Content düzəlişə qaytarılmadı", "Əməliyyat uğursuz oldu"));
      }
    });
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="content-revision-modal">
        <DialogHeader><DialogTitle>Düzəliş istə</DialogTitle><DialogDescription>Marketing komandasına konkret dəyişiklik qeydini göndərin.</DialogDescription></DialogHeader>
        <form onSubmit={submit}>
          <input type="hidden" name="id" value={item?.id ?? ""} />
          <label className="content-form-field"><span>Düzəliş qeydi</span><textarea name="note" rows={5} minLength={3} maxLength={600} required placeholder="Nə dəyişməlidir?" /></label>
          {error ? <p className="content-form-error">{error}</p> : null}
          <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Ləğv et</Button><Button type="submit" disabled={pending}><ArrowLeft /> {pending ? "Göndərilir..." : "Düzəlişə qaytar"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ icon: Icon, label, value, tone }: { icon: typeof CalendarDays; label: string; value: number; tone: string }) {
  return <article className={`content-stat is-${tone}`}><span><Icon size={17} /></span><div><strong>{value}</strong><small>{label}</small></div></article>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] | Array<{ value: string; label: string }> }) {
  return <label className="content-filter"><span>{label}</span><select value={value} onChange={(event) => onChange(event.target.value)}><option value="all">Hamısı</option>{options.map((option) => typeof option === "string" ? <option key={option} value={option}>{option}</option> : <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function FieldSelect({ name, label, defaultValue, options, emptyLabel }: { name: string; label: string; defaultValue: string; options: string[] | Array<{ value: string; label: string }>; emptyLabel?: string }) {
  return <label className="content-form-field"><span>{label}</span><select name={name} defaultValue={defaultValue}>{emptyLabel ? <option value="">{emptyLabel}</option> : null}{options.map((option) => typeof option === "string" ? <option key={option} value={option}>{option}</option> : <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "Instagram") return <Camera aria-label="Instagram" />;
  if (platform === "Facebook") return <ThumbsUp aria-label="Facebook" />;
  if (platform === "YouTube") return <Video aria-label="YouTube" />;
  return <Megaphone aria-label={platform} />;
}

function calendarDays(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - mondayOffset);
  return Array.from({ length: 42 }, (_, index) => {
    const value = new Date(start);
    value.setUTCDate(start.getUTCDate() + index);
    return {
      key: `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`,
      day: value.getUTCDate(),
      inMonth: value.getUTCMonth() === monthNumber - 1,
    };
  });
}

function addMonths(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const value = new Date(Date.UTC(year, monthNumber - 1 + offset, 1));
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  return `${monthNames[monthNumber - 1]} ${year}`;
}

function firstDateOfMonth(month: string) {
  return `${month}-01`;
}

function currentMonthKey() {
  return todayDateKey().slice(0, 7);
}

function todayDateKey() {
  const date = new Date(Date.now() + 4 * 60 * 60 * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function bakuDate(value: string) {
  return new Date(new Date(value).getTime() + 4 * 60 * 60 * 1000);
}

function dateKey(value: string) {
  const date = bakuDate(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function timeLabel(value: string) {
  const date = bakuDate(value);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function fullDateLabel(value: string) {
  const date = bakuDate(value);
  return `${date.getUTCDate()} ${monthNames[date.getUTCMonth()].toLocaleLowerCase("az")} ${date.getUTCFullYear()}`;
}

function dateTimeLabel(value: string) {
  return `${fullDateLabel(value)}, ${timeLabel(value)}`;
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "M") + (parts[1]?.[0] ?? "");
}

function activityLabel(action: string) {
  const labels: Record<string, string> = {
    CREATED: "Content yaradıldı",
    UPDATED: "Content yeniləndi",
    SUBMITTED: "CEO təsdiqinə göndərildi",
    APPROVED: "Təsdiqləndi və aktiv edildi",
    REVISION_REQUESTED: "Düzəliş tələb olundu",
  };
  return labels[action] ?? action;
}

async function uploadContentMedia(file: File): Promise<{ path: string; url: string }> {
  const formData = new FormData();
  formData.set("file", file);
  const response = await fetch("/api/marketing/content-media", { method: "POST", body: formData });
  const payload = await response.json().catch(() => ({})) as { path?: string; url?: string; error?: string };
  if (!response.ok || !payload.path || !payload.url) {
    throw new Error(payload.error || "Media faylı yüklənmədi.");
  }
  return { path: payload.path, url: payload.url };
}

async function deleteContentMedia(path: string) {
  await fetch("/api/marketing/content-media", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  }).catch(() => undefined);
}

function isVideoMedia(mimeType: string | undefined, url: string) {
  return mimeType?.startsWith("video/") || /\.(?:mp4|webm|mov)(?:\?|$)/i.test(url);
}

function formatBytes(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function safeBackground(value: string) {
  if (!/^https?:\/\//i.test(value)) return undefined;
  return { backgroundImage: `url("${value.replaceAll('"', "%22")}")` };
}
