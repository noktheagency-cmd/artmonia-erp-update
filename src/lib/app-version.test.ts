import assert from "node:assert/strict";
import test from "node:test";
import { APP_VERSION_STALE_EVENT, hasNewAppVersion, isMissingServerAction } from "./app-version";
import { getAppErrorDetails } from "./app-errors";
import { notifyCaughtError, notifyError, tryCatchWithToast } from "./app-notifications";
import { GET } from "../app/api/version/route";

const missing = new Error('Server Action "7fae913db3f164220089924e01f6b07c966e0881ad" was not found on the server.');

test("recognizes the exact production action error and server variant", () => {
  assert.equal(isMissingServerAction(missing), true);
  assert.equal(isMissingServerAction('Failed to find Server Action "abc". This request might be from an older or newer deployment.'), true);
  for (const error of [null, {}, new Error("Failed to fetch"), "Invoice not found", "Server Action permission denied"]) {
    assert.equal(isMissingServerAction(error), false);
  }
});

test("missing actions get safe localized text without leaking technical IDs", () => {
  const details = getAppErrorDetails(missing);
  assert.equal(details.code, "STALE_APP_VERSION");
  assert.match(details.message, /avtomatik təkrarlanmayacaq/);
  assert.doesNotMatch(details.message, /7fae913|nextjs.org/);
  assert.equal(getAppErrorDetails(new Error("Failed to fetch")).code, "NETWORK_ERROR");
  assert.equal(getAppErrorDetails(new Error("Forbidden")).code, "PERMISSION_ERROR");
});

test("version check uses only an uncached read and detects a different build", async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (url, options) => {
    calls++;
    assert.equal(url, "/api/version");
    assert.equal(options?.method, "GET");
    assert.equal(options?.cache, "no-store");
    assert.equal(options?.credentials, "omit");
    assert.equal(options?.redirect, "error");
    return Response.json({ buildId: "build-b" });
  };
  assert.equal(await hasNewAppVersion("build-a", fetcher), true);
  assert.equal(await hasNewAppVersion("build-b", fetcher), false);
  assert.equal(calls, 2);
});

test("failed or malformed version responses never signal an update", async () => {
  const responses = [
    Response.json({ buildId: "different" }, { status: 500 }),
    Response.json({ buildId: "different" }, { status: 401 }),
    new Response("login", { headers: { "content-type": "text/html" } }),
    new Response("invalid", { headers: { "content-type": "application/json" } }),
    Response.json(null), Response.json({}), Response.json({ buildId: " " }),
    Response.json({ buildId: 42 }),
  ];
  for (const response of responses) {
    assert.equal(await hasNewAppVersion("build-a", async () => response), false);
  }
  assert.equal(await hasNewAppVersion("build-a", async () => { throw new TypeError("offline"); }), false);
  assert.equal(await hasNewAppVersion("", async () => { assert.fail("must not fetch without a build ID"); }), false);
});

test("version endpoint is never cached", async () => {
  const response = GET();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control")!, /no-store/);
  assert.equal(response.headers.get("cdn-cache-control"), "no-store");
  assert.deepEqual(Object.keys(await response.json()), ["buildId"]);
});

test("both error helpers signal recovery and never retry a failed mutation", async () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const events = new EventTarget();
  let staleEvents = 0;
  let mutations = 0;
  events.addEventListener(APP_VERSION_STALE_EVENT, () => staleEvents++);
  Object.defineProperty(globalThis, "window", { configurable: true, value: events });
  try {
    notifyError(missing);
    assert.match(notifyCaughtError(missing), /avtomatik təkrarlanmayacaq/);
    const result = await tryCatchWithToast(async () => { mutations++; throw missing; });
    assert.equal(result, undefined);
    assert.equal(mutations, 1);
    assert.equal(staleEvents, 3);
  } finally {
    if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
});
