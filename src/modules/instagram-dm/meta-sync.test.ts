import assert from "node:assert/strict";
import test from "node:test";
import { buildBackfillPayload } from "@/modules/instagram-dm/meta-sync";
import {
  extractInstagramDmMessages,
  parseMetaInstagramWebhook,
  webhookPayloadHash,
} from "@/modules/instagram-dm/webhook-payload";

test("Conversations API mesajları webhook ilə eyni formata çevrilir", () => {
  const rawBody = buildBackfillPayload("17841400000000000", [
    {
      id: "history.inbound.1",
      created_time: "2026-08-25T18:30:00+0000",
      from: { id: "99887766", username: "art_student" },
      to: { data: [{ id: "17841400000000000", username: "artmonia" }] },
      message: "Qabiliyyət hazırlığı hansı günlərdir?",
      is_unsupported: false,
    },
    {
      id: "history.outbound.1",
      created_time: "2026-08-25T18:35:00+0000",
      from: { id: "17841400000000000", username: "artmonia" },
      to: { data: [{ id: "99887766", username: "art_student" }] },
      message: "Salam, uyğun qrafiki göndərirəm.",
      is_unsupported: false,
    },
  ]);

  assert.ok(rawBody);
  const messages = extractInstagramDmMessages(parseMetaInstagramWebhook(rawBody));
  assert.equal(messages.length, 2);
  assert.equal(messages[0].direction, "INBOUND");
  assert.equal(messages[0].participantUsername, "art_student");
  assert.equal(messages[1].direction, "OUTBOUND");
  assert.equal(messages[1].participantScopedId, "99887766");
});

test("eyni history batch eyni payload hash yaradır", () => {
  const messages = [{
    id: "history.stable.1",
    created_time: "2026-08-25T18:30:00+0000",
    from: { id: "99887766" },
    to: { data: [{ id: "17841400000000000" }] },
    message: "Salam",
  }];
  const first = buildBackfillPayload("17841400000000000", messages);
  const second = buildBackfillPayload("17841400000000000", messages);

  assert.ok(first);
  assert.ok(second);
  assert.equal(webhookPayloadHash(first), webhookPayloadHash(second));
});

test("sender və recipient olmayan history mesajı saxlanmır", () => {
  const rawBody = buildBackfillPayload("17841400000000000", [{
    id: "history.invalid.1",
    created_time: "2026-08-25T18:30:00+0000",
    message: "Incomplete",
  }]);
  assert.equal(rawBody, null);
});
