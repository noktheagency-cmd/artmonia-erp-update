"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  MessageCircle,
  Phone,
  PhoneMissed,
  UserRound,
} from "lucide-react";
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

function channelIcon(channel: string) {
  if (channel === "WHATSAPP") return <MessageCircle aria-hidden="true" />;
  if (channel === "IN_PERSON") return <UserRound aria-hidden="true" />;
  if (channel === "UNANSWERED" || channel === "PHONE") return <Phone aria-hidden="true" />;
  return <Phone aria-hidden="true" />;
}

function outcomeTone(outcome: string) {
  if (outcome === "TALKED" || outcome === "WHATSAPP_REPLIED") return "success";
  if (outcome === "UNANSWERED" || outcome === "ANSWERED_NO_TALK") return "warning";
  if (outcome === "WHATSAPP_SENT") return "info";
  return "neutral";
}

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
  const [messageTone, setMessageTone] = useState<"success" | "error" | "">("");

  const outcomeOptions = useMemo(() => outcomeOptionsForChannel(channel), [channel]);

  async function load() {
    const result = await listContactEvents(leadId);
    if (!result.ok) {
      setMessage(result.message);
      setMessageTone("error");
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
        setMessageTone("error");
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
    setMessageTone("");
    try {
      const result = await saveContactEvent(form);
      if (!result.ok) {
        setMessage(result.message);
        setMessageTone("error");
        return;
      }
      setKey(crypto.randomUUID());
      setOutcome("");
      setMessage("Əlaqə və növbəti iş yadda saxlanıldı.");
      setMessageTone("success");
      await load();
      router.refresh();
    } catch {
      setMessage("Əlaqə saxlanılmadı. Yenidən cəhd edin.");
      setMessageTone("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="crm-action-card">
      <header>
        <div>
          <h3>Əlaqə nəticəsi</h3>
          <p>Kanal və real nəticəni seçin. Mərhələ dəyişməsi əlaqə sayılmır.</p>
        </div>
        <Button type="button" variant="secondary" onClick={toggle} aria-expanded={expanded}>
          {expanded ? "Bağla" : "Əlaqə nəticəsini yaz"}
        </Button>
      </header>
      {expanded ? (
        <div className="crm-action-card-body">
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

          {message ? (
            <div
              className={`crm-contact-flash is-${messageTone || "neutral"}`}
              role="status"
            >
              {messageTone === "success" ? (
                <CheckCircle2 aria-hidden="true" />
              ) : messageTone === "error" ? (
                <PhoneMissed aria-hidden="true" />
              ) : null}
              <p>{message}</p>
            </div>
          ) : null}

          <div className="crm-contact-history">
            <div className="crm-contact-history-head">
              <h4>Əlaqə tarixçəsi</h4>
              {rows.length > 0 ? <span>{rows.length} qeyd</span> : null}
            </div>

            {rows.length === 0 && !busy ? (
              <p className="crm-contact-empty">Hələ faktiki əlaqə qeydi yoxdur.</p>
            ) : null}

            {rows.length > 0 ? (
              <ul className="crm-contact-log">
                {rows.map((row) => {
                  const channelLabel =
                    contactChannels[row.channel as keyof typeof contactChannels] ?? row.channel;
                  const outcomeLabel =
                    contactOutcomes[row.outcome as keyof typeof contactOutcomes] ?? row.outcome;
                  const when = new Intl.DateTimeFormat("az-AZ", {
                    timeZone: "Asia/Baku",
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(new Date(row.occurredAt));

                  return (
                    <li
                      key={row.id}
                      className={`crm-contact-log-item is-${outcomeTone(row.outcome)}`}
                    >
                      <span className="crm-contact-log-icon" aria-hidden="true">
                        {row.outcome === "UNANSWERED" ? (
                          <PhoneMissed />
                        ) : (
                          channelIcon(row.channel)
                        )}
                      </span>
                      <div className="crm-contact-log-main">
                        <div className="crm-contact-log-top">
                          <strong>{outcomeLabel}</strong>
                          <em>{channelLabel}</em>
                        </div>
                        {row.note ? <p>{row.note}</p> : null}
                      </div>
                      <time dateTime={row.occurredAt}>{when}</time>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
