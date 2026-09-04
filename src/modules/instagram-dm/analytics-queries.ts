import { createHash } from "node:crypto";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { Prisma } from "@/generated/prisma/client";
import {
  aggregateConversationClassifications,
  conversationClassificationBatchSchema,
  normalizeConversationClassification,
  type AiAnalysis,
  type ConversationClassification,
} from "@/modules/instagram-dm/analytics-ai";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { getEnv } from "@/server/env";

const ANALYSIS_DAYS = 90;
const CACHE_TTL_MS = 15 * 60 * 1000;
const AI_BATCH_SIZE = 25;
const ANALYSIS_VERSION = "dm-ai-v5";

export type InstagramDmAnalyticsData = {
  account: { connected: boolean; username: string; lastWebhookAt: string };
  periodDays: number;
  summary: {
    conversations: number;
    participants: number;
    messages: number;
    answeredConversations: number;
    responseRate: number;
    medianFirstResponseMinutes: number | null;
    peakInboundHour: number | null;
  };
  ai: ({ state: "ready"; generatedAt: string } & AiAnalysis) | {
    state: "no_data" | "unavailable";
    generatedAt: string;
    reason: string;
  };
  generatedAt: string;
};

type ResponseSummaryRow = {
  inboundConversations: number;
  answeredConversations: number;
  medianFirstResponseMinutes: number | null;
};
type PeakHourRow = { hour: number };
type AnalysisConversation = {
  id: string;
  lastMessageAt: Date;
  messages: Array<{
    id: string;
    direction: "INBOUND" | "OUTBOUND";
    text: string | null;
    kind: string;
    sentAt: Date;
  }>;
};

const analysisCache = new Map<string, { expiresAt: number; value: AiAnalysis }>();
const analysisInFlight = new Map<string, Promise<AiAnalysis>>();

export async function getInstagramDmAnalyticsData(): Promise<InstagramDmAnalyticsData> {
  await requireErpActor("marketing.read");
  const since = new Date(Date.now() - ANALYSIS_DAYS * 24 * 60 * 60 * 1000);
  const prisma = getPrisma();
  const env = getEnv();
  const [accounts, conversationCount, participantCount, messageCount, responseRows, peakRows, conversations] = await Promise.all([
    prisma.instagramDmAccount.findMany({
      where: { isActive: true },
      orderBy: { lastWebhookAt: "desc" },
      take: 1,
      select: { username: true, lastWebhookAt: true },
    }),
    prisma.instagramDmConversation.count({ where: { lastMessageAt: { gte: since } } }),
    prisma.instagramDmParticipant.count({ where: { lastSeenAt: { gte: since } } }),
    prisma.instagramDmMessage.count({ where: { sentAt: { gte: since }, isDeleted: false } }),
    prisma.$queryRaw<ResponseSummaryRow[]>(Prisma.sql`
      with first_inbound as (
        select conversation_id, min(sent_at) as first_inbound_at
        from erp.instagram_dm_messages
        where direction = 'INBOUND' and is_deleted = false and sent_at >= ${since}
        group by conversation_id
      ), first_response as (
        select inbound.conversation_id, inbound.first_inbound_at, min(message.sent_at) as first_outbound_at
        from first_inbound inbound
        left join erp.instagram_dm_messages message
          on message.conversation_id = inbound.conversation_id
          and message.direction = 'OUTBOUND' and message.is_deleted = false
          and message.sent_at >= inbound.first_inbound_at
        group by inbound.conversation_id, inbound.first_inbound_at
      )
      select count(*)::int as "inboundConversations",
        count(first_outbound_at)::int as "answeredConversations",
        (percentile_cont(0.5) within group (
          order by extract(epoch from (first_outbound_at - first_inbound_at)) / 60
        ) filter (where first_outbound_at is not null))::float8 as "medianFirstResponseMinutes"
      from first_response
    `),
    prisma.$queryRaw<PeakHourRow[]>(Prisma.sql`
      select extract(hour from sent_at + interval '4 hours')::int as hour
      from erp.instagram_dm_messages
      where direction = 'INBOUND' and is_deleted = false and sent_at >= ${since}
      group by hour order by count(*) desc, hour asc limit 1
    `),
    prisma.instagramDmConversation.findMany({
      where: { lastMessageAt: { gte: since } },
      orderBy: [{ lastMessageAt: "desc" }, { id: "asc" }],
      take: 120,
      select: {
        id: true,
        lastMessageAt: true,
        messages: {
          where: { isDeleted: false },
          orderBy: [{ sentAt: "desc" }, { id: "desc" }],
          take: 60,
          select: { id: true, direction: true, text: true, kind: true, sentAt: true },
        },
      },
    }),
  ]);

  const response = responseRows[0] ?? {
    inboundConversations: 0,
    answeredConversations: 0,
    medianFirstResponseMinutes: null,
  };
  const account = accounts[0];

  const responseRate = response.inboundConversations > 0
    ? response.answeredConversations * 100 / response.inboundConversations
    : 0;
  const metrics = {
    responseRate,
    medianFirstResponseMinutes: response.medianFirstResponseMinutes,
  };

  return {
    account: {
      connected: Boolean(env.META_INSTAGRAM_ACCESS_TOKEN && env.META_APP_SECRET),
      username: account?.username || "artmoniya.academy",
      lastWebhookAt: account?.lastWebhookAt.toISOString() ?? "",
    },
    periodDays: ANALYSIS_DAYS,
    summary: {
      conversations: conversationCount,
      participants: participantCount,
      messages: messageCount,
      answeredConversations: response.answeredConversations,
      responseRate,
      medianFirstResponseMinutes: response.medianFirstResponseMinutes,
      peakInboundHour: peakRows[0]?.hour ?? null,
    },
    ai: await analyzeConversations(conversations, metrics),
    generatedAt: new Date().toISOString(),
  };
}

async function analyzeConversations(
  conversations: AnalysisConversation[],
  metrics: { responseRate: number; medianFirstResponseMinutes: number | null },
): Promise<InstagramDmAnalyticsData["ai"]> {
  const usable: PreparedConversation[] = conversations.flatMap((conversation, index) => {
    const messages = [...conversation.messages].reverse().flatMap((message) => {
      const text = message.text?.trim();
      if (!text) return [];
      const direction: "MÜŞTƏRİ" | "KOMANDA" = message.direction === "INBOUND" ? "MÜŞTƏRİ" : "KOMANDA";
      return [{
        direction,
        text: text.slice(0, 260),
      }];
    });
    const hasInboundText = messages.some((message) => message.direction === "MÜŞTƏRİ");
    return hasInboundText ? [{ index: index + 1, messages }] : [];
  });

  const generatedAt = new Date().toISOString();
  if (usable.length === 0) return { state: "no_data", generatedAt, reason: "Analiz üçün mətnli dialoq yoxdur." };
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return { state: "unavailable", generatedAt, reason: "AI xidməti konfiqurasiya edilməyib." };
  }

  const fingerprint = createHash("sha256")
    .update(JSON.stringify([ANALYSIS_VERSION, conversations.map((item) => [item.id, item.lastMessageAt, item.messages.map((message) => message.id)])]))
    .digest("hex");
  const cached = analysisCache.get(fingerprint);
  if (cached && cached.expiresAt > Date.now()) return { state: "ready", generatedAt, ...cached.value };

  try {
    let pending = analysisInFlight.get(fingerprint);
    if (!pending) {
      pending = classifyConversations(usable).then((classifications) => (
        aggregateConversationClassifications(classifications, metrics)
      ));
      analysisInFlight.set(fingerprint, pending);
    }
    const output = await pending;
    analysisCache.clear();
    analysisCache.set(fingerprint, { expiresAt: Date.now() + CACHE_TTL_MS, value: output });
    return { state: "ready", generatedAt, ...output };
  } catch (error) {
    console.error("Instagram DM aggregate AI analysis failed", error instanceof Error ? error.name : "UnknownError");
    return { state: "unavailable", generatedAt, reason: "AI analizi hazırda yenilənə bilmədi." };
  } finally {
    analysisInFlight.delete(fingerprint);
  }
}

type PreparedConversation = {
  index: number;
  messages: Array<{ direction: "MÜŞTƏRİ" | "KOMANDA"; text: string }>;
};

async function classifyConversations(conversations: PreparedConversation[]) {
  const batches = Array.from(
    { length: Math.ceil(conversations.length / AI_BATCH_SIZE) },
    (_, index) => conversations.slice(index * AI_BATCH_SIZE, (index + 1) * AI_BATCH_SIZE),
  );
  const results = await Promise.all(batches.map(classifyBatch));
  return results.flat();
}

async function classifyBatch(batch: PreparedConversation[]): Promise<ConversationClassification[]> {
  const { output } = await generateText({
    model: google("gemini-2.5-flash-lite"),
    output: Output.object({ schema: conversationClassificationBatchSchema }),
    temperature: 0,
    maxOutputTokens: 7000,
    system: [
      "Sən Artmonia təhsil ERP-si üçün Azərbaycan dilində işləyən customer behavior təsnifatçısısan.",
      "Hər dialoqu ayrıca təsnif et. Heç bir faiz, ümumi say, xülasə və tövsiyə yaratma.",
      "kind, service, purchaseIntent və barriers yalnız MÜŞTƏRİ mesajlarından müəyyən edilməlidir; KOMANDA mesajlarından müştəri niyyəti çıxarma.",
      "İş/vakansiya müraciətini HR, spam və mövzuya aid olmayan dialoqu IRRELEVANT et. Bu hallarda service və purchaseIntent null, barriers boş, outcome NOT_CUSTOMER, needsReply false olmalıdır.",
      "CUSTOMER üçün purchaseIntent: konkret qiymət, tarix, qeydiyyat, yer və ya konkret xidmət soruşulursa HOT; aydın xidmət marağı varsa WARM; zəif və qeyri-müəyyən maraqdırsa COLD.",
      "Maneəni yalnız müştəri açıq dedikdə seç; sadəcə məlumat soruşmasını avtomatik maneə sayma. UNCERTAINTY yalnız qərara mane olan qeyri-müəyyənlik olduqda istifadə edilir.",
      "needsReply yalnız son mənalı müştəri mesajı cavab və ya əməliyyat tələb edir və ondan sonra komanda cavabı yoxdur; təşəkkür, təsdiq, emoji və söhbəti bağlayan mesaj üçün false et.",
      "outcome qaydası: CONTACT_SHARED yalnız müştəri əlaqə məlumatı verəndə; INFO_PROVIDED komanda sualı məzmunlu şəkildə cavablandırıb açıq gözləyən əməl qalmayanda; FOLLOW_UP_REQUIRED yalnız konkret növbəti əməl hələ yerinə yetirilməyəndə; CUSTOMER_CLOSED müştəri söhbəti bağlayanda; NO_RESOLUTION yalnız məzmunlu komanda cavabı olmayanda və ya cavab açıq şəkildə problemi həll etməyəndə seçilir. Komanda məlumat veribsə, müştəri cavab yazmasa və qeydiyyata keçməsə belə bunu NO_RESOLUTION etmə. Sadəcə CTA və ya WhatsApp nömrəsi göndərilməsi FOLLOW_UP_REQUIRED deyil.",
      "teamRatings yalnız KOMANDA cavabı varsa verilir. Hər meyar 1–5 baldır; tətbiq olunmayan meyar null olmalıdır. Maksimum 5 balı yalnız açıq sübut olduqda ver, standart nəzakətli cavaba avtomatik 5 vermə.",
      "Peşəkarlıq: 5 = fərdiləşdirilmiş, aydın, yığcam və qüsursuz; uzun şablon, təkrar və ya robotik cavab 3-dən yuxarı ola bilməz; kobud/qarışıq cavab 1–2-dir.",
      "Ehtiyacın aşkarlanması: 5 = həll təklifindən əvvəl məqsəd, səviyyə və uyğunluğu konkret suallarla aydınlaşdırır; yalnız salam, ad/telefon soruşmaq və ya məlumat yığını 1–2-dir.",
      "Cavab keyfiyyəti: 5 = müştərinin konkret sualını birbaşa və tam cavablandırır; qismən cavab 3, sualdan yayınan ümumi şablon 1–2-dir.",
      "Etirazların idarəsi yalnız müştəri açıq etiraz etdikdə qiymətləndirilir: etirazı qəbul edib konkret həll/alternativ verirsə 5, sadəcə təkrar məlumat verirsə 2–3, etirazı cavabsız qoyursa 1-dir; etiraz yoxdursa null et.",
      "Qeydiyyata yönləndirmə: 5 = dialoqa uyğun konkret növbəti addım və aydın CTA; sadəcə telefon/WhatsApp paylaşmaq 3, ümumi 'əlaqə saxlayın' 2, CTA fürsəti olduğu halda heç bir addım verməmək 1-dir; real CTA fürsəti yoxdursa null et.",
      "Nəticəni yalnız verilən index-lərlə və hər index üçün dəqiq bir dəfə qaytar. Şəxsi məlumatı və mesaj mətnini nəticəyə köçürmə.",
    ].join("\n"),
    prompt: `Son ${ANALYSIS_DAYS} günün anonim dialoqları:\n${JSON.stringify(batch)}`,
  });
  const parsed = conversationClassificationBatchSchema.parse(output).conversations;
  const expected = new Set(batch.map((item) => item.index));
  const actual = new Set(parsed.map((item) => item.index));
  if (actual.size !== parsed.length || actual.size !== expected.size || [...expected].some((index) => !actual.has(index))) {
    throw new Error("AI classification indices did not match the requested batch");
  }
  const sourceByIndex = new Map(batch.map((item) => [item.index, item]));
  return parsed.map((item) => {
    const source = sourceByIndex.get(item.index)!;
    const lastMessage = source.messages.at(-1);
    return normalizeConversationClassification(item, {
      lastDirection: lastMessage?.direction ?? "MÜŞTƏRİ",
      hasTeamMessage: source.messages.some((message) => message.direction === "KOMANDA"),
    });
  });
}
