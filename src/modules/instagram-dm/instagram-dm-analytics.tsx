"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AtSign,
  Clock3,
  Inbox,
  MessageCircle,
  RefreshCw,
  Reply,
  Search,
  Send,
  UsersRound,
} from "lucide-react";
import { cx } from "@/components/ui/cx";
import type {
  InstagramDmAnalyticsConversation,
  InstagramDmAnalyticsData,
  InstagramDmAnalyticsMessage,
} from "@/modules/instagram-dm/analytics-queries";
import { MarketingViewTabs } from "@/modules/marketing/marketing-view-tabs";

type ConversationFilter = "all" | "answered" | "unanswered";

const BAKU_OFFSET_MS = 4 * 60 * 60 * 1000;
const AZ_MONTHS = ["yan", "fev", "mar", "apr", "may", "iyn", "iyl", "avq", "sen", "okt", "noy", "dek"];

export function InstagramDmAnalytics({ data }: { data: InstagramDmAnalyticsData }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<ConversationFilter>("all");
  const [selectedId, setSelectedId] = useState(data.conversations[0]?.id ?? "");
  const [refreshPending, startRefresh] = useTransition();

  const filteredConversations = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("az-AZ");

    return data.conversations.filter((conversation) => {
      const matchesStatus = filter === "all"
        || (filter === "answered" && conversation.outboundCount > 0)
        || (filter === "unanswered" && conversation.outboundCount === 0);
      const matchesSearch = !normalizedSearch
        || `${conversation.participantLabel} ${conversation.participantHandle} ${conversation.preview}`
          .toLocaleLowerCase("az-AZ")
          .includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [data.conversations, filter, search]);

  const selectedConversation = filteredConversations.find((conversation) => conversation.id === selectedId)
    ?? filteredConversations[0]
    ?? null;

  function refresh() {
    startRefresh(() => router.refresh());
  }

  return (
    <section className="instagram-dm-page">
      <header className="instagram-dm-header">
        <div>
          <h1>Instagram DM Intelligence</h1>
          <p>Müştəri mesajlarını və davranış axınını izləyin.</p>
        </div>
        <div className="instagram-dm-header-actions">
          <span className={cx("instagram-dm-connection", data.account.connected && "is-connected")}>
            <i />
            {data.account.connected ? "Instagram bağlıdır" : "Instagram bağlantısı yoxdur"}
          </span>
          <button
            type="button"
            className="instagram-dm-refresh"
            aria-label="Instagram DM məlumatlarını yenilə"
            title="Yenilə"
            disabled={refreshPending}
            onClick={refresh}
          >
            <RefreshCw size={17} className={refreshPending ? "is-spinning" : undefined} />
          </button>
        </div>
      </header>

      <MarketingViewTabs active="dm" />

      <section className="instagram-dm-metrics" aria-label="Instagram DM əsas göstəriciləri">
        <Metric
          icon={MessageCircle}
          label="Conversation"
          value={count(data.summary.conversations)}
          helper={`${count(data.summary.participants)} iştirakçı`}
        />
        <Metric
          icon={Inbox}
          label="Gələn mesajlar"
          value={count(data.summary.inboundMessages)}
          helper={peakHourLabel(data.summary.peakInboundHour)}
        />
        <Metric
          icon={Reply}
          label="Cavablandırılan"
          value={count(data.summary.answeredConversations)}
          helper={`${count(data.summary.outboundMessages)} göndərilən mesaj`}
        />
        <Metric
          icon={Clock3}
          label="Median ilk cavab"
          value={durationLabel(data.summary.medianFirstResponseMinutes)}
          helper="İlk inbound → ilk outbound"
        />
      </section>

      <section className="instagram-dm-workspace" aria-label="Instagram conversation iş sahəsi">
        <aside className="instagram-dm-conversation-panel">
          <div className="instagram-dm-conversation-tools">
            <label className="instagram-dm-search">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Conversation axtar"
                aria-label="Conversation axtar"
              />
            </label>
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value as ConversationFilter)}
              aria-label="Conversation statusu"
            >
              <option value="all">Hamısı</option>
              <option value="unanswered">Cavabsız</option>
              <option value="answered">Cavablanan</option>
            </select>
          </div>

          <div className="instagram-dm-conversation-list">
            {filteredConversations.length ? filteredConversations.map((conversation) => (
              <ConversationItem
                key={conversation.id}
                conversation={conversation}
                selected={selectedConversation?.id === conversation.id}
                onSelect={() => setSelectedId(conversation.id)}
              />
            )) : (
              <div className="instagram-dm-list-empty">
                <Search size={20} />
                <strong>Nəticə tapılmadı</strong>
                <span>Axtarışı və ya filtri dəyişin.</span>
              </div>
            )}
          </div>
          <footer>{count(filteredConversations.length)} nəticə</footer>
        </aside>

        {selectedConversation ? (
          <>
            <ConversationTranscript conversation={selectedConversation} />
            <ConversationFacts conversation={selectedConversation} />
          </>
        ) : (
          <div className="instagram-dm-workspace-empty">
            <MessageCircle size={26} />
            <strong>Conversation seçilməyib</strong>
            <span>Mesaj axınını görmək üçün conversation seçin.</span>
          </div>
        )}
      </section>

      <footer className="instagram-dm-page-foot">
        <span>Son webhook: {data.account.lastWebhookAt ? fullDateTime(data.account.lastWebhookAt) : "—"}</span>
        <span>Məlumat yeniləndi: {fullDateTime(data.generatedAt)}</span>
      </footer>
    </section>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
  helper,
}: {
  icon: typeof MessageCircle;
  label: string;
  value: string;
  helper: string;
}) {
  return (
    <article className="instagram-dm-metric">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{helper}</small>
      </div>
      <i><Icon size={19} /></i>
    </article>
  );
}

function ConversationItem({
  conversation,
  selected,
  onSelect,
}: {
  conversation: InstagramDmAnalyticsConversation;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={cx("instagram-dm-conversation-item", selected && "is-selected")}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <span className="instagram-dm-avatar"><AtSign size={19} /></span>
      <span className="instagram-dm-conversation-copy">
        <span className="instagram-dm-conversation-title">
          <strong>{conversation.participantLabel}</strong>
          <time>{compactDateTime(conversation.lastMessageAt)}</time>
        </span>
        <small>{conversation.participantHandle}</small>
        <p>{conversation.preview}</p>
        <span className="instagram-dm-conversation-meta">
          <span><MessageCircle size={12} /> {count(conversation.messageCount)}</span>
          <span className={conversation.outboundCount > 0 ? "is-answered" : undefined}>
            {conversation.outboundCount > 0 ? "Cavablanıb" : "Cavabsız"}
          </span>
        </span>
      </span>
    </button>
  );
}

function ConversationTranscript({ conversation }: { conversation: InstagramDmAnalyticsConversation }) {
  return (
    <article className="instagram-dm-transcript">
      <header>
        <span className="instagram-dm-avatar"><AtSign size={20} /></span>
        <div>
          <h2>{conversation.participantLabel} <small>· {conversation.participantHandle}</small></h2>
          <p>Instagram conversation</p>
        </div>
        <span className="instagram-dm-transcript-activity">
          <strong>{count(conversation.messageCount)} mesaj</strong>
          <small>Son aktivlik: {compactDateTime(conversation.lastMessageAt)}</small>
        </span>
      </header>

      <div className="instagram-dm-message-stream">
        {conversation.messages.length ? conversation.messages.map((message, index) => (
          <MessageBubble
            key={message.id}
            message={message}
            showDate={index === 0 || dateKey(message.sentAt) !== dateKey(conversation.messages[index - 1]!.sentAt)}
          />
        )) : (
          <div className="instagram-dm-stream-empty">Bu conversation üçün mesaj yoxdur.</div>
        )}

        {conversation.inboundCount > 0 && conversation.outboundCount === 0 ? (
          <div className="instagram-dm-no-response">
            <span><Send size={19} /></span>
            <strong>Hələ cavab yoxdur</strong>
            <p>Bu conversation üçün hələ heç bir çıxan cavab saxlanmayıb.</p>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function MessageBubble({ message, showDate }: { message: InstagramDmAnalyticsMessage; showDate: boolean }) {
  return (
    <>
      {showDate ? <div className="instagram-dm-date-separator"><span>{dateLabel(message.sentAt)}</span></div> : null}
      <div className={cx("instagram-dm-message", message.direction === "OUTBOUND" && "is-outbound")}>
        <span className="instagram-dm-message-icon">
          {message.direction === "INBOUND" ? <AtSign size={15} /> : <Send size={14} />}
        </span>
        <div>
          <p>{message.text}</p>
          <time>{time(message.sentAt)}</time>
        </div>
      </div>
    </>
  );
}

function ConversationFacts({ conversation }: { conversation: InstagramDmAnalyticsConversation }) {
  const answered = conversation.outboundCount > 0;
  return (
    <aside className="instagram-dm-facts">
      <header>
        <h3>Sistem məlumatı</h3>
        <p>Conversation əsasında hesablanır</p>
      </header>
      <dl>
        <Fact icon={MessageCircle} label="Ümumi mesaj sayı" value={count(conversation.messageCount)} />
        <Fact icon={Inbox} label="Gələn" value={count(conversation.inboundCount)} />
        <Fact icon={Reply} label="Göndərilən" value={count(conversation.outboundCount)} />
      </dl>
      <dl>
        <Fact icon={Clock3} label="İlk mesaj" value={compactDateTime(conversation.firstMessageAt)} />
        <Fact icon={Clock3} label="Son aktivlik" value={compactDateTime(conversation.lastMessageAt)} />
      </dl>
      <dl>
        <Fact
          icon={UsersRound}
          label="Cavab statusu"
          value={answered ? "Cavablanıb" : "Cavablandırılmayıb"}
          tone={answered ? "positive" : "warning"}
        />
      </dl>
    </aside>
  );
}

function Fact({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof MessageCircle;
  label: string;
  value: string;
  tone?: "positive" | "warning";
}) {
  return (
    <div>
      <dt><Icon size={15} /> {label}</dt>
      <dd className={tone ? `is-${tone}` : undefined}>{value}</dd>
    </div>
  );
}

function count(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function durationLabel(minutes: number | null) {
  if (minutes === null) return "—";
  const rounded = Math.max(0, Math.round(minutes));
  if (rounded < 60) return `${rounded} dəq`;
  const hours = Math.floor(rounded / 60);
  const remainder = rounded % 60;
  return remainder ? `${hours} saat ${remainder} dəq` : `${hours} saat`;
}

function peakHourLabel(hour: number | null) {
  if (hour === null) return "Pik saat hələ hesablanmayıb";
  return `Pik saat ${hour.toString().padStart(2, "0")}:00–${((hour + 1) % 24).toString().padStart(2, "0")}:00`;
}

function dateKey(value: string) {
  const date = bakuDate(value);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function dateLabel(value: string) {
  const date = bakuDate(value);
  return `${pad(date.getUTCDate())} ${AZ_MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

function time(value: string) {
  const date = bakuDate(value);
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
}

function compactDateTime(value: string) {
  return `${dateLabel(value)} ${time(value)}`;
}

function fullDateTime(value: string) {
  return `${dateLabel(value)}, ${time(value)}`;
}

function bakuDate(value: string) {
  return new Date(new Date(value).getTime() + BAKU_OFFSET_MS);
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}
