import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  extractInstagramDmMessages,
  parseMetaInstagramWebhook,
  secureTextEquals,
  verifyMetaWebhookSignature,
  webhookPayloadHash,
} from "@/modules/instagram-dm/webhook-payload";

const inboundPayload = {
  object: "instagram",
  entry: [{
    id: "17841400000000000",
    time: 1787751000000,
    messaging: [{
      sender: { id: "987654321" },
      recipient: { id: "17841400000000000" },
      timestamp: 1787750999000,
      message: {
        mid: "mid.inbound.1",
        text: "Yağlı boya kursunun qiyməti nə qədərdir?",
        quick_reply: { payload: "COURSE_OIL_PAINTING" },
      },
    }],
  }],
};

test("Meta webhook signature raw body üzərində yoxlanılır", () => {
  const rawBody = Buffer.from(JSON.stringify(inboundPayload));
  const secret = "test-meta-app-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;

  assert.equal(verifyMetaWebhookSignature(rawBody, signature, secret), true);
  assert.equal(verifyMetaWebhookSignature(rawBody, signature, "wrong-secret-value"), false);
  assert.equal(verifyMetaWebhookSignature(rawBody, null, secret), false);
  assert.equal(webhookPayloadHash(rawBody).length, 64);
});

test("verification token sabit vaxt müqayisəsi ilə yoxlanılır", () => {
  assert.equal(secureTextEquals("verify-token-123", "verify-token-123"), true);
  assert.equal(secureTextEquals("verify-token-321", "verify-token-123"), false);
  assert.equal(secureTextEquals(null, "verify-token-123"), false);
});

test("gələn Instagram mesajı participant və istiqamət ilə çıxarılır", () => {
  const payload = parseMetaInstagramWebhook(JSON.stringify(inboundPayload));
  const messages = extractInstagramDmMessages(payload, "17841400000000000");

  assert.equal(messages.length, 1);
  assert.deepEqual(messages[0], {
    accountMetaId: "17841400000000000",
    participantScopedId: "987654321",
    participantUsername: null,
    senderId: "987654321",
    recipientId: "17841400000000000",
    metaMessageId: "mid.inbound.1",
    direction: "INBOUND",
    kind: "QUICK_REPLY",
    eventType: "message",
    text: "Yağlı boya kursunun qiyməti nə qədərdir?",
    sentAt: new Date(1787750999000),
    isEcho: false,
    isSelf: false,
    isDeleted: false,
    isUnsupported: false,
    replyToMetaMessageId: null,
    quickReplyPayload: "COURSE_OIL_PAINTING",
    editCount: 0,
    attachments: undefined,
    referral: undefined,
    rawMetadata: {
      eventType: "message",
      senderId: "987654321",
      recipientId: "17841400000000000",
    },
  });
});

test("gedən echo, media və message edit event-ləri normallaşdırılır", () => {
  const payload = parseMetaInstagramWebhook(JSON.stringify({
    object: "instagram",
    entry: [{
      id: "17841400000000000",
      messaging: [
        {
          sender: { id: "17841400000000000" },
          recipient: { id: "987654321" },
          timestamp: "1787751000000",
          message: {
            mid: "mid.outbound.1",
            is_echo: true,
            attachments: [{ type: "image", payload: { url: "https://example.com/image.jpg" } }],
          },
        },
        {
          sender: { id: "987654321" },
          recipient: { id: "17841400000000000" },
          timestamp: 1787751010000,
          message_edit: {
            mid: "mid.inbound.1",
            text: "Yağlı boya kursunun aylıq qiyməti nə qədərdir?",
            num_edit: "2",
          },
        },
      ],
    }],
  }));

  const messages = extractInstagramDmMessages(payload);
  assert.equal(messages[0].direction, "OUTBOUND");
  assert.equal(messages[0].participantScopedId, "987654321");
  assert.equal(messages[0].kind, "MEDIA");
  assert.equal(messages[1].eventType, "message_edit");
  assert.equal(messages[1].editCount, 2);
});

test("başqa Instagram hesabına gələn və Instagram olmayan payload ignore edilir", () => {
  const payload = parseMetaInstagramWebhook(JSON.stringify(inboundPayload));
  assert.deepEqual(extractInstagramDmMessages(payload, "different-account"), []);

  const pagePayload = parseMetaInstagramWebhook(JSON.stringify({ object: "page", entry: [] }));
  assert.deepEqual(extractInstagramDmMessages(pagePayload), []);
});

test("sender və recipient olmayan read event-i payload-u pozmadan ignore edilir", () => {
  const payload = parseMetaInstagramWebhook(JSON.stringify({
    object: "instagram",
    entry: [{
      id: "17841400000000000",
      time: 1787751020000,
      messaging: [{
        timestamp: 1787751020000,
        read: { mid: "mid.inbound.1" },
      }],
    }],
  }));

  assert.deepEqual(extractInstagramDmMessages(payload), []);
});
