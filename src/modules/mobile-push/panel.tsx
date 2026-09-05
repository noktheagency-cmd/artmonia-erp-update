"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BellRing, Send, Smartphone, Users, CalendarClock, RefreshCw, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { unwrapActionResult } from "@/lib/action-result";
import { notifyCaughtError, notifySuccess } from "@/lib/app-notifications";
import { publishMobilePushAction, cancelMobilePushAction } from "./actions";
import { campaignSchema, type CampaignInput } from "./contract";
import type { PushPanelData } from "./service";

const destinationLabels = {
  notifications: "Bildirişlər", home: "Ana səhifə", lessons: "Dərslər",
  journey: "Journey", package: "Paketim", profile: "Profil", external: "Xarici link",
};
const categories = [
  ["announcement", "Elan"], ["lesson", "Dərs"], ["homework", "Tapşırıq"],
  ["package", "Paket"], ["achievement", "Nailiyyət"], ["reminder", "Xatırlatma"], ["custom", "Digər"],
];
function initialForm(): CampaignInput {
  return { requestKey: "", title: "", body: "", category: "announcement",
    destination: "notifications", linkUrl: null, imageUrl: null, priority: "normal",
    audience: "all", programId: null, studentIds: [], scheduledAt: null };
}
const dateLabel = (date: string) => new Intl.DateTimeFormat("az-AZ", {
  timeZone: "Asia/Baku", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
}).format(new Date(date));

export function MobilePushPanel({ data }: { data: PushPanelData }) {
  const [form, setForm] = useState(initialForm);
  const [search, setSearch] = useState("");
  const [schedule, setSchedule] = useState("");
  const [customType, setCustomType] = useState("");
  const [review, setReview] = useState<CampaignInput | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const update = <K extends keyof CampaignInput>(key: K, value: CampaignInput[K]) => {
    setForm(current => ({ ...current, [key]: value, requestKey: "" }));
    setReview(null); setError("");
  };
  const recipients = data.students.filter(student => form.audience === "all" ||
    (form.audience === "program" ? student.programIds.includes(form.programId ?? "") : form.studentIds.includes(student.id)));
  const filteredStudents = data.students.filter(student =>
    (student.name + " " + student.code).toLocaleLowerCase("az-AZ").includes(search.toLocaleLowerCase("az-AZ")));

  function prepare() {
    setError("");
    const planned = schedule ? new Date(schedule + ":00+04:00") : null;
    if (planned && !Number.isFinite(planned.getTime())) { setError("Tarix düzgün deyil."); return; }
    const parsed = campaignSchema.safeParse({
      ...form, requestKey: form.requestKey || crypto.randomUUID(),
      category: form.category === "custom" ? customType : form.category,
      scheduledAt: planned?.toISOString() ?? null,
    });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    if (!recipients.length) { setError("Göndəriş üçün ən azı bir uyğun alıcı seçin."); return; }
    setForm(current => ({ ...current, requestKey: parsed.data.requestKey }));
    setReview(parsed.data);
  }
  function send() {
    if (!review) return;
    startTransition(async () => {
      try {
        unwrapActionResult(await publishMobilePushAction(review));
        setReview(null); setForm(initialForm()); setSchedule(""); setCustomType("");
        notifySuccess("Bildiriş növbəyə əlavə edildi", "Göndəriş nəticəsini tarixçədən izləyə bilərsiniz.");
        router.refresh();
      } catch (caught) { setError(notifyCaughtError(caught, "Bildiriş saxlanmadı.")); }
    });
  }
  function cancel(id: string) {
    startTransition(async () => {
      try {
        unwrapActionResult(await cancelMobilePushAction(id));
        notifySuccess("Gözləyən göndərişlər dayandırıldı");
        router.refresh();
      } catch (caught) { notifyCaughtError(caught, "Göndəriş dayandırılmadı."); }
    });
  }

  return <section className="mobile-push-panel" aria-label="Mobil bildirişlər" aria-busy={pending}>
    <div className="mp-heading">
      <span className="mp-heading-icon"><BellRing /></span>
      <div><span className="mp-eyebrow">AKADEMİYA → MOBİL</span><h2>Mobil bildirişlər</h2>
        <p>Tələbələrinizə doğru mesajı, doğru vaxtda çatdırın.</p></div>
      <span className="mp-access"><Check /> Şəxsi idarəetmə</span>
    </div>
    <div className="mp-compose">
      <form onSubmit={event => { event.preventDefault(); prepare(); }} className="mp-form">
        <fieldset disabled={pending || !!review}>
          <div className="mp-section-label"><Users /> Kimə göndərilsin? <b>{recipients.length} alıcı</b></div>
          <div className="mp-audience" role="group" aria-label="Alıcı qrupu">
            {([["all","Bütün tələbələr"],["program","Proqram üzrə"],["students","Tələbə seç"]] as const).map(([value,label]) =>
              <button key={value} type="button" aria-pressed={form.audience === value} onClick={() => update("audience",value)}>{label}</button>)}
          </div>
          <small className="mp-hint">Yalnız aktiv mobil hesabı və aktiv proqramı olan tələbələr.</small>
          {form.audience === "program" && <label>Proqram
            <select value={form.programId ?? ""} onChange={event => update("programId",event.target.value || null)} required>
              <option value="">Proqram seçin</option>{data.programs.map(program => <option key={program.id} value={program.id}>{program.name}</option>)}
            </select>
          </label>}
          {form.audience === "students" && <div className="mp-students">
            <input aria-label="Tələbə axtar" placeholder="Ad və ya tələbə kodu ilə axtar" value={search} onChange={event => setSearch(event.target.value)} />
            <div className="mp-student-list">{filteredStudents.length ? filteredStudents.map(student =>
              <label key={student.id}><input type="checkbox" checked={form.studentIds.includes(student.id)}
                onChange={event => update("studentIds", event.target.checked ? [...form.studentIds,student.id] : form.studentIds.filter(id => id!==student.id))} />
                <span>{student.name}<small>{student.code}</small></span>
              </label>) : <p>Uyğun tələbə tapılmadı.</p>}</div>
          </div>}
          <div className="mp-row">
            <label>Bildiriş növü<select value={form.category} onChange={event => update("category",event.target.value)}>
              {categories.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label>Vurğulama<select value={form.priority} onChange={event => update("priority",event.target.value as "normal"|"high")}>
              <option value="normal">Normal</option><option value="high">Vacib</option>
            </select></label>
          </div>
          {form.category === "custom" && <label>Növün kodu<input value={customType} placeholder="Məsələn: workshop"
            pattern="[a-z][a-z0-9_.-]*" required maxLength={40} onChange={event => { setCustomType(event.target.value); update("requestKey", ""); }} /></label>}
          <label>Başlıq <span className="mp-counter">{form.title.length}/100</span>
            <input value={form.title} maxLength={100} required placeholder="Məsələn: Yeni yaradıcılıq workshop-u"
              onChange={event => update("title",event.target.value)} /></label>
          <label>Mesaj <span className="mp-counter">{form.body.length}/1000</span>
            <textarea value={form.body} rows={4} maxLength={1000} required placeholder="Tələbələrin görəcəyi mesajı yazın..."
              onChange={event => update("body",event.target.value)} /></label>
          <div className="mp-row">
            <label>Bildirişə toxunduqda<select value={form.destination} onChange={event => update("destination",event.target.value as CampaignInput["destination"])}>
              {Object.entries(destinationLabels).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
            </select></label>
            <label><span><CalendarClock /> Göndəriş vaxtı · Bakı</span>
              <input type="datetime-local" aria-label="Göndəriş vaxtı" value={schedule}
                onChange={event => { setSchedule(event.target.value); update("requestKey", ""); }} />
              <small>Boş saxlasanız, indi göndəriləcək.</small></label>
          </div>
          {form.destination === "external" && <label>Açılacaq link<input type="url" required placeholder="https://"
            value={form.linkUrl ?? ""} onChange={event => update("linkUrl",event.target.value || null)} /></label>}
          <details className="mp-extra"><summary>Şəkil əlavə et <small>İstəyə bağlı</small></summary>
            <label>Şəklin HTTPS linki<input type="url" placeholder="https://" value={form.imageUrl ?? ""}
              onChange={event => update("imageUrl",event.target.value || null)} /></label>
          </details>
        </fieldset>
        {error && <p className="mp-error" role="alert">{error}</p>}
        {review ? <div className="mp-review" role="status">
          <strong>{recipients.length} tələbəyə {schedule ? dateLabel(review.scheduledAt!) + " tarixində" : "indi"} göndəriləcək.</strong>
          <p>Telefon bildirişi mobil göndəriş xidməti tərəfindən icra olunur.</p>
          <div><Button type="button" variant="outline" disabled={pending} onClick={() => setReview(null)}>Redaktə et</Button>
            <Button type="button" disabled={pending} onClick={send}><Send />{pending ? "Saxlanılır..." : "Təsdiqlə və göndər"}</Button></div>
        </div> : <Button type="submit" disabled={pending || !recipients.length}><Send /> Göndərişi yoxla</Button>}
      </form>
      <aside className="mp-preview">
        <span className="mp-preview-label"><Smartphone /> ÖNCƏDƏN BAXIŞ</span>
        <div className="mp-phone">
          <div className="mp-phone-notch" /><span className="mp-phone-time">09:41</span><span className="mp-phone-date">Yaradıcılığa vaxt ayır</span>
          <div className="mp-notification"><div className="mp-app-line"><span>a.</span><b>ARTMONIA</b><small>indi</small></div>
            <strong>{form.title || "Başlıq burada görünəcək"}</strong><p>{form.body || "Mesajınızı yazdıqca bildirişin görünüşünü burada izləyin."}</p>
            {form.imageUrl && <span className="mp-image-label">Şəkilli bildiriş</span>}
          </div>
        </div>
        <p>Görünüş cihazdan asılı olaraq dəyişə bilər. Bildiriş tələbənin mobil tarixçəsində də saxlanılır.</p>
      </aside>
    </div>
    <div className="mp-history">
      <div className="mp-history-head"><div><h3>Göndəriş tarixçəsi</h3><p>Son 50 göndəriş və alıcılar üzrə nəticələr</p></div>
        <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => router.refresh()}><RefreshCw /> Yenilə</Button></div>
      {!data.history.length ? <div className="mp-empty"><BellRing /><strong>İlk mesajınızı göndərin</strong><p>Göndərişlər və nəticələri burada görünəcək.</p></div> :
        <div className="mp-history-list">{data.history.map(item => <article key={item.id}>
          <div className="mp-history-title"><strong>{item.title}</strong><time>{dateLabel(item.scheduledAt)}</time></div>
          <p>{item.body}</p><small>{item.author} · {item.category} · {item.total} alıcı</small>
          <div className="mp-counts">
            {!!item.pending && <span>{item.pending} növbədə</span>}
            {!!item.processing && <span>{item.processing} işlənir</span>}
            {!!item.accepted && <span data-tone="success">{item.accepted} provayder qəbul edib</span>}
            {!!item.delivered && <span data-tone="success">{item.delivered} çatdırılma təsdiqi</span>}
            {!!item.failed && <span data-tone="error">{item.failed} uğursuz</span>}
            {!!item.skipped && <span>{item.skipped} ötürülüb</span>}
            {!!item.cancelled && <span>{item.cancelled} dayandırılıb</span>}
            {!!item.pending && !item.cancelledAt && <Button type="button" variant="ghost" size="sm" disabled={pending}
              onClick={() => cancel(item.id)}><X /> Gözləyənləri dayandır</Button>}
          </div>
        </article>)}</div>}
      <small className="mp-hint">Provayderin qəbul etməsi tələbənin bildirişi oxuduğu demək deyil. İşlənən göndəriş geri çağırılmaya bilər.</small>
    </div>
  </section>;
}
