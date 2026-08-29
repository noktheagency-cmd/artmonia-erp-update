import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const idSchema = z.union([z.string().min(1), z.number().int().nonnegative()]).transform(String);
const timestampSchema = z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).transform(Number);
const jsonObjectSchema = z.record(z.string(), z.unknown());

const messageSchema = z.object({
  mid: z.string().min(1),
  text: z.string().optional(),
  is_echo: z.boolean().optional(),
  is_self: z.boolean().optional(),
  is_deleted: z.boolean().optional(),
  is_unsupported: z.boolean().optional(),
  quick_reply: z.object({ payload: z.string().optional() }).passthrough().optional(),
  reply_to: jsonObjectSchema.optional(),
  attachments: z.array(z.unknown()).optional(),
  referral: jsonObjectSchema.optional(),
}).passthrough();

const messageEditSchema = z.object({
  mid: z.string().min(1),
  text: z.string().optional(),
  num_edit: z.union([z.number().int().nonnegative(), z.string().regex(/^\d+$/)]).transform(Number).optional(),
}).passthrough();

const postbackSchema = z.object({
  mid: z.string().min(1),
  title: z.string().optional(),
  payload: z.string().optional(),
}).passthrough();

const actorSchema = z.object({
  id: idSchema,
  username: z.string().optional(),
}).passthrough();

const messagingSchema = z.object({
  sender: actorSchema.optional(),
  recipient: actorSchema.optional(),
  timestamp: timestampSchema,
  message: messageSchema.optional(),
  message_edit: messageEditSchema.optional(),
  postback: postbackSchema.optional(),
}).passthrough();

const entrySchema = z.object({
  id: idSchema,
  time: timestampSchema.optional(),
  messaging: z.array(messagingSchema).optional().default([]),
}).passthrough();

const webhookSchema = z.object({
  object: z.string().min(1),
  entry: z.array(entrySchema).optional().default([]),
}).passthrough();

export type MetaInstagramWebhookPayload = z.infer<typeof webhookSchema>;

export type ParsedInstagramDmMessage = {
  accountMetaId: string;
  participantScopedId: string;
  participantUsername: string | null;
  senderId: string;
  recipientId: string;
  metaMessageId: string;
  direction: "INBOUND" | "OUTBOUND";
  kind: "TEXT" | "MEDIA" | "QUICK_REPLY" | "POSTBACK" | "UNSUPPORTED";
  eventType: "message" | "message_edit" | "postback";
  text: string | null;
  sentAt: Date;
  isEcho: boolean;
  isSelf: boolean;
  isDeleted: boolean;
  isUnsupported: boolean;
  replyToMetaMessageId: string | null;
  quickReplyPayload: string | null;
  editCount: number;
  attachments?: unknown[];
  referral?: Record<string, unknown>;
  rawMetadata: Record<string, unknown>;
};

export function parseMetaInstagramWebhook(rawBody: Uint8Array | string) {
  const text = typeof rawBody === "string" ? rawBody : Buffer.from(rawBody).toString("utf8");
  return webhookSchema.parse(JSON.parse(text));
}

export function extractInstagramDmMessages(
  payload: MetaInstagramWebhookPayload,
  expectedAccountId?: string,
) {
  if (payload.object !== "instagram") return [];

  const messages: ParsedInstagramDmMessage[] = [];
  for (const entry of payload.entry) {
    if (expectedAccountId && entry.id !== expectedAccountId) continue;

    for (const event of entry.messaging) {
      const parsed = parseMessagingEvent(entry.id, event);
      if (parsed) messages.push(parsed);
    }
  }

  return messages;
}

export function verifyMetaWebhookSignature(
  rawBody: Uint8Array | string,
  signatureHeader: string | null,
  appSecret: string,
) {
  if (!signatureHeader?.startsWith("sha256=")) return false;

  const suppliedHex = signatureHeader.slice("sha256=".length);
  if (!/^[a-f\d]{64}$/i.test(suppliedHex)) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  const supplied = Buffer.from(suppliedHex, "hex");
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function secureTextEquals(actual: string | null, expected: string) {
  if (actual === null) return false;
  const actualDigest = createHash("sha256").update(actual).digest();
  const expectedDigest = createHash("sha256").update(expected).digest();
  return timingSafeEqual(actualDigest, expectedDigest);
}

export function webhookPayloadHash(rawBody: Uint8Array | string) {
  return createHash("sha256").update(rawBody).digest("hex");
}

function parseMessagingEvent(
  accountMetaId: string,
  event: z.infer<typeof messagingSchema>,
): ParsedInstagramDmMessage | null {
  if (!event.sender || !event.recipient) return null;

  const direction = resolveDirection(accountMetaId, event);
  const participantScopedId = direction === "OUTBOUND" ? event.recipient.id : event.sender.id;
  const participantUsername = direction === "OUTBOUND"
    ? event.recipient.username ?? null
    : event.sender.username ?? null;
  const sentAt = new Date(event.timestamp);
  if (Number.isNaN(sentAt.getTime())) return null;

  if (event.message) {
    const message = event.message;
    const replyToMetaMessageId = stringField(message.reply_to, "mid");
    return {
      accountMetaId,
      participantScopedId,
      participantUsername,
      senderId: event.sender.id,
      recipientId: event.recipient.id,
      metaMessageId: message.mid,
      direction,
      kind: resolveMessageKind(message),
      eventType: "message",
      text: message.is_deleted ? null : message.text ?? null,
      sentAt,
      isEcho: message.is_echo ?? false,
      isSelf: message.is_self ?? false,
      isDeleted: message.is_deleted ?? false,
      isUnsupported: message.is_unsupported ?? false,
      replyToMetaMessageId,
      quickReplyPayload: message.quick_reply?.payload ?? null,
      editCount: 0,
      attachments: message.attachments,
      referral: message.referral,
      rawMetadata: {
        eventType: "message",
        senderId: event.sender.id,
        recipientId: event.recipient.id,
      },
    };
  }

  if (event.message_edit) {
    return {
      accountMetaId,
      participantScopedId,
      participantUsername,
      senderId: event.sender.id,
      recipientId: event.recipient.id,
      metaMessageId: event.message_edit.mid,
      direction,
      kind: "TEXT",
      eventType: "message_edit",
      text: event.message_edit.text ?? null,
      sentAt,
      isEcho: direction === "OUTBOUND",
      isSelf: false,
      isDeleted: false,
      isUnsupported: false,
      replyToMetaMessageId: null,
      quickReplyPayload: null,
      editCount: event.message_edit.num_edit ?? 1,
      rawMetadata: {
        eventType: "message_edit",
        senderId: event.sender.id,
        recipientId: event.recipient.id,
      },
    };
  }

  if (event.postback) {
    return {
      accountMetaId,
      participantScopedId,
      participantUsername,
      senderId: event.sender.id,
      recipientId: event.recipient.id,
      metaMessageId: event.postback.mid,
      direction,
      kind: "POSTBACK",
      eventType: "postback",
      text: event.postback.title ?? null,
      sentAt,
      isEcho: direction === "OUTBOUND",
      isSelf: false,
      isDeleted: false,
      isUnsupported: false,
      replyToMetaMessageId: null,
      quickReplyPayload: event.postback.payload ?? null,
      editCount: 0,
      rawMetadata: {
        eventType: "postback",
        senderId: event.sender.id,
        recipientId: event.recipient.id,
      },
    };
  }

  return null;
}

function resolveDirection(
  accountMetaId: string,
  event: z.infer<typeof messagingSchema>,
): "INBOUND" | "OUTBOUND" {
  if (event.sender?.id === accountMetaId || event.message?.is_echo) return "OUTBOUND";
  return "INBOUND";
}

function resolveMessageKind(message: z.infer<typeof messageSchema>): ParsedInstagramDmMessage["kind"] {
  if (message.is_unsupported) return "UNSUPPORTED";
  if (message.quick_reply) return "QUICK_REPLY";
  if (message.attachments?.length) return "MEDIA";
  return "TEXT";
}

function stringField(object: Record<string, unknown> | undefined, key: string) {
  const value = object?.[key];
  return typeof value === "string" ? value : null;
}
