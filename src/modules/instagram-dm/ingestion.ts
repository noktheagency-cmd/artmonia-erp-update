import {
  InstagramDmAnalysisStatus,
  InstagramDmProcessingStatus,
  Prisma,
} from "@/generated/prisma/client";
import { getPrisma } from "@/server/db/prisma";
import {
  extractInstagramDmMessages,
  type MetaInstagramWebhookPayload,
  type ParsedInstagramDmMessage,
  webhookPayloadHash,
} from "@/modules/instagram-dm/webhook-payload";

export type InstagramDmIngestionResult = {
  duplicate: boolean;
  receivedMessages: number;
  insertedMessages: number;
  updatedMessages: number;
  ignoredMessages: number;
};

export async function ingestInstagramDmWebhook(input: {
  payload: MetaInstagramWebhookPayload;
  rawBody: Uint8Array;
  expectedAccountId?: string;
}): Promise<InstagramDmIngestionResult> {
  const prisma = getPrisma();
  const payloadHash = webhookPayloadHash(input.rawBody);
  const existing = await prisma.instagramDmWebhookEvent.findUnique({
    where: { payloadHash },
    select: { id: true, status: true },
  });

  if (
    existing?.status === InstagramDmProcessingStatus.PROCESSED ||
    existing?.status === InstagramDmProcessingStatus.IGNORED
  ) {
    return emptyResult(true);
  }

  const webhookEvent = await prisma.instagramDmWebhookEvent.upsert({
    where: { payloadHash },
    create: {
      payloadHash,
      objectType: input.payload.object.slice(0, 40),
      entryCount: input.payload.entry.length,
      payload: toJson(input.payload),
    },
    update: {
      payload: toJson(input.payload),
      status: InstagramDmProcessingStatus.RECEIVED,
      errorMessage: null,
      processedAt: null,
    },
    select: { id: true },
  });

  const parsedMessages = extractInstagramDmMessages(input.payload, input.expectedAccountId)
    .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());

  if (parsedMessages.length === 0) {
    await prisma.instagramDmWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: InstagramDmProcessingStatus.IGNORED,
        processedAt: new Date(),
      },
    });
    return emptyResult(false);
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      let insertedMessages = 0;
      let updatedMessages = 0;

      for (const message of parsedMessages) {
        const outcome = await ingestMessage(tx, webhookEvent.id, message);
        insertedMessages += outcome === "inserted" ? 1 : 0;
        updatedMessages += outcome === "updated" ? 1 : 0;
      }

      await tx.instagramDmWebhookEvent.update({
        where: { id: webhookEvent.id },
        data: {
          status: InstagramDmProcessingStatus.PROCESSED,
          processedAt: new Date(),
        },
      });

      return { insertedMessages, updatedMessages };
    });

    return {
      duplicate: false,
      receivedMessages: parsedMessages.length,
      insertedMessages: result.insertedMessages,
      updatedMessages: result.updatedMessages,
      ignoredMessages: parsedMessages.length - result.insertedMessages - result.updatedMessages,
    };
  } catch (error) {
    await prisma.instagramDmWebhookEvent.update({
      where: { id: webhookEvent.id },
      data: {
        status: InstagramDmProcessingStatus.FAILED,
        errorMessage: errorMessage(error),
        processedAt: new Date(),
      },
    }).catch(() => undefined);
    throw error;
  }
}

async function ingestMessage(
  tx: Prisma.TransactionClient,
  webhookEventId: string,
  message: ParsedInstagramDmMessage,
) {
  const account = await tx.instagramDmAccount.upsert({
    where: { metaAccountId: message.accountMetaId },
    create: {
      metaAccountId: message.accountMetaId,
      firstSeenAt: message.sentAt,
      lastWebhookAt: new Date(),
    },
    update: { lastWebhookAt: new Date(), isActive: true },
    select: { id: true },
  });

  const participant = await tx.instagramDmParticipant.upsert({
    where: {
      accountId_scopedUserId: {
        accountId: account.id,
        scopedUserId: message.participantScopedId,
      },
    },
    create: {
      accountId: account.id,
      scopedUserId: message.participantScopedId,
      username: message.participantUsername,
      firstSeenAt: message.sentAt,
      lastSeenAt: message.sentAt,
    },
    update: message.participantUsername ? { username: message.participantUsername } : {},
    select: { id: true },
  });

  await tx.$executeRaw(Prisma.sql`
    update "erp"."instagram_dm_participants"
    set
      "first_seen_at" = least("first_seen_at", ${message.sentAt}),
      "last_seen_at" = greatest("last_seen_at", ${message.sentAt}),
      "updated_at" = CURRENT_TIMESTAMP
    where "id" = ${participant.id}::uuid
  `);

  const conversation = await tx.instagramDmConversation.upsert({
    where: {
      accountId_participantId: {
        accountId: account.id,
        participantId: participant.id,
      },
    },
    create: {
      accountId: account.id,
      participantId: participant.id,
      firstMessageAt: message.sentAt,
      lastMessageAt: message.sentAt,
      analysisDirtyAt: message.sentAt,
    },
    update: {},
    select: { id: true },
  });

  const inserted = await tx.instagramDmMessage.createMany({
    data: [{
      conversationId: conversation.id,
      webhookEventId,
      metaMessageId: message.metaMessageId,
      direction: message.direction,
      kind: message.kind,
      text: message.text,
      sentAt: message.sentAt,
      isEcho: message.isEcho,
      isSelf: message.isSelf,
      isDeleted: message.isDeleted,
      isUnsupported: message.isUnsupported,
      replyToMetaMessageId: message.replyToMetaMessageId,
      quickReplyPayload: message.quickReplyPayload,
      editCount: message.editCount,
      attachments: optionalJson(message.attachments),
      referral: optionalJson(message.referral),
      rawMetadata: toJson(message.rawMetadata),
    }],
    skipDuplicates: true,
  });

  if (inserted.count === 1) {
    await updateConversationMetrics(tx, conversation.id, message);
    return "inserted" as const;
  }

  if (message.eventType === "message_edit" || message.isDeleted) {
    const current = await tx.instagramDmMessage.findUnique({
      where: { metaMessageId: message.metaMessageId },
      select: { editCount: true },
    });
    const shouldApplyEdit = message.eventType !== "message_edit" || message.editCount >= (current?.editCount ?? 0);

    await tx.instagramDmMessage.updateMany({
      where: { metaMessageId: message.metaMessageId },
      data: {
        webhookEventId,
        ...(message.isDeleted ? { text: null, isDeleted: true } : {}),
        ...(message.eventType === "message_edit" && shouldApplyEdit
          ? { text: message.text, editCount: message.editCount }
          : {}),
      },
    });
    await markConversationDirty(tx, conversation.id);
    return "updated" as const;
  }

  return "ignored" as const;
}

async function updateConversationMetrics(
  tx: Prisma.TransactionClient,
  conversationId: string,
  message: ParsedInstagramDmMessage,
) {
  const inbound = message.direction === "INBOUND" ? 1 : 0;
  const outbound = message.direction === "OUTBOUND" ? 1 : 0;

  await tx.$executeRaw(Prisma.sql`
    update "erp"."instagram_dm_conversations"
    set
      "first_message_at" = least("first_message_at", ${message.sentAt}),
      "last_message_at" = greatest("last_message_at", ${message.sentAt}),
      "last_inbound_at" = case
        when ${inbound} = 1 then greatest(coalesce("last_inbound_at", ${message.sentAt}), ${message.sentAt})
        else "last_inbound_at"
      end,
      "last_outbound_at" = case
        when ${outbound} = 1 then greatest(coalesce("last_outbound_at", ${message.sentAt}), ${message.sentAt})
        else "last_outbound_at"
      end,
      "message_count" = "message_count" + 1,
      "inbound_count" = "inbound_count" + ${inbound},
      "outbound_count" = "outbound_count" + ${outbound},
      "analysis_status" = ${InstagramDmAnalysisStatus.PENDING}::"erp"."InstagramDmAnalysisStatus",
      "analysis_dirty_at" = greatest("analysis_dirty_at", ${message.sentAt}),
      "updated_at" = CURRENT_TIMESTAMP
    where "id" = ${conversationId}::uuid
  `);
}

async function markConversationDirty(tx: Prisma.TransactionClient, conversationId: string) {
  await tx.instagramDmConversation.update({
    where: { id: conversationId },
    data: {
      analysisStatus: InstagramDmAnalysisStatus.PENDING,
      analysisDirtyAt: new Date(),
    },
  });
}

function emptyResult(duplicate: boolean): InstagramDmIngestionResult {
  return {
    duplicate,
    receivedMessages: 0,
    insertedMessages: 0,
    updatedMessages: 0,
    ignoredMessages: 0,
  };
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function optionalJson(value: unknown) {
  return value === undefined ? undefined : toJson(value);
}

function errorMessage(error: unknown) {
  return (error instanceof Error ? error.message : "Unknown Instagram DM ingestion error").slice(0, 800);
}
