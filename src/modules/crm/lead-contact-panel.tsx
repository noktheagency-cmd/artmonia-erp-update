"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { FormSelect } from "@/components/ui/select";
import {
  contactChannels,
  contactOutcomes,
  outcomeOptionsForChannel,
  type ContactChannel,
} from "./contact-policy";
import { nextActionTypeSelectOptions } from "./follow-up";
import { listContactEvents, saveContactEvent } from "./contact-actions";

type ContactRow = { id: string; channel: string; outcome: string; occurredAt: string; note: string | null };

export function LeadContactPanel({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [date, setDate] = useState("");
  const [channel, setChannel] = useState<ContactChannel>("PHONE");
  const [outcome, setOutcome] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const outcomeOptions = useMemo(() => outcomeOptionsForChannel(channel), [channel]);

  async function load() {
    const result = await listContactEvents(leadId);
    if (!result.ok) {
      setMessage(result.message);
      return;
    }
    setRows(result.data.rows);
    setDate(result.data.suggestedDate);
  }

  async function toggle() {
    setExpanded(!expanded);
    if (!expanded) {
      setBusy(true);
      try {
        await load();
      } catch {
        setMessage("Tarixçə yüklənmədi.");
      } finally {
        setBusy(false);
      }
    }
  }

  function onChannelChange(next: string) {
    const value = next as ContactChannel;
    setChannel(value);
    const allowed = outcomeOptionsForChannel(value).map((item) => item.value);
    if (!allowed.includes(outcome as (typeof allowed)[number])) {
      setOutcome("");
    }
  }

  async function save(form: FormData) {
    if (busy) return;
    form.set("occurredAt", new Date().toISOString());
    form.set("channel", channel);
    form.set("outcome", outcome);
    setBusy(true);
    setMessage("");
    try {
      const result = await saveContactEvent(form);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setKey(crypto.randomUUID());
      setOutcome("");
      setMessage("Əlaqə və növbəti iş yadda saxlanıldı.");
      await load();
      router.refresh();
    } catch {
      setMessage("Əlaqə saxlanılmadı. Yenidən cəhd edin.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="crm-dialog-section">
      <header>
        <h3>Əlaqə nəticəsi</h3>
        <p>Kanal və real nəticəni seçin. Mərhələ dəyişməsi əlaqə sayılmır.</p>
      </header>
      <Button type="button" variant="secondary" onClick={toggle} aria-expanded={expanded}>
        {expanded ? "Bağla" : "Əlaqə nəticəsini yaz"}
      </Button>
      {expanded ? (
        <div>
          <form action={save} className="crm-dialog-fields">
            <input type="hidden" name="leadId" value={leadId} />
            <input type="hidden" name="idempotencyKey" value={key} />
            <label className="form-field">
              <span>Kanal</span>
              <FormSelect
                name="channel"
                aria-label="Əlaqə kanalı"
                value={channel}
                onValueChange={onChannelChange}
                options={Object.entries(contactChannels).map(([value, label]) => ({ value, label }))}
              />
            </label>
            <label className="form-field">
              <span>Nəticə</span>
              <FormSelect
                name="outcome"
                aria-label="Əlaqə nəticəsi"
                value={outcome}
                onValueChange={setOutcome}
                emptyLabel="Seçin"
                options={outcomeOptions}
                required
              />
            </label>
            <label className="form-field">
              <span>Növbəti iş</span>
              <FormSelect
                name="nextActionType"
                aria-label="Növbəti iş"
                defaultValue="CALL"
                options={nextActionTypeSelectOptions}
              />
            </label>
            <label className="form-field">
              <span>Növbəti tarix</span>
              <DatePicker
                name="nextDate"
                aria-label="Növbəti əlaqə tarixi"
                value={date}
                onValueChange={setDate}
                required
              />
            </label>
            <label className="form-field">
              <span>Qısa qeyd (istəyə görə)</span>
              <Input name="note" maxLength={500} />
            </label>
            <Button type="submit" disabled={busy || !outcome}>
              {busy ? "Saxlanılır…" : "Saxla"}
            </Button>
          </form>
          <p role="status">{message}</p>
          {rows.length === 0 && !busy ? <p>Faktiki əlaqə qeydi yoxdur.</p> : null}
          <ul>
            {rows.map((row) => (
              <li key={row.id}>
                {new Intl.DateTimeFormat("az-AZ", {
                  timeZone: "Asia/Baku",
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(row.occurredAt))}
                {" · "}
                {contactChannels[row.channel as keyof typeof contactChannels] ?? row.channel}
                {" · "}
                {contactOutcomes[row.outcome as keyof typeof contactOutcomes] ?? row.outcome}
                {row.note ? ` · ${row.note}` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
