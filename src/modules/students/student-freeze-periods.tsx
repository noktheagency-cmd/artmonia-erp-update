"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Snowflake, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { unwrapActionResult } from "@/lib/action-result";
import { currentBakuDateValue } from "./payment-date-policy";
import {
  getStudentFreezePeriodsAction,
  previewStudentFreezePeriodAction,
  createStudentFreezePeriodAction,
} from "./freeze-period-actions";
import type {
  FreezePeriodHistory,
  FreezePreview,
} from "./freeze-period-service";

const money = (value: number) =>
  new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 2 }).format(value) +
  " AZN";
const date = (value: string) =>
  value.slice(0, 10).split("-").reverse().join(".");

export function StudentFreezePeriods({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [periods, setPeriods] = useState<FreezePeriodHistory[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [requestId, setRequestId] = useState("");
  const [preview, setPreview] = useState<FreezePreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [note, setNote] = useState("");
  const [canRefresh, setCanRefresh] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    setCanRefresh(false);
    try {
      const result = unwrapActionResult(
        await getStudentFreezePeriodsAction(studentId),
      );
      setPeriods(result.periods);
      setCanManage(result.canManage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tarixçə yüklənmədi");
      setCanRefresh(true);
    } finally {
      setLoading(false);
    }
  }
  function resetPreview() {
    setPreview(null);
    setConfirmed(false);
    setError("");
    setSuccess("");
  }
  async function submit(formData: FormData) {
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (!preview) {
        const result = unwrapActionResult(
          await previewStudentFreezePeriodAction(formData),
        );
        setPreview(result);
        setConfirmed(false);
      } else {
        formData.set("fingerprint", preview.fingerprint);
        formData.set("confirmed", confirmed ? "yes" : "no");
        unwrapActionResult(await createStudentFreezePeriodAction(formData));
        setPreview(null);
        setConfirmed(false);
        setStartDate("");
        setEndDate("");
        setNote("");
        setRequestId(crypto.randomUUID());
        setSuccess(
          "Dondurulma dövrü saxlanıldı. Təsdiqlənmiş maliyyə təsiri tətbiq olundu.",
        );
        await load();
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Əməliyyat alınmadı");
      setPreview(null);
      setConfirmed(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="student-detail-section freeze-section">
      <div>
        <div className="student-detail-section-title">
          <Snowflake />
          <span>Dondurulma dövrləri</span>
        </div>
        <p>Keçmiş fasilələr, bərpa tarixləri və təsdiqlənmiş maliyyə təsiri.</p>
      </div>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (busy) return;
          setOpen(value);
          if (value) {
            resetPreview();
            setRequestId(crypto.randomUUID());
            void load();
          }
        }}
      >
        <DialogTrigger asChild>
          <Button variant="outline">
            <Snowflake size={16} />
            Tarixçə və dövr əlavə et
          </Button>
        </DialogTrigger>
        <DialogContent className="freeze-dialog">
          <DialogHeader>
            <DialogTitle>Dondurulma tarixçəsi</DialogTitle>
            <DialogDescription>
              Keçmiş dövr cari tədris statusunu və slotları dəyişmir. Bərpa
              tarixi dərsə qayıdılan ilk gündür.
            </DialogDescription>
          </DialogHeader>
          <div className="freeze-scroll">
            {loading ? (
              <p role="status">Tarixçə yüklənir…</p>
            ) : (
              <div className="freeze-history">
                {periods.length ? (
                  periods.map((p) => (
                    <article key={p.id}>
                      <strong>
                        {date(p.startDate)} —{" "}
                        {p.endDate ? date(p.endDate) : "Davam edir"}
                      </strong>
                      <p>{p.note}</p>
                      <small>
                        {p.createdBy} · {date(p.createdAt)}
                      </small>
                      <small>
                        BK-10: yer saxlanılır, aylıq haqq və ödəniş günü davam
                        edir (faktura ləğv edilmir).
                      </small>
                      {Number(p.voidAmount) > 0 ? (
                        <small>
                          Köhnə qeyd — ləğv edilmiş balans:{" "}
                          {money(Number(p.voidAmount))}
                          {p.reviewCount
                            ? ` · baxış: ${p.reviewCount} faktura`
                            : ""}
                        </small>
                      ) : null}
                    </article>
                  ))
                ) : (
                  <p>
                    Hələ ayrıca dondurulma dövrü əlavə edilməyib. Köhnə status
                    qeydləri avtomatik dövrə çevrilmir.
                  </p>
                )}
              </div>
            )}
            {canRefresh ? (
              <Button variant="outline" onClick={() => void load()}>
                Yenidən yüklə
              </Button>
            ) : null}
            {canManage && !loading && !canRefresh ? (
              <form action={submit} className="freeze-form">
                <input type="hidden" name="studentId" value={studentId} />
                <input type="hidden" name="requestId" value={requestId} />
                <h3>Yeni dondurulma dövrü</h3>
                <fieldset disabled={busy} className="freeze-fields">
                  <div className="field-grid">
                    <label className="form-field">
                      <span>Başlama tarixi *</span>
                      <DatePicker
                        name="startDate"
                        aria-label="Dondurulmanın başlama tarixi"
                        required
                        maxValue={currentBakuDateValue()}
                        value={startDate}
                        onValueChange={(value) => {
                          setStartDate(value);
                          resetPreview();
                        }}
                      />
                    </label>
                    <label className="form-field">
                      <span>Faktiki bərpa tarixi</span>
                      <DatePicker
                        name="endDate"
                        aria-label="Faktiki bərpa tarixi"
                        maxValue={currentBakuDateValue()}
                        value={endDate}
                        onValueChange={(value) => {
                          setEndDate(value);
                          resetPreview();
                        }}
                      />
                    </label>
                  </div>
                  <p className="freeze-hint">
                    Hələ qayıtmayıbsa bərpa tarixini boş saxlayın. Bu halda
                    tələbə FROZEN olur, yer/slot saxlanılır, aylıq haqq və
                    ödəniş günü davam edir (BK-10). Dayandırma (STOPPED) yerı
                    azad edir — o ayrıca əməliyyatdır.
                  </p>
                  <label className="form-field">
                    <span>Səbəb / qeyd *</span>
                    <textarea
                      name="note"
                      required
                      minLength={3}
                      maxLength={1000}
                      rows={3}
                      value={note}
                      onChange={(e) => {
                        setNote(e.target.value);
                        resetPreview();
                      }}
                      placeholder="Məsələn: Avqustda şəhər xaricində olub, sentyabrda dərslərə qayıdıb."
                    />
                  </label>
                </fieldset>
                {preview ? (
                  <div className="freeze-preview" aria-live="polite">
                    <div className="freeze-impact">
                      <ShieldCheck />
                      <div>
                        <strong>
                          Aylıq haqq davam edir (BK-10)
                        </strong>
                        <p>
                          {preview.freezesNow
                            ? "Status FROZEN olacaq; yer/slot saxlanılır, ödəniş günü dəyişmir."
                            : "Keçmiş dövr qeydi — cari status və slotlar dəyişməyəcək."}{" "}
                          Fakturalar ləğv edilmir; borc yaranarsa ödəniş gözlənilir.
                        </p>
                      </div>
                    </div>
                    <div className="freeze-table-wrap">
                      <table>
                        <thead>
                          <tr>
                            <th>Billing dövrü</th>
                            <th>Faktura / qalıq</th>
                            <th>Nəticə</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.invoices.map((i) => (
                            <tr key={i.id}>
                              <td>
                                {date(i.cycleStart)} — {date(i.cycleEnd)}
                                <small>Bərpa günü daxil deyil</small>
                              </td>
                              <td>
                                {money(i.amount)} / {money(i.balance)}
                              </td>
                              <td>
                                <strong>Haqq davam edir</strong>
                                <small>{i.reason}</small>
                              </td>
                            </tr>
                          ))}
                          {!preview.invoices.length ? (
                            <tr>
                              <td colSpan={3}>
                                Bu dövrə düşən açıq və ya ödənilmiş faktura
                                yoxdur.
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                    <label className="freeze-confirm">
                      <input
                        type="checkbox"
                        checked={confirmed}
                        disabled={busy}
                        onChange={(e) => setConfirmed(e.target.checked)}
                      />
                      <span>
                        Tarixləri və göstərilən maliyyə təsirini yoxladım,
                        təsdiqləyirəm.
                      </span>
                    </label>
                  </div>
                ) : (
                  <p className="freeze-hint">
                    Dondurma yalnız yeri saxlayır. Aylıq haqq və ödəniş günü
                    davam edir; fakturalar avtomatik ləğv edilmir.
                  </p>
                )}
                <div className="freeze-buttons">
                  {preview ? (
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={resetPreview}
                    >
                      Geri / yenidən hesabla
                    </Button>
                  ) : null}
                  <Button
                    type="submit"
                    disabled={busy || (!!preview && !confirmed)}
                  >
                    {busy
                      ? "Yoxlanılır…"
                      : preview
                        ? "Təsdiqlə və saxla"
                        : "Maliyyə təsirinə bax"}
                  </Button>
                </div>
              </form>
            ) : null}
            {error ? (
              <p className="freeze-error" role="alert">
                {error}
              </p>
            ) : null}
            {success ? (
              <p className="freeze-success" role="status">
                {success}
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
