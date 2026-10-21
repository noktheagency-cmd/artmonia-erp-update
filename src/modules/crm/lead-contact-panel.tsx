"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  Phone,
  PhoneMissed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { FormSelect } from "@/components/ui/select";
import { contactChannels, contactOutcomes, type ContactChannel, type ContactOutcome } from "./contact-policy";
import {
  formatNextActionTypeLabel,
  nextActionTypeOptions,
  nextActionTypeSelectOptions,
  type NextActionTypeValue,
} from "./follow-up";
import { listContactEvents, saveContactEvent } from "./contact-actions";

type ContactRow = { id: string; channel: string; outcome: string; occurredAt: string; note: string | null };
type PlanRow = {
  id: string;
  kind: string;
  plannedAt: string;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  result: string | null;
};

function bakuDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Baku",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

const months = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avqust", "sentyabr", "oktyabr", "noyabr", "dekabr"];

function formatPlanDate(value: string) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Baku",
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(new Date(value));
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "";
  const day = read("day");
  const month = months[Number(read("month")) - 1] ?? "";
  const year = read("year");
  const thisYear = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Baku", year: "numeric" }).format(new Date());
  return year === thisYear ? `${day} ${month}` : `${day} ${month} ${year}`;
}

function outcomeFor(channel: ContactChannel, reached: boolean): ContactOutcome {
  if (channel === "WHATSAPP") return reached ? "WHATSAPP_REPLIED" : "WHATSAPP_SENT";
  return reached ? "TALKED" : "UNANSWERED";
}

function isKnownAction(kind: string | null | undefined): kind is NextActionTypeValue {
  return nextActionTypeOptions.includes(kind as NextActionTypeValue);
}

function planTone(plan: PlanRow) {
  if (!plan.completedAt && !plan.cancelledAt) return "info";
  if (plan.result === "TALKED" || plan.result === "WHATSAPP_REPLIED") return "success";
  if (plan.result === "UNANSWERED" || plan.result === "ANSWERED_NO_TALK" || plan.result === "WHATSAPP_SENT") return "warning";
  return "neutral";
}

function planTitle(plan: PlanRow) {
  if (!plan.completedAt && !plan.cancelledAt) return "Planlaşdırılıb";
  if (plan.result === "TALKED" || plan.result === "WHATSAPP_REPLIED") return "Əlaqə quruldu";
  if (plan.result === "UNANSWERED" || plan.result === "ANSWERED_NO_TALK" || plan.result === "WHATSAPP_SENT") return "Əlaqə saxlanılmadı";
  if (plan.cancelledAt) return "Plan yeniləndi";
  return contactOutcomes[plan.result as keyof typeof contactOutcomes] ?? "Qeyd olundu";
}

export function LeadContactPanel({
  leadId,
  embedded = false,
  markedComplete = false,
  onReached,
}: {
  leadId: string;
  embedded?: boolean;
  markedComplete?: boolean;
  onReached?: () => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [mode, setMode] = useState<"missed" | "reached" | null>(null);
  const [channel, setChannel] = useState<ContactChannel>("PHONE");
  const [nextKind, setNextKind] = useState<NextActionTypeValue>("CALL");
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error" | "">("");
  const [loaded, setLoaded] = useState(false);

  const shown = embedded || expanded;
  const contactComplete = markedComplete || plans.some(
    (plan) => plan.result === "TALKED" || plan.result === "WHATSAPP_REPLIED",
  );
  const activePlan = useMemo(
    () => {
      if (contactComplete) return null;
      return plans.find((plan) => !plan.completedAt && !plan.cancelledAt) ?? null;
    },
    [contactComplete, plans],
  );
  const historyPlans = useMemo(
    () => [...plans]
      .filter((plan) => {
        if (!contactComplete) return true;
        // Əlaqə qurulandan sonra açıq plan history-də də görünməməlidir.
        return Boolean(plan.completedAt || plan.cancelledAt);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [contactComplete, plans],
  );

  useEffect(() => {
    if (!embedded) return;
    let ignore = false;

    async function run() {
      setBusy(true);
      try {
        const result = await listContactEvents(leadId);
        if (ignore) return;
        if (!result.ok) {
          setMessage(result.message);
          setMessageTone("error");
          return;
        }
        setRows(result.data.rows);
        setPlans(result.data.plans);
        setDate(result.data.suggestedDate);
        const openPlan = result.data.plans.find((plan) => !plan.completedAt && !plan.cancelledAt);
        if (isKnownAction(openPlan?.kind)) setNextKind(openPlan.kind);
      } catch {
        if (!ignore) {
          setMessage("Tarixçə yüklənmədi.");
          setMessageTone("error");
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
  }, [embedded, leadId]);

  async function load() {
    const result = await listContactEvents(leadId);
    if (!result.ok) {
      setMessage(result.message);
      setMessageTone("error");
      return;
    }
    setRows(result.data.rows);
    setPlans(result.data.plans);
    setDate(result.data.suggestedDate);
    const openPlan = result.data.plans.find((plan) => !plan.completedAt && !plan.cancelledAt);
    if (isKnownAction(openPlan?.kind)) setNextKind(openPlan.kind);
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

  async function save(form: FormData, chosen: "missed" | "reached" = "missed") {
    if (busy) return;
    const reached = chosen === "reached";
    const nextDate = date || bakuDate(new Date().toISOString());
    form.set("leadId", leadId);
    form.set("idempotencyKey", key);
    form.set("occurredAt", new Date().toISOString());
    form.set("channel", channel);
    form.set("outcome", outcomeFor(channel, reached));
    form.set("nextActionType", nextKind);
    form.set("nextDate", nextDate);
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
      setMode(null);
      if (reached) onReached?.();
      setMessage(reached ? "Əlaqə quruldu kimi təsdiqləndi." : "Əlaqə saxlanılmadı. Növbəti plan yazıldı.");
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
    <section className={embedded ? "crm-action-card is-embedded" : "crm-action-card"}>
      {embedded ? null : (
        <header>
          <div>
            <h3>Əlaqə</h3>
          </div>
          <Button type="button" variant="secondary" onClick={toggle} aria-expanded={expanded}>
            {expanded ? "Bağla" : "Əlaqə"}
          </Button>
        </header>
      )}
      {shown && embedded && !loaded ? <p className="crm-panel-loading">Yüklənir…</p> : null}
      {shown && (!embedded || loaded) ? (
        <div className="crm-action-card-body">
          <form action={(form) => save(form, "missed")} className="crm-contact-plan">
            <div className={contactComplete ? "crm-contact-active is-done" : "crm-contact-active"}>
              <div className="crm-contact-active-meta">
                <div className="crm-contact-active-copy">
                  <strong>
                    {activePlan
                      ? "Planlaşdırılıb"
                      : contactComplete
                        ? "Əlaqə quruldu"
                        : "Plan yoxdur"}
                  </strong>
                  {activePlan ? (
                    <em>{formatNextActionTypeLabel(activePlan.kind)}</em>
                  ) : null}
                  {activePlan ? <small>{formatPlanDate(activePlan.plannedAt)}</small> : null}
                </div>
              </div>
              {!contactComplete ? (
                <div className="crm-contact-choices">
                  <button
                    type="button"
                    className="crm-choice is-danger"
                    aria-pressed={mode === "missed"}
                    disabled={busy}
                    onClick={() => setMode((current) => current === "missed" ? null : "missed")}
                  >
                    <PhoneMissed aria-hidden="true" />
                    Əlaqə saxlanılmadı
                  </button>
                  <button
                    type="button"
                    className="crm-choice is-success"
                    aria-pressed={mode === "reached"}
                    disabled={busy}
                    onClick={() => {
                      setMode("reached");
                      void save(new FormData(), "reached");
                    }}
                  >
                    <CheckCircle2 aria-hidden="true" />
                    Əlaqə quruldu
                  </button>
                </div>
              ) : null}
            </div>
            {mode === "missed" ? (
              <>
                <div className="crm-dialog-fields">
                  <label className="form-field">
                    <span>Kanal</span>
                    <FormSelect
                      name="channel"
                      aria-label="Kanal"
                      value={channel}
                      onValueChange={(value) => setChannel(value as ContactChannel)}
                      options={Object.entries(contactChannels).map(([value, label]) => ({ value, label }))}
                    />
                  </label>
                  <label className="form-field">
                    <span>Növbəti iş</span>
                    <FormSelect
                      name="nextKind"
                      aria-label="Növbəti iş"
                      value={nextKind}
                      onValueChange={(value) => setNextKind(value as NextActionTypeValue)}
                      options={nextActionTypeSelectOptions}
                    />
                  </label>
                  <label className="form-field">
                    <span>Növbəti tarix</span>
                    <DatePicker
                      name="nextDate"
                      aria-label="Növbəti tarix"
                      value={date}
                      onValueChange={setDate}
                      minValue={bakuDate(new Date().toISOString())}
                      required
                    />
                  </label>
                  <label className="form-field">
                    <span>Qısa qeyd</span>
                    <Input name="note" maxLength={500} placeholder="İstəyə görə" />
                  </label>
                </div>
                <Button type="submit" disabled={busy || !date}>
                  {busy ? "Saxlanılır…" : "Əlaqəni və işi saxla"}
                </Button>
              </>
            ) : null}
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
              {historyPlans.length > 0 ? <span>{historyPlans.length} qeyd</span> : null}
            </div>

            {historyPlans.length === 0 && rows.length === 0 && !busy ? (
              <p className="crm-contact-empty">Hələ əlaqə planı yoxdur.</p>
            ) : null}

            {historyPlans.length > 0 ? (
              <ul className="crm-contact-log">
                {historyPlans.map((plan) => (
                  <li key={plan.id} className={`crm-contact-log-item is-${planTone(plan)}`}>
                    <span className="crm-contact-log-icon" aria-hidden="true">
                      {planTone(plan) === "warning" ? <PhoneMissed /> : planTone(plan) === "success" ? <CheckCircle2 /> : <Phone />}
                    </span>
                    <div className="crm-contact-log-main">
                      <div className="crm-contact-log-top">
                        <strong>{planTitle(plan)}</strong>
                        <em>{formatNextActionTypeLabel(plan.kind)}</em>
                      </div>
                    </div>
                    <time dateTime={plan.plannedAt}>{formatPlanDate(plan.plannedAt)}</time>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
