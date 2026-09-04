import { createHash } from "node:crypto";
import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { getEnv } from "@/server/env";

const ANALYSIS_DAYS = 90;
const CACHE_TTL_MS = 15 * 60 * 1000;

const percentageItemSchema = z.object({
  label: z.string().min(2).max(80),
  percentage: z.number().min(0).max(100),
});
const aiAnalysisSchema = z.object({
  serviceInterest: z.array(percentageItemSchema).min(1).max(6),
  purchaseIntent: z.object({
    hot: z.number().min(0).max(100),
    warm: z.number().min(0).max(100),
    cold: z.number().min(0).max(100),
  }),
  barriers: z.array(percentageItemSchema).min(1).max(6),
  outcomes: z.array(percentageItemSchema).min(1).max(6),
  teamScores: z.object({
    professionalism: z.number().min(0).max(100),
    needDiscovery: z.number().min(0).max(100),
    answerQuality: z.number().min(0).max(100),
    objectionHandling: z.number().min(0).max(100),
    registrationDirection: z.number().min(0).max(100),
  }),
  incompleteDialogs: z.number().int().min(0),
  highIntentUnanswered: z.number().int().min(0),
  summary: z.string().min(20).max(700),
  recommendations: z.array(z.string().min(8).max(240)).min(1).max(5),
});

type AiAnalysis = z.infer<typeof aiAnalysisSchema>;

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
          orderBy: [{ sentAt: "asc" }, { id: "asc" }],
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
      responseRate: response.inboundConversations > 0
        ? response.answeredConversations * 100 / response.inboundConversations
        : 0,
      medianFirstResponseMinutes: response.medianFirstResponseMinutes,
      peakInboundHour: peakRows[0]?.hour ?? null,
    },
    ai: await analyzeConversations(conversations),
    generatedAt: new Date().toISOString(),
  };
}

async function analyzeConversations(conversations: AnalysisConversation[]): Promise<InstagramDmAnalyticsData["ai"]> {
  let remainingCharacters = 60_000;
  const usable = conversations.flatMap((conversation, index) => {
    if (remainingCharacters <= 0) return [];
    const messages = conversation.messages.flatMap((message) => {
      const text = message.text?.trim();
      if (!text || remainingCharacters <= 0) return [];
      const clipped = text.slice(0, Math.min(260, remainingCharacters));
      remainingCharacters -= clipped.length;
      return [{
        direction: message.direction === "INBOUND" ? "MÜŞTƏRİ" : "KOMANDA",
        text: clipped,
      }];
    });
    return messages.length ? [{ index: index + 1, messages }] : [];
  });

  const generatedAt = new Date().toISOString();
  if (usable.length === 0) return { state: "no_data", generatedAt, reason: "Analiz üçün mətnli dialoq yoxdur." };
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
    return { state: "unavailable", generatedAt, reason: "AI xidməti konfiqurasiya edilməyib." };
  }

  const fingerprint = createHash("sha256")
    .update(JSON.stringify(conversations.map((item) => [item.id, item.lastMessageAt, item.messages.map((message) => message.id)])))
    .digest("hex");
  const cached = analysisCache.get(fingerprint);
  if (cached && cached.expiresAt > Date.now()) return { state: "ready", generatedAt, ...cached.value };

  try {
    const { output } = await generateText({
      model: google("gemini-2.5-flash-lite"),
      output: Output.object({ schema: aiAnalysisSchema }),
      temperature: 0.15,
      maxOutputTokens: 3500,
      system: [
        "Sən Artmonia təhsil ERP-si üçün Azərbaycan dilində işləyən customer behavior analitikisən.",
        "Yalnız təqdim edilən Instagram DM dialoqlarına əsaslan; rəqəm və səbəb uydurma.",
        "Nəticələri ayrı-ayrı əməkdaşlara deyil, ümumi komanda səviyyəsində qiymətləndir.",
        "Şəxsi ad, username, telefon və mesaj mətnini nəticədə təkrar etmə.",
        "Faizlər müşahidə olunan conversation-ların payıdır.",
        "Alış niyyəti: qiymət, tarix, qeydiyyat və konkret xidmət soruşanlar yüksək; ümumi maraq orta; əlaqəsiz və qeyri-müəyyən mesajlar aşağıdır.",
        "Cavabsız yüksək niyyətli sayı: son müştəri mesajı yüksək niyyət göstərən və ardınca komanda cavabı olmayan conversation-lardır.",
        "Komanda ballarında ton, ehtiyacın aşkarlanması, cavabın faydalılığı, etirazın idarəsi və konkret qeydiyyat CTA-sını qiymətləndir.",
      ].join("\n"),
      prompt: [
        `Dövr: son ${ANALYSIS_DAYS} gün. Conversation sayı: ${usable.length}.`,
        "Anonimləşdirilmiş dialoqları 4 customer behavior hissəsi və ümumi komanda danışıq keyfiyyəti üzrə analiz et.",
        JSON.stringify(usable),
      ].join("\n\n"),
    });
    analysisCache.clear();
    analysisCache.set(fingerprint, { expiresAt: Date.now() + CACHE_TTL_MS, value: output });
    return { state: "ready", generatedAt, ...output };
  } catch (error) {
    console.error("Instagram DM aggregate AI analysis failed", error instanceof Error ? error.name : "UnknownError");
    return { state: "unavailable", generatedAt, reason: "AI analizi hazırda yenilənə bilmədi." };
  }
}
