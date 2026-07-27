"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { DragEvent, FormEvent, ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
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
  GripVertical,
  Images,
  Megaphone,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Send,
  Sparkles,
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
  scheduleMarketingSlideAction,
  unscheduleMarketingSlideAction,
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
  PENDING_APPROVAL: { label: "Founder təsdiqi gözləyir", short: "Founder təsdiqi", tone: "pending" },
  ACTIVE: { label: "Founder təsdiqlədi", short: "Təsdiqlənib", tone: "approved" },
  REVISION_REQUIRED: { label: "Dəyişiklik tələb olunur", short: "Düzəliş", tone: "revision" },
} as const;

type LibraryTab = "all" | "approved";

export function MarketingSlidePlanner({ data }: { data: MarketingContentData }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState(data.items[0]?.id ?? "");
  const [libraryTab, setLibraryTab] = useState<LibraryTab>("all");
  const [query, setQuery] = useState("");
  const [draggingId, setDraggingId] = useState("");
  const [dropDate, setDropDate] = useState("");
  const [scheduleOverrides, setScheduleOverrides] = useState<Record<string, string>>({});
  const [editorItem, setEditorItem] = useState<MarketingContentItemRow | null | undefined>(undefined);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const selected = data.items.find((item) => item.id === selectedId) ?? data.items[0] ?? null;
  const days = useMemo(() => calendarDays(data.month), [data.month]);
  const visibleLibrary = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("az");
    return data.items.filter((item) => {
      if (libraryTab === "approved" && item.status !== "ACTIVE") return false;
      if (!normalizedQuery) return true;
      return `${item.title} ${item.platform} ${item.format} ${item.responsibleName}`
        .toLocaleLowerCase("az")
        .includes(normalizedQuery);
    });
  }, [data.items, libraryTab, query]);
  const stats = useMemo(() => ({
    drafts: data.items.filter((item) => item.status === "DRAFT" || item.status === "REVISION_REQUIRED").length,
    pending: data.items.filter((item) => item.status === "PENDING_APPROVAL").length,
    approved: data.items.filter((item) => item.status === "ACTIVE" && !effectiveSchedule(item, scheduleOverrides)).length,
    scheduled: data.items.filter((item) => Boolean(effectiveSchedule(item, scheduleOverrides))).length,
  }), [data.items, scheduleOverrides]);

  function navigateMonth(offset: number) {
    const nextMonth = addMonths(data.month, offset);
    startTransition(() => router.push(`/marketing?view=content&month=${nextMonth}`));
  }

  function beginDrag(event: DragEvent<HTMLElement>, item: MarketingContentItemRow) {
    if (!data.permissions.canManage || item.status !== "ACTIVE") {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", item.id);
    setSelectedId(item.id);
    setDraggingId(item.id);
  }

  function dropSlide(event: DragEvent<HTMLDivElement>, date: string) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain") || draggingId;
    const item = data.items.find((candidate) => candidate.id === id);
    setDraggingId("");
    setDropDate("");
    if (!item || item.status !== "ACTIVE" || !data.permissions.canManage) return;

    const currentTime = item.scheduledAt ? timeLabel(item.scheduledAt) : "11:00";
    const nextScheduledAt = scheduledIso(date, currentTime);
    setScheduleOverrides((current) => ({ ...current, [item.id]: nextScheduledAt }));
    const formData = new FormData();
    formData.set("id", item.id);
    formData.set("scheduledDate", date);
    formData.set("scheduledTime", currentTime);
    startTransition(async () => {
      try {
        unwrapActionResult(await scheduleMarketingSlideAction(formData));
        router.refresh();
      } catch (error) {
        setScheduleOverrides((current) => {
          const next = { ...current };
          delete next[item.id];
          return next;
        });
        notifyCaughtError(error, "Slide calendar-a əlavə edilmədi", "Planlama uğursuz oldu");
      }
    });
  }

  function approve(item: MarketingContentItemRow) {
    const formData = new FormData();
    formData.set("id", item.id);
    startTransition(async () => {
      try {
        unwrapActionResult(await approveMarketingContentAction(formData));
        router.refresh();
      } catch (error) {
        notifyCaughtError(error, "Slide təsdiqlənmədi", "Təsdiq uğursuz oldu");
      }
    });
  }

  function unschedule(item: MarketingContentItemRow) {
    const formData = new FormData();
    formData.set("id", item.id);
    setScheduleOverrides((current) => ({ ...current, [item.id]: "" }));
    startTransition(async () => {
      try {
        unwrapActionResult(await unscheduleMarketingSlideAction(formData));
        router.refresh();
      } catch (error) {
        setScheduleOverrides((current) => {
          const next = { ...current };
          delete next[item.id];
          return next;
        });
        notifyCaughtError(error, "Slide plandan çıxarılmadı", "Əməliyyat uğursuz oldu");
      }
    });
  }

  return (
    <section className="slide-planner">
      <header className="slide-topbar">
        <div className="slide-heading">
          <span><CalendarDays /></span>
          <div>
            <h1>Content plan</h1>
            <p>Slide yarat, founder təsdiqindən keçir və calendar-a sürükləyərək planla.</p>
          </div>
        </div>
        <div className="slide-top-actions">
          <Button variant="outline" onClick={() => router.push(`/marketing?view=content&month=${currentMonthKey()}`)}>Bu gün</Button>
          <div className="slide-month-arrows">
            <Button variant="outline" size="icon" aria-label="Əvvəlki ay" onClick={() => navigateMonth(-1)} disabled={pending}><ChevronLeft /></Button>
            <Button variant="outline" size="icon" aria-label="Növbəti ay" onClick={() => navigateMonth(1)} disabled={pending}><ChevronRight /></Button>
          </div>
          <span className="slide-month-select"><CalendarDays /> {monthLabel(data.month)}</span>
          {data.permissions.canManage ? <Button className="slide-primary-button" onClick={() => setEditorItem(null)}><Plus /> Yeni slide</Button> : null}
        </div>
      </header>

      <MarketingViewTabs active="content" month={data.month} />

      <section className="slide-flow-strip" aria-label="Slide iş axını">
        <FlowMetric icon={Edit3} label="Qaralama" value={stats.drafts} tone="draft" />
        <FlowMetric icon={Clock3} label="Founder təsdiqi" value={stats.pending} tone="pending" />
        <FlowMetric icon={CheckCircle2} label="Calendar-a hazır" value={stats.approved} tone="approved" />
        <FlowMetric icon={CalendarDays} label="Planlanıb" value={stats.scheduled} tone="scheduled" />
      </section>

      <section className="slide-workbench">
        <aside className="slide-library" aria-label="Slide kitabxanası">
          <header className="slide-panel-head">
            <div><h2>Slide kitabxanası</h2><span>{data.items.length} slide</span></div>
            <MoreHorizontal />
          </header>
          {data.permissions.canManage ? <Button className="slide-library-create" onClick={() => setEditorItem(null)}><Plus /> Yeni slide</Button> : null}
          <label className="slide-library-search">
            <Search />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Slide axtar..." aria-label="Slide axtar" />
          </label>
          <div className="slide-library-tabs" role="tablist" aria-label="Slide filtri">
            <button type="button" role="tab" aria-selected={libraryTab === "all"} className={libraryTab === "all" ? "is-active" : ""} onClick={() => setLibraryTab("all")}>Bütün slidelar</button>
            <button type="button" role="tab" aria-selected={libraryTab === "approved"} className={libraryTab === "approved" ? "is-active" : ""} onClick={() => setLibraryTab("approved")}>Təsdiqlənmiş</button>
          </div>
          <div className="slide-library-list">
            {visibleLibrary.map((item) => (
              <LibraryCard
                key={item.id}
                item={item}
                selected={selected?.id === item.id}
                scheduledAt={effectiveSchedule(item, scheduleOverrides)}
                canDrag={data.permissions.canManage && item.status === "ACTIVE"}
                onSelect={() => setSelectedId(item.id)}
                onDragStart={(event) => beginDrag(event, item)}
                onDragEnd={() => { setDraggingId(""); setDropDate(""); }}
              />
            ))}
            {visibleLibrary.length === 0 ? <div className="slide-library-empty"><Images /><strong>Slide tapılmadı</strong><span>Filtri dəyişin və ya yeni slide yaradın.</span></div> : null}
          </div>
          {visibleLibrary.length > 0 ? <footer className="slide-library-footer">{visibleLibrary.length} nəticə göstərilir</footer> : null}
        </aside>

        <section className="slide-calendar" aria-label={`${monthLabel(data.month)} slide calendar`}>
          <header className="slide-calendar-head">
            <div><h2>{monthLabel(data.month)}</h2><span>Təsdiqlənmiş slide-ı günün üzərinə sürükləyin</span></div>
            <span className="slide-calendar-mode">Ay görünüşü</span>
          </header>
          <div className="slide-weekdays">{weekDays.map((day) => <span key={day}>{day}</span>)}</div>
          <div className="slide-calendar-grid">
            {days.map((day) => {
              const dayItems = data.items.filter((item) => {
                const value = effectiveSchedule(item, scheduleOverrides);
                return value && dateKey(value) === day.key;
              });
              return (
                <div
                  key={day.key}
                  className={cx(
                    "slide-calendar-day",
                    !day.inMonth && "is-outside",
                    day.key === todayDateKey() && "is-today",
                    dropDate === day.key && "is-drop-target",
                  )}
                  onDragOver={(event) => {
                    if (!draggingId) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    setDropDate(day.key);
                  }}
                  onDragLeave={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropDate("");
                  }}
                  onDrop={(event) => dropSlide(event, day.key)}
                >
                  <span className="slide-day-number">{day.day}</span>
                  <div className="slide-day-items">
                    {dayItems.slice(0, 3).map((item) => (
                      <CalendarSlide
                        key={item.id}
                        item={item}
                        scheduledAt={effectiveSchedule(item, scheduleOverrides)}
                        selected={selected?.id === item.id}
                        draggable={data.permissions.canManage && item.status === "ACTIVE"}
                        onSelect={() => setSelectedId(item.id)}
                        onDragStart={(event) => beginDrag(event, item)}
                        onDragEnd={() => { setDraggingId(""); setDropDate(""); }}
                      />
                    ))}
                    {dayItems.length > 3 ? <span className="slide-day-more">+{dayItems.length - 3} slide</span> : null}
                  </div>
                  {dropDate === day.key ? <span className="slide-drop-hint"><Plus /> Buraya əlavə et</span> : null}
                </div>
              );
            })}
          </div>
          {data.items.length === 0 ? <div className="slide-empty-state"><Sparkles /><strong>Slide kitabxanası boşdur</strong><span>İlk slide-ı yaradıb founder təsdiqinə göndərin.</span></div> : null}
        </section>

        <SlideInspector
          item={selected}
          scheduledAt={selected ? effectiveSchedule(selected, scheduleOverrides) : ""}
          canManage={data.permissions.canManage}
          canApprove={data.permissions.canApprove}
          pending={pending}
          onEdit={() => selected && setEditorItem(selected)}
          onApprove={() => selected && approve(selected)}
          onRevision={() => setRevisionOpen(true)}
          onUnschedule={() => selected && unschedule(selected)}
        />
      </section>

      <SlideEditor
        key={`${editorItem?.id ?? "new"}:${editorItem === undefined ? "closed" : "open"}`}
        open={editorItem !== undefined}
        item={editorItem ?? null}
        data={data}
        onOpenChange={(open) => { if (!open) setEditorItem(undefined); }}
      />
      <RevisionDialog open={revisionOpen} item={selected} onOpenChange={setRevisionOpen} />
    </section>
  );
}

function FlowMetric({ icon: Icon, label, value, tone }: { icon: typeof CalendarDays; label: string; value: number; tone: string }) {
  return <article className={`slide-flow-metric is-${tone}`}><span><Icon /></span><strong>{value}</strong><small>{label}</small></article>;
}

function LibraryCard({
  item,
  selected,
  scheduledAt,
  canDrag,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  item: MarketingContentItemRow;
  selected: boolean;
  scheduledAt: string;
  canDrag: boolean;
  onSelect: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  const meta = statusMeta[item.status];
  return (
    <article
      className={cx("slide-library-card", `is-${meta.tone}`, selected && "is-selected", canDrag && "is-draggable")}
      draggable={canDrag}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onSelect}
    >
      <MediaThumb item={item} />
      <div className="slide-library-card-copy">
        <strong>{item.title}</strong>
        <span>{item.format} · {formatRatio(item.format)}</span>
        <small className={`slide-status-text is-${meta.tone}`}>{item.status === "ACTIVE" ? <Check /> : null}{scheduledAt ? "Planlanıb" : meta.short}</small>
        <em>{initials(item.responsibleName)} · {item.responsibleName}</em>
      </div>
      {canDrag ? <span className="slide-drag-handle" title="Calendar-a sürüklə"><GripVertical /></span> : <span className="slide-lock-dot" title={meta.label} />}
    </article>
  );
}

function CalendarSlide({
  item,
  scheduledAt,
  selected,
  draggable,
  onSelect,
  onDragStart,
  onDragEnd,
}: {
  item: MarketingContentItemRow;
  scheduledAt: string;
  selected: boolean;
  draggable: boolean;
  onSelect: () => void;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
}) {
  return (
    <button
      type="button"
      className={cx("slide-calendar-card", selected && "is-selected")}
      draggable={draggable}
      onClick={onSelect}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
    >
      <MediaThumb item={item} compact />
      <span><strong>{item.title}</strong><small>{timeLabel(scheduledAt)} · {item.platform}</small></span>
    </button>
  );
}

function MediaThumb({ item, compact = false }: { item: MarketingContentItemRow; compact?: boolean }) {
  return (
    <span className={cx("slide-media-thumb", compact && "is-compact", !item.mediaUrl && "is-empty")} style={safeBackground(item.mediaUrl)}>
      {!item.mediaUrl ? <FileImage /> : null}
      <i><PlatformIcon platform={item.platform} /></i>
    </span>
  );
}

function SlideInspector({
  item,
  scheduledAt,
  canManage,
  canApprove,
  pending,
  onEdit,
  onApprove,
  onRevision,
  onUnschedule,
}: {
  item: MarketingContentItemRow | null;
  scheduledAt: string;
  canManage: boolean;
  canApprove: boolean;
  pending: boolean;
  onEdit: () => void;
  onApprove: () => void;
  onRevision: () => void;
  onUnschedule: () => void;
}) {
  if (!item) {
    return <aside className="slide-inspector is-empty"><Images /><strong>Slide seçilməyib</strong><span>Detalları görmək üçün kitabxanadan slide seçin.</span></aside>;
  }
  const meta = statusMeta[item.status];
  return (
    <aside className="slide-inspector">
      <header className="slide-panel-head">
        <div><h2>Seçilmiş slide</h2><span className={`slide-inspector-status is-${meta.tone}`}>{item.status === "ACTIVE" ? <CheckCircle2 /> : <Clock3 />}{meta.label}</span></div>
        {canManage && item.status !== "PENDING_APPROVAL" && item.status !== "ACTIVE" ? <Button variant="ghost" size="icon" aria-label="Slide-ı redaktə et" onClick={onEdit}><Edit3 /></Button> : <MoreHorizontal />}
      </header>
      <div className={cx("slide-inspector-preview", !item.mediaUrl && "is-empty")} style={safeBackground(item.mediaUrl)}>
        {!item.mediaUrl ? <><FileImage /><span>Media önizləməsi</span></> : null}
        <i><PlatformIcon platform={item.platform} /></i>
      </div>
      <h3>{item.title}</h3>
      <dl className="slide-inspector-details">
        <div><dt><Megaphone />Platforma</dt><dd>{item.platform}</dd></div>
        <div><dt><Images />Format</dt><dd>{item.format} · {formatRatio(item.format)}</dd></div>
        <div><dt><UserRound />Məsul şəxs</dt><dd><i>{initials(item.responsibleName)}</i>{item.responsibleName}</dd></div>
        <div><dt><CalendarDays />Plan tarixi</dt><dd>{scheduledAt ? dateTimeLabel(scheduledAt) : item.status === "ACTIVE" ? "Calendar-a sürükləyin" : "Təsdiqdən sonra seçiləcək"}</dd></div>
      </dl>
      <section className="slide-caption-block"><span>Caption</span><p>{item.caption || "Caption əlavə edilməyib."}</p></section>
      {item.revisionNote ? <section className="slide-revision-note"><strong>Düzəliş qeydi</strong><p>{item.revisionNote}</p></section> : null}
      <div className="slide-inspector-actions">
        {canApprove && item.status === "PENDING_APPROVAL" ? <>
          <Button variant="outline" onClick={onRevision} disabled={pending}><RotateCcw /> Düzəliş istə</Button>
          <Button className="slide-approve-button" onClick={onApprove} disabled={pending}><CheckCircle2 /> Təsdiqlə</Button>
        </> : null}
        {canManage && item.status === "ACTIVE" && !scheduledAt ? <p className="slide-drag-instruction"><GripVertical /> Slide hazırdır — calendar gününə sürükləyin.</p> : null}
        {canManage && item.status === "ACTIVE" && scheduledAt ? <Button variant="outline" onClick={onUnschedule} disabled={pending}><Trash2 /> Planlaşdırmadan çıxar</Button> : null}
      </div>
    </aside>
  );
}

function SlideEditor({
  open,
  item,
  data,
  onOpenChange,
}: {
  open: boolean;
  item: MarketingContentItemRow | null;
  data: MarketingContentData;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [intent, setIntent] = useState<"DRAFT" | "SUBMIT">("SUBMIT");
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreviewUrl, setMediaPreviewUrl] = useState(item?.mediaUrl ?? "");
  const [removeExistingMedia, setRemoveExistingMedia] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [pending, startTransition] = useTransition();

  useEffect(() => () => {
    if (mediaPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(mediaPreviewUrl);
  }, [mediaPreviewUrl]);

  function chooseMedia(file?: File) {
    if (!file) return;
    if (!allowedMediaTypes.has(file.type)) return setError("JPG, PNG, WEBP, GIF, MP4, WEBM və ya MOV faylı seçin.");
    if (file.size > maxMediaSize) return setError("Fayl 6 MB limitini keçir.");
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
    setProgress(mediaFile ? "Media yüklənir..." : "Slide saxlanır...");
    startTransition(async () => {
      let uploadedPath = "";
      try {
        if (mediaFile) {
          const uploaded = await uploadContentMedia(mediaFile);
          uploadedPath = uploaded.path;
          formData.set("mediaUrl", uploaded.url);
          formData.set("mediaPath", uploaded.path);
          setProgress("Slide saxlanır...");
        } else if (removeExistingMedia) {
          formData.set("mediaUrl", "");
          formData.set("mediaPath", "");
        }
        unwrapActionResult(await saveMarketingContentAction(formData));
        if (item?.mediaPath && item.mediaPath !== uploadedPath && (uploadedPath || removeExistingMedia)) await deleteContentMedia(item.mediaPath);
        onOpenChange(false);
        router.refresh();
      } catch (caught) {
        if (uploadedPath) await deleteContentMedia(uploadedPath);
        setError(notifyCaughtError(caught, "Slide yadda saxlanmadı", "Slide saxlanmadı"));
      } finally {
        setProgress("");
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="slide-editor-modal">
        <DialogHeader><DialogTitle>{item ? "Slide-ı redaktə et" : "Yeni slide yarat"}</DialogTitle><DialogDescription>Vizualı və mətni tamamlayın, sonra founder təsdiqinə göndərin.</DialogDescription></DialogHeader>
        <form onSubmit={submit}>
          {item ? <input type="hidden" name="id" value={item.id} /> : null}
          <input type="hidden" name="mediaUrl" value={item?.mediaUrl ?? ""} />
          <input type="hidden" name="mediaPath" value={item?.mediaPath ?? ""} />
          <div className="slide-editor-layout">
            <section className="slide-upload-column">
              <input ref={fileInputRef} className="slide-file-input" type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.mov" onChange={(event) => chooseMedia(event.target.files?.[0])} />
              <div
                className={cx("slide-upload-zone", mediaPreviewUrl && "has-media")}
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") fileInputRef.current?.click(); }}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => { event.preventDefault(); chooseMedia(event.dataTransfer.files[0]); }}
              >
                {mediaPreviewUrl
                  ? isVideoMedia(mediaFile?.type, mediaPreviewUrl)
                    ? <video src={mediaPreviewUrl} muted controls onClick={(event) => event.stopPropagation()} />
                    : <span style={safeBackground(mediaPreviewUrl)} />
                  : <><i><UploadCloud /></i><strong>Vizualı bura sürükləyin</strong><p>və ya fayl seçmək üçün klikləyin</p><small>JPG, PNG, WEBP, GIF, MP4 · max 6 MB</small></>}
                {mediaPreviewUrl ? <button type="button" onClick={(event) => { event.stopPropagation(); clearMedia(); }} aria-label="Medianı sil"><Trash2 /></button> : null}
              </div>
              <p className="slide-upload-help"><Sparkles /> Slide tarixsiz yaradılır. Founder təsdiqindən sonra calendar-a əlavə olunur.</p>
            </section>
            <section className="slide-editor-fields">
              <Field label="Slide adı"><Input name="title" defaultValue={item?.title} placeholder="Məsələn: Yay kolleksiyası — ilham" required maxLength={120} /></Field>
              <div className="slide-field-grid">
                <FieldSelect name="platform" label="Platforma" defaultValue={item?.platform ?? "Instagram"} options={platforms} />
                <FieldSelect name="format" label="Slide şablonu" defaultValue={item?.format ?? "Post"} options={formats.map((value) => ({ value, label: `${value} · ${formatRatio(value)}` }))} />
                <FieldSelect name="responsibleUserId" label="Məsul şəxs" defaultValue={item?.responsibleUserId ?? ""} options={data.people.map((person) => ({ value: person.id, label: person.name }))} emptyLabel="Təyin edilməyib" />
                <FieldSelect name="campaignId" label="Kampaniya" defaultValue={item?.campaignId ?? ""} options={data.campaigns.map((campaign) => ({ value: campaign.id, label: campaign.name }))} emptyLabel="Kampaniyasız" />
              </div>
              <Field label="Caption"><textarea name="caption" rows={4} maxLength={2200} defaultValue={item?.caption} placeholder="Paylaşım mətnini yazın..." /></Field>
              <Field label="Komanda üçün qeyd"><textarea name="notes" rows={2} maxLength={1000} defaultValue={item?.notes} placeholder="Dizayn, hashtag və ya çəkiliş qeydləri..." /></Field>
              <div className="slide-workflow-choice">
                <button type="button" className={intent === "DRAFT" ? "is-selected" : ""} onClick={() => setIntent("DRAFT")}><CircleDashed /><span><strong>Qaralama saxla</strong><small>Komanda üzərində işləməyə davam etsin</small></span></button>
                <button type="button" className={intent === "SUBMIT" ? "is-selected" : ""} onClick={() => setIntent("SUBMIT")}><Send /><span><strong>Founder təsdiqinə göndər</strong><small>Təsdiqdən sonra calendar-a hazır olacaq</small></span></button>
              </div>
            </section>
          </div>
          {error ? <p className="slide-form-error">{error}</p> : null}
          <DialogFooter className="slide-editor-footer">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Ləğv et</Button>
            <Button type="submit" className={intent === "SUBMIT" ? "slide-primary-button" : ""} variant={intent === "DRAFT" ? "outline" : "default"} disabled={pending}>
              {intent === "SUBMIT" ? <Send /> : <CircleDashed />}{pending ? progress || "Saxlanır..." : intent === "SUBMIT" ? "Founder təsdiqinə göndər" : "Qaralama saxla"}
            </Button>
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
        setError(notifyCaughtError(caught, "Slide düzəlişə qaytarılmadı", "Əməliyyat uğursuz oldu"));
      }
    });
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="slide-revision-modal"><DialogHeader><DialogTitle>Düzəliş istə</DialogTitle><DialogDescription>Marketing komandasına konkret dəyişiklik qeydini göndərin.</DialogDescription></DialogHeader><form onSubmit={submit}><input type="hidden" name="id" value={item?.id ?? ""} /><Field label="Düzəliş qeydi"><textarea name="note" rows={5} minLength={3} maxLength={600} required placeholder="Nə dəyişməlidir?" /></Field>{error ? <p className="slide-form-error">{error}</p> : null}<DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>Ləğv et</Button><Button type="submit" disabled={pending}><RotateCcw /> {pending ? "Göndərilir..." : "Düzəlişə qaytar"}</Button></DialogFooter></form></DialogContent></Dialog>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="slide-form-field"><span>{label}</span>{children}</label>;
}

function FieldSelect({ name, label, defaultValue, options, emptyLabel }: { name: string; label: string; defaultValue: string; options: string[] | Array<{ value: string; label: string }>; emptyLabel?: string }) {
  return <label className="slide-form-field"><span>{label}</span><select name={name} defaultValue={defaultValue}>{emptyLabel ? <option value="">{emptyLabel}</option> : null}{options.map((option) => typeof option === "string" ? <option key={option} value={option}>{option}</option> : <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>;
}

function PlatformIcon({ platform }: { platform: string }) {
  if (platform === "Instagram") return <Camera aria-label="Instagram" />;
  if (platform === "YouTube" || platform === "TikTok") return <Video aria-label={platform} />;
  return <Megaphone aria-label={platform} />;
}

function calendarDays(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  const mondayOffset = (first.getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  const cellCount = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
  const start = new Date(first);
  start.setUTCDate(first.getUTCDate() - mondayOffset);
  return Array.from({ length: cellCount }, (_, index) => {
    const value = new Date(start);
    value.setUTCDate(start.getUTCDate() + index);
    return {
      key: `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`,
      day: value.getUTCDate(),
      inMonth: value.getUTCMonth() === monthNumber - 1,
    };
  });
}

function effectiveSchedule(item: MarketingContentItemRow, overrides: Record<string, string>) {
  return Object.hasOwn(overrides, item.id) ? overrides[item.id] : item.scheduledAt;
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

function currentMonthKey() {
  return todayDateKey().slice(0, 7);
}

function todayDateKey() {
  const date = new Date(Date.now() + 4 * 60 * 60 * 1000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function scheduledIso(date: string, time: string) {
  return new Date(`${date}T${time}:00+04:00`).toISOString();
}

function bakuDate(value: string) {
  return new Date(new Date(value).getTime() + 4 * 60 * 60 * 1000);
}

function dateKey(value: string) {
  const date = bakuDate(value);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function timeLabel(value: string) {
  if (!value) return "";
  const date = bakuDate(value);
  return `${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}`;
}

function dateTimeLabel(value: string) {
  const date = bakuDate(value);
  return `${date.getUTCDate()} ${monthNames[date.getUTCMonth()].toLocaleLowerCase("az")} ${date.getUTCFullYear()}, ${timeLabel(value)}`;
}

function initials(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  return `${parts[0]?.[0] ?? "M"}${parts[1]?.[0] ?? ""}`;
}

function formatRatio(format: string) {
  const ratios: Record<string, string> = { Story: "9:16", Reel: "9:16", Karusel: "4:5", Post: "1:1", Video: "16:9" };
  return ratios[format] ?? "1:1";
}

function safeBackground(value: string) {
  if (!/^https?:\/\//i.test(value)) return undefined;
  return { backgroundImage: `url("${value.replaceAll('"', "%22")}")` };
}

function isVideoMedia(mimeType: string | undefined, url: string) {
  return mimeType?.startsWith("video/") || /\.(?:mp4|webm|mov)(?:\?|$)/i.test(url);
}

async function uploadContentMedia(file: File): Promise<{ path: string; url: string }> {
  const formData = new FormData();
  formData.set("file", file);
  const response = await fetch("/api/marketing/content-media", { method: "POST", body: formData });
  const payload = await response.json().catch(() => ({})) as { path?: string; url?: string; error?: string };
  if (!response.ok || !payload.path || !payload.url) throw new Error(payload.error || "Media faylı yüklənmədi.");
  return { path: payload.path, url: payload.url };
}

async function deleteContentMedia(path: string) {
  await fetch("/api/marketing/content-media", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  }).catch(() => undefined);
}
