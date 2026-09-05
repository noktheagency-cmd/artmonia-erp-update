import assert from "node:assert/strict";
import test from "node:test";
import { bakuAnalysisDay, createAnalysisBatches, dmProviderOptions, redactDmContactDetails, safeAnalysisError } from "./analysis-policy";

test("gündəlik açar UTC deyil, Bakı gecəyarısında dəyişir", () => {
  assert.equal(bakuAnalysisDay(new Date("2026-09-05T19:59:59Z")), "2026-09-05");
  assert.equal(bakuAnalysisDay(new Date("2026-09-05T20:00:00Z")), "2026-09-06");
});
test("ZDR Gemini üçün dəstəklənməyən temperature göndərilmir", () => {
  assert.equal("temperature" in dmProviderOptions(true), false);
  assert.equal(dmProviderOptions(false).temperature, 0);
});
test("120-dən çox dialoq itirilmədən kiçik paketlərə bölünür", () => {
  const conversations = Array.from({ length: 153 }, (_, index) => ({ index: index + 1, messages: [{ direction: "MÜŞTƏRİ" as const, text: "Rəsm kursu haqqında məlumat istəyirəm" }] }));
  const batches = createAnalysisBatches(conversations);
  assert.deepEqual(batches.flat(), conversations);
  assert.ok(batches.every((batch) => batch.length <= 10));
});
test("uzun dialoq səssizcə kəsilmir", () => {
  assert.throws(() => createAnalysisBatches([{ index: 1, messages: [{ direction: "MÜŞTƏRİ", text: "x".repeat(60_001) }] }]), { name: "DmContextLimitError" });
});
test("xəta mətnindən sirr və şəxsi məlumat loga daşınmır", () => {
  const error = { statusCode: 402, message: "secret-key private conversation" };
  assert.deepEqual(safeAnalysisError(error), { code: "HTTP_402", reason: "OpenRouter balansı və ya açarın xərc limiti kifayət etmir." });
  assert.ok(!JSON.stringify(safeAnalysisError(error)).includes("secret-key"));
  assert.equal(safeAnalysisError({ statusCode: 404 }).code, "HTTP_404");
});
test("əlaqə məlumatı gizlənir, qısa mesaj süni qısaldılmır", () => {
  const value = redactDmContactDetails("Email: a@example.com, telefon +994 50 123 45 67. https://example.com/user Qiymət 150 AZN");
  assert.ok(!value.includes("a@example.com"));
  assert.ok(!value.includes("123 45 67"));
  assert.ok(value.includes("Qiymət 150 AZN"));
});
