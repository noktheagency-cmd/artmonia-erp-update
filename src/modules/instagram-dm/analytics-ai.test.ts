import assert from "node:assert/strict";
import test from "node:test";
import {
  aggregateConversationClassifications,
  conversationClassificationBatchSchema,
  conversationClassificationOutput,
  normalizeConversationClassification,
  type ConversationClassification,
} from "@/modules/instagram-dm/analytics-ai";

const base: ConversationClassification = {
  index: 1,
  kind: "CUSTOMER",
  service: "ABILITY_PREP",
  purchaseIntent: "HOT",
  barriers: ["PRICE"],
  outcome: "FOLLOW_UP_REQUIRED",
  needsReply: true,
  teamRatings: {
    professionalism: 5,
    needDiscovery: 4,
    answerQuality: 4,
    objectionHandling: null,
    registrationDirection: 4,
  },
};

test("OpenRouter JSON rejimi istifadə edir, nəticə yenə sərt sxemlə yoxlanır", async () => {
  assert.deepEqual(await conversationClassificationOutput(true).responseFormat, { type: "json" });
  assert.ok("schema" in await conversationClassificationOutput(false).responseFormat);
  assert.equal(conversationClassificationBatchSchema.safeParse({ conversations: [base] }).success, true);
  assert.equal(conversationClassificationBatchSchema.safeParse({ conversations: [{ ...base, index: 0 }] }).success, false);
  assert.equal(conversationClassificationBatchSchema.safeParse({ conversations: [{ ...base, purchaseIntent: "INVALID" }] }).success, false);
  assert.equal(conversationClassificationBatchSchema.safeParse({ conversations: [{ ...base, teamRatings: { ...base.teamRatings, professionalism: 6 } }] }).success, false);
  assert.equal(conversationClassificationBatchSchema.safeParse({ conversations: [] }).success, false);
});

test("workshop/masterclass ümumi kurs marketinqinin davranış faizlərindən çıxarılır", () => {
  const workshop = normalizeConversationClassification({ ...base, kind: "WORKSHOP" }, { lastDirection: "MÜŞTƏRİ", hasTeamMessage: true });
  const analysis = aggregateConversationClassifications([base, workshop], { responseRate: 50, medianFirstResponseMinutes: 10 });
  assert.equal(analysis.customerConversations, 1);
  assert.equal(analysis.excludedConversations, 1);
  assert.equal(workshop.teamRatings, null);
});

test("HR və əlaqəsiz dialoqlar customer behavior faizlərindən çıxarılır", () => {
  const analysis = aggregateConversationClassifications([
    base,
    { ...base, index: 2, purchaseIntent: "WARM", barriers: [], needsReply: false },
    { ...base, index: 3, kind: "HR", service: null, purchaseIntent: null, barriers: [], outcome: "NOT_CUSTOMER", needsReply: false },
  ], { responseRate: 90, medianFirstResponseMinutes: 20 });

  assert.equal(analysis.analyzedConversations, 3);
  assert.equal(analysis.customerConversations, 2);
  assert.equal(analysis.excludedConversations, 1);
  assert.deepEqual(analysis.purchaseIntent, { hot: 50, warm: 50, cold: 0 });
  assert.equal(analysis.serviceInterest[0]?.percentage, 100);
});

test("1–5 komanda reytinqi 0–100 şkalasına çevrilir", () => {
  const analysis = aggregateConversationClassifications([
    base,
    { ...base, index: 2, needsReply: false, teamRatings: { ...base.teamRatings!, professionalism: 4 } },
  ], { responseRate: 80, medianFirstResponseMinutes: 120 });

  assert.equal(analysis.teamScores.professionalism, 90);
  assert.equal(analysis.teamScores.answerQuality, 80);
  assert.equal(analysis.teamScores.objectionHandling, 0);
  assert.equal(analysis.highIntentUnanswered, 1);
  assert.equal(analysis.incompleteDialogs, 1);
});

test("tövsiyələr yalnız ölçülən həddi keçən mövzulara əsaslanır", () => {
  const classifications = Array.from({ length: 10 }, (_, index): ConversationClassification => ({
    ...base,
    index: index + 1,
    purchaseIntent: index === 0 ? "HOT" : "WARM",
    barriers: index === 0 ? ["ONLINE"] : [],
    needsReply: false,
  }));
  const analysis = aggregateConversationClassifications(classifications, {
    responseRate: 95,
    medianFirstResponseMinutes: 30,
  });

  assert.equal(analysis.recommendations.some((item) => /Onlayn/i.test(item)), false);
  assert.equal(analysis.recommendations.some((item) => /Cavab faizi 95%/i.test(item)), true);
});

test("AI nəticəsi dialoq istiqamətinə və cavab keyfiyyətinə görə normallaşdırılır", () => {
  const answered = normalizeConversationClassification({
    ...base,
    outcome: "NO_RESOLUTION",
    needsReply: true,
    teamRatings: { ...base.teamRatings!, answerQuality: 3 },
  }, { lastDirection: "KOMANDA", hasTeamMessage: true });
  assert.equal(answered.needsReply, false);
  assert.equal(answered.outcome, "INFO_PROVIDED");

  const hr = normalizeConversationClassification({ ...base, kind: "HR" }, {
    lastDirection: "MÜŞTƏRİ",
    hasTeamMessage: true,
  });
  assert.equal(hr.purchaseIntent, null);
  assert.equal(hr.outcome, "NOT_CUSTOMER");
  assert.equal(hr.teamRatings, null);
});
