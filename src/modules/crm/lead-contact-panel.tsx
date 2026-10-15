"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { FormSelect } from "@/components/ui/select";
import { contactChannels, contactOutcomes } from "./contact-policy";
import { nextActionTypeSelectOptions } from "./follow-up";
import { listContactEvents, saveContactEvent } from "./contact-actions";

type ContactRow = { id: string; channel: string; outcome: string; occurredAt: string; note: string | null };
export function LeadContactPanel({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function load() {
    const result = await listContactEvents(leadId);
    if (!result.ok) { setMessage(result.message); return; }
    setRows(result.data.rows); setDate(result.data.suggestedDate);
  }
  async function toggle() {
    setExpanded(!expanded);
    if (!expanded) {
      setBusy(true);
      try { await load(); } catch { setMessage("Tarixçə yüklənmədi."); } finally { setBusy(false); }
    }
  }
  async function save(form: FormData) {
    if (busy) return;
    form.set("occurredAt", new Date().toISOString());
    setBusy(true); setMessage("");
    try {
      const result = await saveContactEvent(form);
      if (!result.ok) { setMessage(result.message); return; }
      setKey(crypto.randomUUID()); setMessage("Əlaqə və növbəti iş yadda saxlanıldı.");
      await load(); router.refresh();
    } catch { setMessage("Əlaqə saxlanılmadı. Yenidən cəhd edin."); }
    finally { setBusy(false); }
  }
  return <section className="crm-dialog-section">
    <Button type="button" variant="secondary" onClick={toggle} aria-expanded={expanded}>Əlaqə nəticəsi</Button>
    {expanded ? <div>
      <p>Faktiki danışığı və ya cavabsız cəhdi bir dəfə qeyd edin. Mərhələ dəyişməsi danışıq sayılmır.</p>
      <p>Cavabsız ilk cəhd: həmin gün təkrar zəng və WhatsApp; sonra ilk cəhddən 3 və 7 gün sonra izləmə.</p>
      <form action={save} className="crm-dialog-fields">
        <input type="hidden" name="leadId" value={leadId} /><input type="hidden" name="idempotencyKey" value={key} />
        <label className="form-field"><span>Kanal</span><FormSelect name="channel" aria-label="Əlaqə kanalı" defaultValue="PHONE" options={Object.entries(contactChannels).map(([value, label]) => ({ value, label }))} /></label>
        <label className="form-field"><span>Nəticə</span><FormSelect name="outcome" aria-label="Əlaqə nəticəsi" defaultValue="TALKED" options={Object.entries(contactOutcomes).map(([value, label]) => ({ value, label }))} /></label>
        <label className="form-field"><span>Növbəti iş</span><FormSelect name="nextActionType" aria-label="Növbəti iş" defaultValue="CALL" options={nextActionTypeSelectOptions} /></label>
        <label className="form-field"><span>Növbəti tarix</span><DatePicker name="nextDate" aria-label="Növbəti əlaqə tarixi" value={date} onValueChange={setDate} required /></label>
        <label className="form-field"><span>Qısa qeyd (istəyə görə)</span><Input name="note" maxLength={500} /></label>
        <Button type="submit" disabled={busy}>{busy ? "Saxlanılır…" : "Əlaqəni və işi saxla"}</Button>
      </form>
      <p role="status">{message}</p>
      {rows.length === 0 && !busy ? <p>Faktiki əlaqə qeydi yoxdur.</p> : null}
      <ul>{rows.map((row) => <li key={row.id}>{new Intl.DateTimeFormat("az-AZ", { timeZone: "Asia/Baku", dateStyle: "short", timeStyle: "short" }).format(new Date(row.occurredAt))} · {contactChannels[row.channel as keyof typeof contactChannels]} · {contactOutcomes[row.outcome as keyof typeof contactOutcomes]}{row.note ? ` · ${row.note}` : ""}</li>)}</ul>
    </div> : null}
  </section>;
}
