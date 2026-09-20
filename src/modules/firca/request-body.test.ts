import assert from "node:assert/strict";
import test from "node:test";
import { boundedBody } from "./request-body";
test("body cap covers missing and misleading content length", async () => {
  assert.equal(new TextDecoder().decode(await boundedBody(new Request("https://example.test", {method:"POST",body:"hello"}), 5)), "hello");
  await assert.rejects(boundedBody(new Request("https://example.test", {method:"POST",body:"toolong",headers:{"Content-Length":"1"}}), 3), /çox böyükdür/);
});
