import { ingestInstagramDmWebhook } from "@/modules/instagram-dm/ingestion";
import {
  parseMetaInstagramWebhook,
  secureTextEquals,
  verifyMetaWebhookSignature,
} from "@/modules/instagram-dm/webhook-payload";
import { getEnv, requireEnv } from "@/server/env";
import { ZodError } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WEBHOOK_BYTES = 2 * 1024 * 1024;
const noStoreHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  let expectedToken: string;
  try {
    expectedToken = requireEnv("META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN");
  } catch {
    return Response.json({ error: "Instagram webhook konfiqurasiya edilməyib." }, { status: 503, headers: noStoreHeaders });
  }

  if (mode !== "subscribe" || !challenge || !secureTextEquals(token, expectedToken)) {
    return Response.json({ error: "Webhook təsdiqlənmədi." }, { status: 403, headers: noStoreHeaders });
  }

  return new Response(challenge, {
    status: 200,
    headers: { ...noStoreHeaders, "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WEBHOOK_BYTES) {
    return Response.json({ error: "Webhook payload çox böyükdür." }, { status: 413, headers: noStoreHeaders });
  }

  const rawBody = new Uint8Array(await request.arrayBuffer());
  if (rawBody.byteLength > MAX_WEBHOOK_BYTES) {
    return Response.json({ error: "Webhook payload çox böyükdür." }, { status: 413, headers: noStoreHeaders });
  }

  let appSecret: string;
  try {
    appSecret = requireEnv("META_APP_SECRET");
  } catch {
    return Response.json({ error: "Instagram webhook konfiqurasiya edilməyib." }, { status: 503, headers: noStoreHeaders });
  }

  if (!verifyMetaWebhookSignature(rawBody, request.headers.get("x-hub-signature-256"), appSecret)) {
    return Response.json({ error: "Webhook imzası etibarsızdır." }, { status: 401, headers: noStoreHeaders });
  }

  let payload;
  try {
    payload = parseMetaInstagramWebhook(rawBody);
  } catch (error) {
    const issues = error instanceof ZodError
      ? error.issues.map((issue) => ({
          code: issue.code,
          path: issue.path.join("."),
        }))
      : [{
          code: error instanceof SyntaxError ? "invalid_json" : "unknown_parse_error",
          path: "",
        }];
    console.warn(`Instagram webhook payload parse failed ${JSON.stringify({
      issues,
      shape: summarizeWebhookShape(rawBody),
    })}`);
    return Response.json({ error: "Webhook payload düzgün deyil." }, { status: 400, headers: noStoreHeaders });
  }

  try {
    const env = getEnv();
    await ingestInstagramDmWebhook({
      payload,
      rawBody,
      expectedAccountId:
        env.META_INSTAGRAM_WEBHOOK_ACCOUNT_ID ?? env.META_INSTAGRAM_ACCOUNT_ID,
    });
    return new Response("EVENT_RECEIVED", {
      status: 200,
      headers: { ...noStoreHeaders, "Content-Type": "text/plain; charset=utf-8" },
    });
  } catch (error) {
    console.error("Instagram DM webhook ingestion failed", error);
    return Response.json({ error: "Webhook məlumatı saxlanmadı." }, { status: 500, headers: noStoreHeaders });
  }
}

function summarizeWebhookShape(rawBody: Uint8Array) {
  try {
    const payload = JSON.parse(Buffer.from(rawBody).toString("utf8")) as Record<string, unknown>;
    const entry = Array.isArray(payload.entry) ? payload.entry[0] : undefined;
    const entryObject = isRecord(entry) ? entry : undefined;
    const messaging = Array.isArray(entryObject?.messaging) ? entryObject.messaging[0] : undefined;
    const event = isRecord(messaging) ? messaging : undefined;

    return {
      entryKeys: entryObject ? Object.keys(entryObject).sort() : [],
      eventKeys: event ? Object.keys(event).sort() : [],
      recipient: valueShape(event?.recipient),
      sender: valueShape(event?.sender),
    };
  } catch {
    return { invalidJson: true };
  }
}

function valueShape(value: unknown) {
  if (Array.isArray(value)) return { type: "array", keys: [] };
  if (isRecord(value)) return { type: "object", keys: Object.keys(value).sort() };
  if (value === null) return { type: "null", keys: [] };
  return { type: typeof value, keys: [] };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
