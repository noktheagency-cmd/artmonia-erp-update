import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedBrowserMutation } from "./request-origin";
test("cookie API mutations deny cross-origin and missing Origin", () => {
  const check = (origin?: string, site?: string) => isAllowedBrowserMutation("POST", "/api/tasks", new Headers({...origin ? {origin} : {}, ...site ? {"sec-fetch-site":site} : {}}), "https://erp.artmoniya.com");
  assert.equal(check(), false);
  assert.equal(check("null"), false);
  assert.equal(check("https://evil.test"), false);
  assert.equal(check("https://erp.artmoniya.com.evil.test"), false);
  assert.equal(check("https://erp.artmoniya.com"), true);
  assert.equal(check("https://erp.artmoniya.com", "cross-site"), false);
  assert.equal(isAllowedBrowserMutation("POST", "/api/cron/task-deadlines", new Headers(), "https://erp.artmoniya.com"), true);
});
