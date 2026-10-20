"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import { listAppointments, saveAppointment } from "./appointment-actions";
import { appointmentKindLabels, appointmentOutcomeLabels } from "./appointment-policy";
import { dailyReportWindow } from "@/modules/dashboard/daily-report-policy";

type Appointment = {
  id: string;
  plannedAt: string;
  occurredAt: string | null;
  kind: string;
  outcome: string;
  teacherId: string | null;
  isLegacy: boolean;
  previousId: string | null;
};

const dateTime = (value: string) => {
  const local = new Date(new Date(value).getTime() + 4 * 3600000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
};

export function LeadAppointments({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<Appointment[]>([]);
  const [teachers, setTeachers] = useState<{ id: string; fullName: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [id, setId] = useState("");
  const [date, setDate] = useState(() => dailyReportWindow().date);
  const [time, setTime] = useState("12:00");
  const [kind, setKind] = useState("MEETING");
  const [outcome, setOutcome] = useState("SCHEDULED");
  const [teacher, setTeacher] = useState("");
  const [actualDate, setActualDate] = useState(() => dailyReportWindow().date);
  const [actualTime, setActualTime] = useState("12:00");

  async function load() {
    const result = await listAppointments(leadId);
    if (result.ok) {
      setRows(result.data.rows);
      setTeachers(result.data.teachers);
    } else {
      setMessage(result.message);
    }
  }

  async function toggle() {
    setExpanded(!expanded);
    if (!expanded) {
      setBusy(true);
      try {
        await load();
      } catch {
        setMessage("Görüşlər yüklənmədi.");
      } finally {
        setBusy(false);
      }
    }
  }

  function fresh() {
    setId("");
    setKey(crypto.randomUUID());
    setOutcome("SCHEDULED");
    setKind("MEETING");
  }

  async function save(form: FormData) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await saveAppointment(form);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      fresh();
      setMessage("Görüş saxlanıldı.");
      await load();
      router.refresh();
    } catch {
      setMessage("Görüş saxlanılmadı.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="crm-action-card">
      <header>
        <div>
          <h3>Görüş</h3>
          <p>Konsultasiya və sınaq görüşlərini planlayın.</p>
        </div>
        <Button type="button" variant="secondary" onClick={toggle} aria-expanded={expanded}>
          {expanded ? "Bağla" : "Görüş aç"}
        </Button>
      </header>
      {expanded ? (
        <div className="crm-action-card-body">
          <p className="crm-dialog-hint">
            Sınaq yalnız müəllim təyin ediləndə seçilir.
          </p>
          <Button type="button" variant="outline" onClick={fresh} disabled={busy}>
            Yeni görüş
          </Button>
          <form action={save} className="crm-dialog-fields">
            <input name="leadId" type="hidden" value={leadId} />
            <input name="appointmentId" type="hidden" value={id} />
            <input name="idempotencyKey" type="hidden" value={key} />
            <label className="form-field">
              <span>{outcome === "RESCHEDULED" ? "Yeni plan tarixi" : "Plan tarixi"}</span>
              <DatePicker
                required
                name="date"
                aria-label="Görüş plan tarixi"
                value={date}
                onValueChange={setDate}
              />
            </label>
            <label className="form-field">
              <span>Plan saatı</span>
              <TimePicker
                name="time"
                aria-label="Görüş plan saatı"
                value={time}
                onValueChange={setTime}
                required
              />
            </label>
            <label className="form-field">
              <span>Görüş tipi</span>
              <FormSelect
                name="kind"
                value={kind}
                onValueChange={setKind}
                options={Object.entries(appointmentKindLabels).map(([value, label]) => ({
                  value,
                  label,
                }))}
              />
            </label>
            <label className="form-field">
              <span>Nəticə</span>
              <FormSelect
                name="outcome"
                value={outcome}
                onValueChange={setOutcome}
                options={Object.entries(appointmentOutcomeLabels)
                  .filter(([value]) => id || value === "SCHEDULED")
                  .map(([value, label]) => ({ value, label }))}
              />
            </label>
            <label className="form-field">
              <span>Müəllim</span>
              <FormSelect
                name="teacherId"
                value={teacher}
                onValueChange={setTeacher}
                emptyLabel="Seçilməyib"
                options={teachers.map((item) => ({ value: item.id, label: item.fullName }))}
                required={outcome === "ATTENDED" && kind === "TRIAL"}
              />
            </label>
            {outcome === "ATTENDED" || outcome === "NO_SHOW" ? (
              <>
                <label className="form-field">
                  <span>Faktiki tarix</span>
                  <DatePicker
                    name="occurredDate"
                    aria-label="Faktiki görüş tarixi"
                    value={actualDate}
                    onValueChange={setActualDate}
                    required
                  />
                </label>
                <label className="form-field">
                  <span>Faktiki saat</span>
                  <TimePicker
                    name="occurredTime"
                    aria-label="Faktiki görüş saatı"
                    value={actualTime}
                    onValueChange={setActualTime}
                    required
                  />
                </label>
              </>
            ) : null}
            <label className="form-field">
              <span>Səbəb / qeyd</span>
              <Input
                name="reason"
                maxLength={500}
                required={outcome === "CANCELLED" || outcome === "RESCHEDULED"}
              />
            </label>
            <Button type="submit" disabled={busy}>
              {busy ? "Saxlanılır…" : "Yadda saxla"}
            </Button>
          </form>
          {message ? <p role="status">{message}</p> : null}
          <div className="crm-contact-history crm-appointment-history">
            <div className="crm-contact-history-head">
              <h4>Görüş tarixçəsi</h4>
              {rows.length > 0 ? <span>{rows.length} qeyd</span> : null}
            </div>
            <p className="crm-dialog-hint">
              Son 30 görüş. Təxirə salınmış görüşün əvvəlki tarixi saxlanılır.
            </p>
            {rows.length === 0 && !busy ? (
              <p className="crm-contact-empty">Hələ görüş qeydi yoxdur.</p>
            ) : null}
            {rows.length > 0 ? (
              <div className="crm-appointment-log">
                {rows.map((row) => {
                  const planned = dateTime(row.plannedAt);
                  return (
                    <Button
                      key={row.id}
                      type="button"
                      variant="secondary"
                      disabled={busy || row.outcome !== "SCHEDULED"}
                      className="crm-appointment-log-item"
                      onClick={() => {
                        const plannedAt = dateTime(row.plannedAt);
                        setId(row.id);
                        setDate(plannedAt.date);
                        setTime(plannedAt.time);
                        setKind(row.kind);
                        setOutcome(row.outcome);
                        setTeacher(row.teacherId ?? "");
                        setKey(crypto.randomUUID());
                        const actual = dateTime(row.occurredAt ?? new Date().toISOString());
                        setActualDate(actual.date);
                        setActualTime(actual.time);
                      }}
                    >
                      {planned.date} {planned.time} ·{" "}
                      {appointmentKindLabels[row.kind as keyof typeof appointmentKindLabels] ??
                        row.kind}{" "}
                      ·{" "}
                      {appointmentOutcomeLabels[
                        row.outcome as keyof typeof appointmentOutcomeLabels
                      ]}
                      {row.previousId ? " · yeni tarix" : ""}
                      {row.isLegacy ? " · köhnə qeyd" : ""}
                    </Button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
