"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Field, FieldLabel } from "@/components/ui/field";
import { FormSelect } from "@/components/ui/select";
import { listAppointments, saveAppointment } from "./appointment-actions";
import { appointmentOutcomeLabels } from "./appointment-policy";
import { dailyReportWindow } from "@/modules/dashboard/daily-report-policy";

type Appointment = { id: string; date: string; kind: "TRIAL" | "CONSULTATION"; outcome: keyof typeof appointmentOutcomeLabels };

export function LeadAppointments({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<Appointment[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [date, setDate] = useState(() => dailyReportWindow().date);
  const [kind, setKind] = useState<Appointment["kind"]>("CONSULTATION");
  const [outcome, setOutcome] = useState<Appointment["outcome"]>("SCHEDULED");
  async function load() {
    const result = await listAppointments(leadId);
    if (result.ok) setRows(result.data); else setMessage(result.message);
  }
  async function toggle() {
    setExpanded(!expanded);
    if (!expanded) { setBusy(true); try { await load(); } catch { setMessage("Görüşlər yüklənmədi. Yenidən açaraq cəhd edin."); } finally { setBusy(false); } }
  }
  async function save(form: FormData) {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const result = await saveAppointment(form);
      if (!result.ok) { setMessage(result.message); return; }
      setMessage("Görüş yadda saxlanıldı.");
      await load(); router.refresh();
    } catch { setMessage("Görüş yadda saxlanılmadı. Yenidən cəhd edin."); }
    finally { setBusy(false); }
  }
  return <section className="crm-dialog-section">
    <Button type="button" variant="secondary" onClick={toggle} aria-expanded={expanded}>Konsultasiya / sınaq nəticələri</Button>
    {expanded ? <div style={{ maxHeight: 280, overflowY: "auto", paddingTop: 12 }}>
      <form action={save} className="crm-dialog-fields">
        <input type="hidden" name="leadId" value={leadId} />
        <Field><FieldLabel>Görüş tarixi</FieldLabel><DatePicker required aria-label="Görüş tarixi" name="date" value={date} onValueChange={setDate} /></Field>
        <Field><FieldLabel>Görüş növü</FieldLabel><FormSelect aria-label="Görüş növü" name="kind" value={kind} onValueChange={(value) => setKind(value as Appointment["kind"])} options={[{ value: "CONSULTATION", label: "Konsultasiya" }, { value: "TRIAL", label: "Sınaq dərsi" }]} /></Field>
        <Field><FieldLabel>Nəticə</FieldLabel><FormSelect aria-label="Görüş nəticəsi" name="outcome" value={outcome} onValueChange={(value) => setOutcome(value as Appointment["outcome"])} options={Object.entries(appointmentOutcomeLabels).map(([value, label]) => ({ value, label }))} /></Field>
        <Button type="submit" disabled={busy}>{busy ? "Yüklənir…" : "Yadda saxla"}</Button>
      </form>
      <p role="status">{message}</p>
      <p>Eyni tarix və növ üzrə qeyd yenilənir. Son 30 görüş:</p>
      {!busy && rows.length === 0 ? <p>Görüş qeydi yoxdur.</p> : null}
      <div style={{ display: "grid", gap: 8 }}>{rows.map((row) => <Button key={row.id} type="button" variant="secondary" disabled={busy} style={{ height: "auto", whiteSpace: "normal", padding: 8 }} onClick={() => { setDate(row.date); setKind(row.kind); setOutcome(row.outcome); }}>{row.date} · {row.kind === "TRIAL" ? "Sınaq" : "Konsultasiya"} · {appointmentOutcomeLabels[row.outcome]}</Button>)}</div>
    </div> : null}
  </section>;
}
