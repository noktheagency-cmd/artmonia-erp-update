"use client";

import { useDeferredValue, useMemo, useState, useTransition, type FormEvent } from "react";
import {
  Check,
  ChevronDown,
  Copy,
  Mail,
  MessageCircle,
  Search,
  Send,
  Sparkles,
  UsersRound,
  WandSparkles,
} from "lucide-react";
import { MessageResponse } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { notifyCaughtError } from "@/lib/app-notifications";
import type {
  WorkshopOfferAudience,
  WorkshopOfferInput,
  WorkshopOfferResult,
} from "@/modules/workshops/offer-actions";

type AudienceAction = () => Promise<WorkshopOfferAudience>;
type GenerateAction = (input: WorkshopOfferInput) => Promise<WorkshopOfferResult>;
type AudienceMode = WorkshopOfferInput["audienceMode"];

export function WorkshopOfferDialog({
  loadAudienceAction,
  generateOfferAction,
}: {
  loadAudienceAction: AudienceAction;
  generateOfferAction: GenerateAction;
}) {
  const [open, setOpen] = useState(false);
  const [audience, setAudience] = useState<WorkshopOfferAudience | null>(null);
  const [mode, setMode] = useState<AudienceMode>("all");
  const [purpose, setPurpose] = useState("");
  const [workshopIds, setWorkshopIds] = useState<string[]>([]);
  const [participantKeys, setParticipantKeys] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState<WorkshopOfferResult | null>(null);
  const [audiencePending, startAudienceTransition] = useTransition();
  const [generationPending, startGenerationTransition] = useTransition();
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("az"));

  const filteredParticipants = useMemo(() => {
    if (!audience) return [];
    if (!deferredQuery) return audience.participants;
    return audience.participants.filter((participant) =>
      `${participant.fullName} ${participant.email} ${participant.phone} ${participant.workshopTitles.join(" ")}`
        .toLocaleLowerCase("az")
        .includes(deferredQuery)
    );
  }, [audience, deferredQuery]);

  const selectedCount = useMemo(() => {
    if (!audience) return 0;
    if (mode === "all") return audience.totalParticipants;
    if (mode === "participants") return participantKeys.length;
    const selected = new Set(workshopIds);
    return audience.participants.filter((participant) => participant.workshopIds.some((id) => selected.has(id))).length;
  }, [audience, mode, participantKeys.length, workshopIds]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (!nextOpen || audience || audiencePending) return;
    setError("");
    startAudienceTransition(() => {
      void loadAudienceAction()
        .then(setAudience)
        .catch((caught) => setError(notifyCaughtError(caught, "Auditoriya yüklənmədi")));
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    startGenerationTransition(() => {
      void generateOfferAction({ purpose, audienceMode: mode, workshopIds, participantKeys })
        .then(setResult)
        .catch((caught) => setError(notifyCaughtError(caught, "Təklif hazırlana bilmədi")));
    });
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline"><WandSparkles data-icon="inline-start" />Offer</Button>
      </DialogTrigger>
      <DialogContent className="workshop-offer-dialog">
        <DialogHeader className="workshop-offer-header">
          <div className="workshop-offer-mark"><Sparkles /></div>
          <div>
            <DialogTitle>AI Offer Studio</DialogTitle>
            <DialogDescription>İştirak tarixçəsinə əsaslanan fərdi və seqmentləşdirilmiş təklif hazırlayın.</DialogDescription>
          </div>
        </DialogHeader>

        {audiencePending ? <OfferLoading /> : null}
        {!audiencePending && audience ? (
          <form onSubmit={submit} className="workshop-offer-form">
            <section className="workshop-offer-brief">
              <label htmlFor="offer-purpose">Təklifin məqsədi</label>
              <textarea
                id="offer-purpose"
                value={purpose}
                onChange={(event) => setPurpose(event.target.value)}
                rows={3}
                minLength={8}
                maxLength={700}
                placeholder="Məsələn: yeni impressionizm masterclassına keçmiş iştirakçıları erkən qeydiyyata cəlb etmək..."
                required
              />
              <div><span>AI ilə hazırlanır</span><small>{purpose.length}/700</small></div>
            </section>

            <section className="workshop-offer-audience">
              <div className="workshop-offer-section-title">
                <div><UsersRound /><span><strong>Auditoriyanı seçin</strong><small>{selectedCount} nəfər seçilib</small></span></div>
                <span>{audience.emailReady} email · {audience.whatsappReady} WhatsApp</span>
              </div>
              <div className="workshop-offer-mode" role="radiogroup" aria-label="Auditoriya seçim üsulu">
                <AudienceModeButton active={mode === "all"} onClick={() => setMode("all")} label="Hamısı" helper={`${audience.totalParticipants} iştirakçı`} />
                <AudienceModeButton active={mode === "workshops"} onClick={() => setMode("workshops")} label="Workshop üzrə" helper="Maraq seqmentləri" />
                <AudienceModeButton active={mode === "participants"} onClick={() => setMode("participants")} label="İştirakçı seç" helper="Fərdi seçim" />
              </div>

              {mode === "all" ? (
                <div className="workshop-offer-all-selected"><Check />Bütün aktiv workshop iştirakçıları auditoriyaya daxildir.</div>
              ) : null}

              {mode === "workshops" ? (
                <div className="workshop-offer-choice-list">
                  {audience.workshops.map((workshop) => (
                    <SelectionRow
                      key={workshop.id}
                      checked={workshopIds.includes(workshop.id)}
                      onChange={() => setWorkshopIds(toggleValue(workshopIds, workshop.id))}
                      title={workshop.title}
                      helper={`${workshop.participantCount} iştirakçı`}
                    />
                  ))}
                </div>
              ) : null}

              {mode === "participants" ? (
                <div className="workshop-offer-participant-picker">
                  <div className="workshop-offer-search">
                    <Search />
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ad, email, telefon və ya workshop axtar" />
                    <button type="button" onClick={() => setParticipantKeys(filteredParticipants.map((participant) => participant.key))}>Hamısını seç</button>
                  </div>
                  <div className="workshop-offer-choice-list is-participants">
                    {filteredParticipants.map((participant) => (
                      <SelectionRow
                        key={participant.key}
                        checked={participantKeys.includes(participant.key)}
                        onChange={() => setParticipantKeys(toggleValue(participantKeys, participant.key))}
                        title={participant.fullName}
                        helper={participant.workshopTitles.join(" · ")}
                        meta={participant.email || participant.phone || "Əlaqə məlumatı yoxdur"}
                      />
                    ))}
                  </div>
                </div>
              ) : null}
            </section>

            {error ? <p className="workshop-form-error workshop-offer-error" role="alert">{error}</p> : null}

            <div className="workshop-offer-generate-row">
              <div><Sparkles /><span><strong>AI segmentasiyası</strong><small>İştirakçıların workshop tarixçəsinə görə avtomatik ayrılacaq.</small></span></div>
              <Button type="submit" disabled={generationPending || selectedCount === 0 || purpose.trim().length < 8}>
                <WandSparkles data-icon="inline-start" />{generationPending ? "Hazırlanır..." : "Təklif hazırla"}
              </Button>
            </div>

            {generationPending ? <GenerationLoading /> : null}
            {result ? <OfferResult result={result} /> : null}
          </form>
        ) : null}
        {!audiencePending && !audience && error ? <p className="workshop-form-error workshop-offer-error" role="alert">{error}</p> : null}
      </DialogContent>
    </Dialog>
  );
}

function AudienceModeButton({ active, onClick, label, helper }: { active: boolean; onClick: () => void; label: string; helper: string }) {
  return (
    <button type="button" role="radio" aria-checked={active} className={active ? "is-active" : undefined} onClick={onClick}>
      <i>{active ? <Check /> : null}</i><span><strong>{label}</strong><small>{helper}</small></span>
    </button>
  );
}

function SelectionRow({ checked, onChange, title, helper, meta }: { checked: boolean; onChange: () => void; title: string; helper: string; meta?: string }) {
  return (
    <label className={checked ? "is-selected" : undefined}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <i>{checked ? <Check /> : null}</i>
      <span><strong>{title}</strong><small>{helper}</small></span>
      {meta ? <em>{meta}</em> : null}
    </label>
  );
}

function OfferResult({ result }: { result: WorkshopOfferResult }) {
  const [openSegments, setOpenSegments] = useState<string[]>(result.segments.map((segment) => segment.segmentKey));
  return (
    <section className="workshop-offer-result">
      <header>
        <div><span>Hazır strategiya</span><h3>{result.campaignTitle}</h3></div>
        <strong>{result.segments.length} seqment · {result.totalAudience} nəfər</strong>
      </header>
      <MessageResponse className="workshop-offer-strategy">{result.strategySummary}</MessageResponse>
      <div className="workshop-offer-segments">
        {result.segments.map((segment) => {
          const expanded = openSegments.includes(segment.segmentKey);
          return (
            <article key={segment.segmentKey}>
              <button type="button" className="workshop-offer-segment-head" onClick={() => setOpenSegments(toggleValue(openSegments, segment.segmentKey))}>
                <span><i>{segment.audienceCount}</i><span><strong>{segment.segmentName}</strong><small>{segment.workshopAffinity}</small></span></span>
                <ChevronDown className={expanded ? "is-open" : undefined} />
              </button>
              {expanded ? (
                <div className="workshop-offer-segment-body">
                  <MessageResponse className="workshop-offer-insight">{segment.audienceInsight}</MessageResponse>
                  <div className="workshop-offer-copy-grid">
                    <section>
                      <header><span><Mail /><strong>Email təklifi</strong></span><CopyOfferButton label="Emaili kopyala" value={`${segment.subject}\n\n${segment.emailBody}\n\n${segment.callToAction}`} /></header>
                      <MessageResponse>{`**${segment.subject}**\n\n${segment.emailBody}\n\n**${segment.callToAction}**`}</MessageResponse>
                    </section>
                    <section>
                      <header><span><MessageCircle /><strong>WhatsApp təklifi</strong></span><CopyOfferButton label="WhatsApp mətnini kopyala" value={`${segment.whatsappMessage}\n\n${segment.callToAction}`} /></header>
                      <MessageResponse>{`${segment.whatsappMessage}\n\n**${segment.callToAction}**`}</MessageResponse>
                    </section>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
      <footer>
        <div><Send /><span><strong>Toplu göndəriş</strong><small>Email və WhatsApp inteqrasiyası növbəti mərhələdə aktivləşəcək.</small></span></div>
        <div><Button type="button" variant="outline" disabled><Mail />Email ilə göndər</Button><Button type="button" disabled><MessageCircle />WhatsApp ilə göndər</Button></div>
      </footer>
    </section>
  );
}

function CopyOfferButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return <button type="button" className={copied ? "workshop-offer-copy-button is-copied" : "workshop-offer-copy-button"} onClick={copy} aria-label={label}>{copied ? <Check /> : <Copy />}{copied ? "Kopyalandı" : "Kopyala"}</button>;
}

function OfferLoading() {
  return <div className="workshop-offer-loading"><span /><span /><span /><p>İştirakçı auditoriyası hazırlanır...</p></div>;
}

function GenerationLoading() {
  return <div className="workshop-offer-ai-loading"><WandSparkles /><span><strong>AI təklifləri hazırlayır</strong><small>Workshop maraqları analiz olunur və seqment mətnləri yazılır...</small></span></div>;
}

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}
