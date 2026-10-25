"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, PhoneMissed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/ui/select";
import { TimePicker } from "@/components/ui/time-picker";
import { listAppointments, saveAppointment } from "./appointment-actions";
import { appointmentKindLabels, appointmentOutcomeLabels } from "./appointment-policy";
import { dailyReportWindow } from "@/modules/dashboard/daily-report-policy";
import type { AppointmentHistoryRow as Appointment } from "./appointment-history";

const dateTime = (value: string) => {
  const local = new Date(new Date(value).getTime() + 4 * 3600000).toISOString();
  return { date: local.slice(0, 10), time: local.slice(11, 16) };
};

function bakuNow() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${read("year")}-${read("month")}-${read("day")}`, time: `${read("hour")}:${read("minute")}` };
}

function meetingTitle(outcome: string) {
  if (outcome === "SCHEDULED") return "Planlaşdırılıb";
  if (outcome === "ATTENDED") return "Görüş baş tutdu";
  if (outcome === "NO_SHOW") return "Görüş baş tutmadı";
  if (outcome === "RESCHEDULED") return "Plan yeniləndi";
  if (outcome === "CANCELLED") return "Ləğv edildi";
  return appointmentOutcomeLabels[outcome as keyof typeof appointmentOutcomeLabels] ?? outcome;
}

function meetingTone(outcome: string) {
  if (outcome === "ATTENDED") return "success";
  if (outcome === "NO_SHOW" || outcome === "CANCELLED") return "warning";
  if (outcome === "SCHEDULED") return "info";
  return "neutral";
}

export function LeadAppointments({
  leadId,
  embedded = false,
  active = true,
  markedComplete = false,
  onScheduled,
  onActionSaved,
}: {
  leadId: string;
  embedded?: boolean;
  active?: boolean;
  markedComplete?: boolean;
  onScheduled?: () => void;
  onActionSaved?: (outcome: "scheduled" | "attended" | "missed") => void;
}) {
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
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [meetingMode, setMeetingMode] = useState<"missed" | "attended" | null>(null);
  const [nextDate, setNextDate] = useState(() => dailyReportWindow().date);
  const [nextTime, setNextTime] = useState("12:00");
  const shown = embedded || expanded;
  const scheduled = rows.find((row) => row.outcome === "SCHEDULED" && row.source === "APPOINTMENT") ?? null;
  const reminderPlan = rows.find((row) => row.source === "LEAD_PLAN") ?? null;
  const attended = rows.some((row) => row.outcome === "ATTENDED");
  // const meetingComplete = markedComplete || (attended && !scheduled);
  const meetingComplete = !scheduled && !reminderPlan && (markedComplete || attended);

  useEffect(() => {
    if (!embedded || !active) return;
    let ignore = false;

    async function run() {
      setBusy(true);
      setLoaded(false);
      setLoadError(false);
      setMessage("");
      try {
        const result = await listAppointments(leadId);
        if (ignore) return;
        if (result.ok) {
          setRows(result.data.rows);
          setTeachers(result.data.teachers);
          const plan = result.data.rows.find((row) => row.source === "LEAD_PLAN");
          if (plan) {
            const planned = dateTime(plan.plannedAt);
            setDate(planned.date);
            setTime(planned.time);
          }
        } else {
          setMessage(result.message);
          setLoadError(true);
        }
      } catch {
        if (!ignore) {
          setMessage("Görüşlər yüklənmədi.");
          setLoadError(true);
        }
      } finally {
        if (!ignore) {
          setBusy(false);
          setLoaded(true);
        }
      }
    }

    void run();
    return () => {
      ignore = true;
    };
  }, [embedded, active, leadId, loadAttempt]);

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
      if (form.get("outcome") === "SCHEDULED" && !form.get("appointmentId")) onScheduled?.();
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

  async function submitAppointment(requestKey: string, fields: Record<string, string>) {
    const form = new FormData();
    form.set("leadId", leadId);
    form.set("idempotencyKey", requestKey);
    for (const [name, value] of Object.entries(fields)) {
      if (value) form.set(name, value);
    }
    return saveAppointment(form);
  }

  async function planMeeting() {
    if (busy || !date || !time) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await submitAppointment(key, {
        date,
        time,
        kind: "MEETING",
        outcome: "SCHEDULED",
      });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setKey(crypto.randomUUID());
      setMeetingMode(null);
      setMessage("Görüş planlaşdırıldı.");
      onActionSaved?.("scheduled");
      await load();
      router.refresh();
    } catch {
      setMessage("Görüş saxlanılmadı.");
    } finally {
      setBusy(false);
    }
  }

  async function completeMeeting(row: Appointment) {
    if (busy || row.source !== "APPOINTMENT") return;
    const planned = dateTime(row.plannedAt);
    const now = bakuNow();
    setBusy(true);
    setMessage("");
    try {
      const result = await submitAppointment(key, {
        appointmentId: row.id,
        date: planned.date,
        time: planned.time,
        kind: row.kind,
        outcome: "ATTENDED",
        teacherId: row.teacherId ?? "",
        occurredDate: now.date,
        occurredTime: now.time,
      });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setKey(crypto.randomUUID());
      setMeetingMode(null);
      setMessage("Görüş baş tutdu kimi təsdiqləndi.");
      onActionSaved?.("attended");
      await load();
      router.refresh();
    } catch {
      setMessage("Görüş saxlanılmadı.");
    } finally {
      setBusy(false);
    }
  }

  async function missMeeting(row: Appointment) {
    if (busy || !nextDate || !nextTime || row.source !== "APPOINTMENT") return;
    const planned = dateTime(row.plannedAt);
    const now = bakuNow();
    setBusy(true);
    setMessage("");
    try {
      const missed = await submitAppointment(key, {
        appointmentId: row.id,
        date: planned.date,
        time: planned.time,
        kind: row.kind,
        outcome: "NO_SHOW",
        teacherId: row.teacherId ?? "",
        occurredDate: now.date,
        occurredTime: now.time,
      });
      if (!missed.ok) {
        setMessage(missed.message);
        return;
      }
      const nextKey = crypto.randomUUID();
      const plannedNext = await submitAppointment(nextKey, {
        date: nextDate,
        time: nextTime,
        kind: "MEETING",
        outcome: "SCHEDULED",
      });
      setKey(crypto.randomUUID());
      onActionSaved?.("missed");
      if (!plannedNext.ok) {
        setMessage(plannedNext.message);
        await load();
        return;
      }
      setMeetingMode(null);
      setMessage("Görüş baş tutmadı. Növbəti plan yazıldı.");
      await load();
      router.refresh();
    } catch {
      setMessage("Görüş saxlanılmadı.");
    } finally {
      setBusy(false);
    }
  }

  if (embedded && !loaded) {
    return (
      <section className="crm-action-card is-embedded">
        <p className="crm-panel-loading">Yüklənir…</p>
      </section>
    );
  }

  if (embedded && loadError) {
    return (
      <section className="crm-action-card is-embedded">
        <p role="alert">{message}</p>
        <Button type="button" variant="outline" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Yenidən cəhd et</Button>
      </section>
    );
  }

  if (embedded) {
    const activePlan = scheduled ?? reminderPlan;
    const activeWhen = activePlan ? dateTime(activePlan.plannedAt) : null;
    return (
      <section className="crm-action-card is-embedded">
        <div className="crm-action-card-body">
          <div className="crm-contact-plan">
            <div className={meetingComplete ? "crm-contact-active is-done" : "crm-contact-active"}>
              <div className="crm-contact-active-meta">
                <div className="crm-contact-active-copy">
                  <strong>
                    {meetingComplete ? "Görüş baş tutdu" : activePlan ? "Görüş planlaşdırılıb" : "Plan yoxdur"}
                  </strong>
                  {activeWhen ? (
                    <small>{`${activeWhen.date.split("-").reverse().join(".")} · ${activeWhen.time}`}</small>
                  ) : null}
                  {reminderPlan ? <small>Müraciətdə saxlanmış görüş xatırlatması</small> : null}
                </div>
              </div>
              {scheduled && !meetingComplete ? (
                <div className="crm-contact-choices">
                  <button
                    type="button"
                    className="crm-choice is-danger"
                    aria-pressed={meetingMode === "missed"}
                    disabled={busy}
                    onClick={() => setMeetingMode((current) => current === "missed" ? null : "missed")}
                  >
                    <PhoneMissed aria-hidden="true" />
                    Baş tutmadı
                  </button>
                  <button
                    type="button"
                    className="crm-choice is-success"
                    disabled={busy}
                    onClick={() => {
                      if (!scheduled) return;
                      setMeetingMode("attended");
                      void completeMeeting(scheduled);
                    }}
                  >
                    <CheckCircle2 aria-hidden="true" />
                    Baş tutdu
                  </button>
                </div>
              ) : null}
            </div>

            {!scheduled && !meetingComplete ? (
              <div className="crm-dialog-fields">
                <label className="form-field">
                  <span>Plan tarixi</span>
                  <DatePicker name="planDate" aria-label="Görüş plan tarixi" value={date} onValueChange={setDate} required />
                </label>
                <label className="form-field">
                  <span>Plan saatı</span>
                  <TimePicker name="planTime" aria-label="Görüş plan saatı" value={time} onValueChange={setTime} required />
                </label>
              </div>
            ) : null}

            {meetingMode === "missed" && scheduled ? (
              <div className="crm-dialog-fields">
                <label className="form-field">
                  <span>Növbəti tarix</span>
                  <DatePicker name="nextDate" aria-label="Növbəti görüş tarixi" value={nextDate} onValueChange={setNextDate} required />
                </label>
                <label className="form-field">
                  <span>Növbəti saat</span>
                  <TimePicker name="nextTime" aria-label="Növbəti görüş saatı" value={nextTime} onValueChange={setNextTime} required />
                </label>
              </div>
            ) : null}

            {meetingMode === "missed" && scheduled ? (
              <Button
                type="button"
                disabled={busy || !nextDate || !nextTime}
                onClick={() => missMeeting(scheduled)}
              >
                {busy ? "Saxlanılır…" : "Növbəti planı yaz"}
              </Button>
            ) : null}

            {!scheduled && !meetingComplete ? (
              <Button type="button" disabled={busy || !date || !time} onClick={planMeeting}>
                {busy ? "Saxlanılır…" : "Görüşü planlaşdır"}
              </Button>
            ) : null}

            {message ? <p className="crm-contact-confirm" role="status">{message}</p> : null}
          </div>

          <div className="crm-contact-history">
            <div className="crm-contact-history-head">
              <h4>Görüş tarixçəsi</h4>
              {rows.length > 0 ? <span>{rows.length} qeyd</span> : null}
            </div>
            {rows.length === 0 && !busy ? <p className="crm-contact-empty">Hələ görüş planı yoxdur.</p> : null}
            {rows.length > 0 ? (
              <ul className="crm-contact-log">
                {rows.map((row) => {
                  const planned = dateTime(row.plannedAt);
                  return (
                    <li key={row.id} className={`crm-contact-log-item is-${meetingTone(row.outcome)}`}>
                      <span className="crm-contact-log-icon" aria-hidden="true">
                        {meetingTone(row.outcome) === "warning" ? <PhoneMissed /> : <CheckCircle2 />}
                      </span>
                      <div className="crm-contact-log-main">
                        <div className="crm-contact-log-top">
                          <strong>{meetingTitle(row.outcome)}</strong>
                          <em>{row.source === "LEAD_PLAN" ? "Müraciətin görüş planı" : appointmentKindLabels[row.kind as keyof typeof appointmentKindLabels] ?? "Görüş"}</em>
                        </div>
                      </div>
                      <time dateTime={row.plannedAt}>{planned.date.split("-").reverse().join(".")} · {planned.time}</time>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="crm-action-card">
      {embedded ? null : (
        <header>
          <div>
            <h3>Görüş</h3>
            <p>Konsultasiya və sınaq görüşlərini planlayın.</p>
          </div>
          <Button type="button" variant="secondary" onClick={toggle} aria-expanded={expanded}>
            {expanded ? "Bağla" : "Görüş"}
          </Button>
        </header>
      )}
      {shown ? (
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
              Son 30 görüş və müraciətin cari görüş planı. Təxirə salınmış görüşün əvvəlki tarixi saxlanılır.
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
                      disabled={busy || row.outcome !== "SCHEDULED" || row.source !== "APPOINTMENT"}
                      className="crm-appointment-log-item"
                      onClick={() => {
                        if (row.source !== "APPOINTMENT") return;
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
