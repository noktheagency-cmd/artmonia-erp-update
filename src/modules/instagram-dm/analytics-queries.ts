import { Prisma } from "@/generated/prisma/client";
import { requireErpActor } from "@/server/auth/actor";
import { getPrisma } from "@/server/db/prisma";
import { getEnv } from "@/server/env";

export type InstagramDmAnalyticsMessage = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  kind: string;
  text: string;
  sentAt: string;
  isDeleted: boolean;
};

export type InstagramDmAnalyticsConversation = {
  id: string;
  participantLabel: string;
  participantHandle: string;
  firstMessageAt: string;
  lastMessageAt: string;
  messageCount: number;
  inboundCount: number;
  outboundCount: number;
  preview: string;
  messages: InstagramDmAnalyticsMessage[];
};

export type InstagramDmAnalyticsData = {
  account: {
    connected: boolean;
    username: string;
    lastWebhookAt: string;
  };
  summary: {
    conversations: number;
    participants: number;
    messages: number;
    inboundMessages: number;
    outboundMessages: number;
    answeredConversations: number;
    medianFirstResponseMinutes: number | null;
    peakInboundHour: number | null;
  };
  conversations: InstagramDmAnalyticsConversation[];
  generatedAt: string;
};

type ResponseSummaryRow = {
  answeredConversations: number;
  medianFirstResponseMinutes: number | null;
};

type PeakHourRow = {
  hour: number;
};

export async function getInstagramDmAnalyticsData(): Promise<InstagramDmAnalyticsData> {
  await requireErpActor("marketing.read");

  const prisma = getPrisma();
  const env = getEnv();
  const [
    accounts,
    conversationCount,
    participantCount,
    messageCount,
    inboundMessages,
    outboundMessages,
    responseSummary,
    peakHourRows,
    conversations,
  ] = await Promise.all([
    prisma.instagramDmAccount.findMany({
      where: { isActive: true },
      orderBy: { lastWebhookAt: "desc" },
      take: 1,
      select: { username: true, lastWebhookAt: true },
    }),
    prisma.instagramDmConversation.count(),
    prisma.instagramDmParticipant.count(),
    prisma.instagramDmMessage.count({ where: { isDeleted: false } }),
    prisma.instagramDmMessage.count({ where: { direction: "INBOUND", isDeleted: false } }),
    prisma.instagramDmMessage.count({ where: { direction: "OUTBOUND", isDeleted: false } }),
    prisma.$queryRaw<ResponseSummaryRow[]>(Prisma.sql`
      with first_inbound as (
        select
          conversation_id,
          min(sent_at) as first_inbound_at
        from erp.instagram_dm_messages
        where direction = 'INBOUND'
          and is_deleted = false
        group by conversation_id
      ), first_response as (
        select
          inbound.conversation_id,
          inbound.first_inbound_at,
          min(message.sent_at) as first_outbound_at
        from first_inbound inbound
        left join erp.instagram_dm_messages message
          on message.conversation_id = inbound.conversation_id
          and message.direction = 'OUTBOUND'
          and message.is_deleted = false
          and message.sent_at >= inbound.first_inbound_at
        group by inbound.conversation_id, inbound.first_inbound_at
      )
      select
        count(first_outbound_at)::int as "answeredConversations",
        (
          percentile_cont(0.5) within group (
            order by extract(epoch from (first_outbound_at - first_inbound_at)) / 60
          ) filter (where first_outbound_at is not null)
        )::float8 as "medianFirstResponseMinutes"
      from first_response
    `),
    prisma.$queryRaw<PeakHourRow[]>(Prisma.sql`
      select
        extract(hour from sent_at + interval '4 hours')::int as hour
      from erp.instagram_dm_messages
      where direction = 'INBOUND'
        and is_deleted = false
      group by hour
      order by count(*) desc, hour asc
      limit 1
    `),
    prisma.instagramDmConversation.findMany({
      orderBy: [{ lastMessageAt: "desc" }, { id: "asc" }],
      take: 100,
      include: {
        participant: {
          select: {
            displayName: true,
            username: true,
            scopedUserId: true,
          },
        },
        messages: {
          where: { isDeleted: false },
          orderBy: [{ sentAt: "asc" }, { id: "asc" }],
          take: 200,
          select: {
            id: true,
            direction: true,
            kind: true,
            text: true,
            sentAt: true,
            isDeleted: true,
          },
        },
      },
    }),
  ]);

  const account = accounts[0];

  return {
    account: {
      connected: Boolean(env.META_INSTAGRAM_ACCESS_TOKEN && env.META_APP_SECRET),
      username: account?.username || "artmoniya.academy",
      lastWebhookAt: account?.lastWebhookAt.toISOString() ?? "",
    },
    summary: {
      conversations: conversationCount,
      participants: participantCount,
      messages: messageCount,
      inboundMessages,
      outboundMessages,
      answeredConversations: responseSummary[0]?.answeredConversations ?? 0,
      medianFirstResponseMinutes: responseSummary[0]?.medianFirstResponseMinutes ?? null,
      peakInboundHour: peakHourRows[0]?.hour ?? null,
    },
    conversations: conversations.map((conversation) => {
      const latestMessage = conversation.messages.at(-1);
      return {
        id: conversation.id,
        participantLabel: participantLabel(conversation.participant),
        participantHandle: participantHandle(conversation.participant),
        firstMessageAt: conversation.firstMessageAt.toISOString(),
        lastMessageAt: conversation.lastMessageAt.toISOString(),
        messageCount: conversation.messageCount,
        inboundCount: conversation.inboundCount,
        outboundCount: conversation.outboundCount,
        preview: messagePreview(latestMessage),
        messages: conversation.messages.map((message) => ({
          id: message.id,
          direction: message.direction,
          kind: message.kind,
          text: messagePreview(message),
          sentAt: message.sentAt.toISOString(),
          isDeleted: message.isDeleted,
        })),
      };
    }),
    generatedAt: new Date().toISOString(),
  };
}

function participantLabel(participant: {
  displayName: string | null;
  username: string | null;
  scopedUserId: string;
}) {
  return participant.displayName || (participant.username ? `@${participant.username}` : "Instagram istifadəçisi");
}

function participantHandle(participant: {
  displayName: string | null;
  username: string | null;
  scopedUserId: string;
}) {
  if (participant.username) return `@${participant.username}`;
  return `••${participant.scopedUserId.slice(-4)}`;
}

function messagePreview(message: {
  kind: string;
  text: string | null;
  isDeleted: boolean;
} | undefined) {
  if (!message) return "Mesaj yoxdur";
  if (message.isDeleted) return "Silinmiş mesaj";
  if (message.text?.trim()) return message.text.trim();

  return {
    MEDIA: "Media faylı",
    QUICK_REPLY: "Sürətli cavab",
    POSTBACK: "Postback",
    UNSUPPORTED: "Dəstəklənməyən mesaj",
  }[message.kind] ?? "Mesaj";
}
