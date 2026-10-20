"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MonthPicker } from "@/components/ui/month-picker";
import { FormSelect } from "@/components/ui/select";
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
  getBillingDeadlineHistoryAction,
  previewBillingDeadlineAction,
  saveBillingDeadlineAction,
} from "./billing-deadline-actions";
import type { DeadlinePreview } from "./billing-deadline-service";
import styles from "./billing-deadline.module.css";

type HistoryRow = {
  id: string;
  month: string;
  mode: string;
  day: number;
  reason: string;
  creator: string;
};
const date = (value: string) =>
  value.slice(0, 10).split("-").reverse().join(".");
export function StudentBillingDeadline({ studentId }: { studentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [error, setError] = useState(""),
    [success, setSuccess] = useState("");
  const [requestId, setRequestId] = useState("");
  const [preview, setPreview] = useState<DeadlinePreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [mode, setMode] = useState("FROM_MONTH");
  const [month, setMonth] = useState(currentBakuDateValue().slice(0, 7));
  const [day, setDay] = useState("");
  const [reason, setReason] = useState("");
  async function load() {
    setLoading(true);
    try {
      setHistory(
        unwrapActionResult(await getBillingDeadlineHistoryAction(studentId)),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Tarixçə yüklənmədi");
    } finally {
      setLoading(false);
    }
  }
  function reset() {
    setPreview(null);
    setConfirmed(false);
    setError("");
    setSuccess("");
  }
  async function submit(data: FormData) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (!preview) {
        setPreview(
          unwrapActionResult(await previewBillingDeadlineAction(data)),
        );
        setConfirmed(false);
      } else {
        unwrapActionResult(await saveBillingDeadlineAction(data));
        setSuccess(
          "Ödəniş günü yeniləndi. Məbləğlər və ilk dərs tarixi dəyişmədi.",
        );
        setPreview(null);
        setConfirmed(false);
        setRequestId(crypto.randomUUID());
        await load();
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Dəyişiklik saxlanılmadı");
      setPreview(null);
      setConfirmed(false);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (busy) return;
        setOpen(value);
        if (value) {
          reset();
          setRequestId(crypto.randomUUID());
          void load();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <CalendarClock />
          Ödəniş gününü dəyiş
        </Button>
      </DialogTrigger>
      <DialogContent className={styles.dialog}>
        <DialogHeader>
          <DialogTitle>Ödəniş gününü dəyiş</DialogTitle>
          <DialogDescription>
            Yalnız Vaqif və İsmət. Dərs dövrü, məbləğ və faktiki ödəniş tarixi
            dəyişmir.
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className={styles.form}>
          <input type="hidden" name="studentId" value={studentId} />
          <input type="hidden" name="requestId" value={requestId} />
          <fieldset disabled={busy} className={styles.fields} onChange={reset}>
            <label className="form-field">
              <span>Tətbiq qaydası</span>
              <FormSelect
                name="mode"
                value={mode}
                onValueChange={(value) => {
                  setMode(value);
                  reset();
                }}
                options={[
                  {
                    value: "FROM_MONTH",
                    label: "Seçilən aydan etibarən — ümumi",
                  },
                  { value: "ONLY_MONTH", label: "Yalnız seçilən ay" },
                ]}
              />
            </label>
            <div className={styles.grid}>
              <label className="form-field">
                <span>Qüvvəyə minən ay</span>
                <MonthPicker
                  name="month"
                  value={month}
                  onValueChange={setMonth}
                  allowClear={false}
                  required
                />
              </label>
              <label className="form-field">
                <span>Ayın neçəsi? (1–31)</span>
                <Input
                  type="number"
                  name="day"
                  value={day}
                  onChange={(event) => setDay(event.target.value)}
                  min={1}
                  max={31}
                  step={1}
                  required
                  placeholder="Məsələn: 15"
                />
              </label>
            </div>
            <label className="form-field">
              <span>Səbəb — məcburidir</span>
              <Input
                name="reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={3}
                maxLength={1000}
                required
                placeholder="Məsələn: tələbə ilə razılaşdırılmış yeni ödəniş günü"
              />
            </label>
          </fieldset>
          <p className={styles.note}>
            Keçmiş ayı da seçə bilərsiniz. Ümumi dəyişiklik seçilən aydan
            sonrakı əvvəlki tarix qaydalarını əvəz edir; yalnız-ay seçimi digər
            aylara təsir etmir. Qısa aylarda son gün istifadə edilir.
          </p>
          {error ? (
            <p role="alert" className={styles.error}>
              {error}
            </p>
          ) : null}
          {success ? <p role="status">{success}</p> : null}
          {preview ? (
            <section className={styles.preview}>
              <strong>
                Yeni tarixlər: {preview.exampleDates.map(date).join(" · ")}
              </strong>
              <p>
                {preview.invoices.length} mövcud faktura yoxlanıldı. Faktura
                yoxdursa, yeni qayda gələcək yaradılmada işləyəcək.
              </p>
              {preview.invoices.length ? (
                <div className={styles.table}>
                  <table>
                    <thead>
                      <tr>
                        <th>Aid olduğu ay</th>
                        <th>Köhnə tarix</th>
                        <th>Yeni tarix</th>
                        <th>Məbləğ</th>
                        <th>Qalıq</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.invoices.map((row) => (
                        <tr key={row.id}>
                          <td>{row.month.slice(0, 7)}</td>
                          <td>{date(row.oldDate)}</td>
                          <td>{date(row.newDate)}</td>
                          <td>{row.amount} AZN</td>
                          <td>{row.balance} AZN</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              <label className={styles.confirm}>
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={busy}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  Tarixlərin və borcun gecikmə vəziyyətinin dəyişməsini
                  təsdiqləyirəm.
                </span>
              </label>
              <input
                type="hidden"
                name="fingerprint"
                value={preview.fingerprint}
              />
              <input
                type="hidden"
                name="confirmed"
                value={confirmed ? "yes" : "no"}
              />
            </section>
          ) : null}
          <div className={styles.buttons}>
            {preview ? (
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={reset}
              >
                Önizləməni yenilə
              </Button>
            ) : null}
            <Button
              type="submit"
              disabled={busy || loading || Boolean(preview && !confirmed)}
            >
              {busy
                ? "Gözləyin…"
                : preview
                  ? "Təsdiqlə və saxla"
                  : "Dəyişikliyə bax"}
            </Button>
          </div>
        </form>
        <details className={styles.history}>
          <summary>Dəyişiklik tarixçəsi ({history.length})</summary>
          {loading ? (
            <p>Yüklənir…</p>
          ) : history.length ? (
            history.map((row) => (
              <article key={row.id}>
                <strong>
                  {row.month} · ayın {row.day}-i ·{" "}
                  {row.mode === "ONLY_MONTH"
                    ? "yalnız bu ay"
                    : "bu aydan etibarən"}
                </strong>
                <p>{row.reason}</p>
                <small>{row.creator}</small>
              </article>
            ))
          ) : (
            <p>Tarix dəyişikliyi yoxdur.</p>
          )}
        </details>
      </DialogContent>
    </Dialog>
  );
}
