import { createHmac } from "node:crypto";
import { ingestInstagramDmWebhook } from "@/modules/instagram-dm/ingestion";
import { parseMetaInstagramWebhook } from "@/modules/instagram-dm/webhook-payload";
import { getEnv, requireEnv } from "@/server/env";
import { isInvalidMetaAppSecretProof } from "@/modules/meta/appsecret-proof";

const META_INSTAGRAM_HOST = "graph.instagram.com";
const META_PAGE_LIMIT = 100;
const MAX_META_PAGES = 20;
const CONVERSATION_BATCH_SIZE = 5;

type MetaConversation = {
  id: string;
  updated_time?: string;
};

type MetaMessage = {
  id: string;
  created_time: string;
  from?: { id?: string; username?: string };
  to?: { data?: Array<{ id?: string; username?: string }> };
  message?: string;
  is_unsupported?: boolean;
};

type MetaPage<T> = {
  data?: T[];
  paging?: { next?: string };
  error?: { message?: string; code?: number; error_subcode?: number };
};

type MetaConversationMessages = {
  id?: string;
  messages?: MetaPage<MetaMessage>;
  error?: MetaPage<never>["error"];
};

export type InstagramDmSyncResult = {
  conversations: number;
  fetchedMessages: number;
  insertedMessages: number;
  updatedMessages: number;
  ignoredMessages: number;
};

export async function syncInstagramDmHistory(): Promise<InstagramDmSyncResult> {
  const env = getEnv();
  const accountId = requireEnv("META_INSTAGRAM_ACCOUNT_ID");
  const accessToken = requireEnv("META_INSTAGRAM_ACCESS_TOKEN");
  const conversations = await fetchConversations(
    accountId,
    accessToken,
    env.META_INSTAGRAM_SYNC_CONVERSATION_LIMIT,
  );

  const total: InstagramDmSyncResult = {
    conversations: conversations.length,
    fetchedMessages: 0,
    insertedMessages: 0,
    updatedMessages: 0,
    ignoredMessages: 0,
  };

  for (let index = 0; index < conversations.length; index += CONVERSATION_BATCH_SIZE) {
    const batch = conversations.slice(index, index + CONVERSATION_BATCH_SIZE);
    const results = await Promise.all(batch.map(async (conversation) => {
      const messages = await fetchConversationMessages(conversation.id, accessToken);
      const rawBody = buildBackfillPayload(accountId, messages);
      if (!rawBody) return { fetchedMessages: messages.length, ingestion: null };

      const payload = parseMetaInstagramWebhook(rawBody);
      return {
        fetchedMessages: messages.length,
        ingestion: await ingestInstagramDmWebhook({
          payload,
          rawBody,
          expectedAccountId: accountId,
        }),
      };
    }));

    for (const result of results) {
      total.fetchedMessages += result.fetchedMessages;
      if (!result.ingestion) continue;
      total.insertedMessages += result.ingestion.insertedMessages;
      total.updatedMessages += result.ingestion.updatedMessages;
      total.ignoredMessages += result.ingestion.ignoredMessages;
    }
  }

  return total;
}

export function buildBackfillPayload(accountId: string, messages: MetaMessage[]) {
  const messaging = messages.flatMap((message) => {
    const senderId = message.from?.id;
    const recipient = message.to?.data?.[0];
    const timestamp = Date.parse(message.created_time);
    if (!senderId || !recipient?.id || !Number.isFinite(timestamp)) return [];

    return [{
      sender: { id: senderId, username: message.from?.username },
      recipient: { id: recipient.id, username: recipient.username },
      timestamp,
      message: {
        mid: message.id,
        text: message.message,
        is_echo: senderId === accountId,
        is_unsupported: message.is_unsupported ?? false,
      },
    }];
  });

  if (messaging.length === 0) return null;
  const notificationTime = Math.max(...messaging.map((event) => event.timestamp));
  return new TextEncoder().encode(JSON.stringify({
    object: "instagram",
    entry: [{ id: accountId, time: notificationTime, messaging }],
  }));
}

async function fetchConversations(accountId: string, accessToken: string, limit: number) {
  const initialUrl = buildMetaUrl(`/${accountId}/conversations`, {
    platform: "instagram",
    fields: "id,updated_time",
    limit: String(Math.min(META_PAGE_LIMIT, limit)),
  });
  const conversations: MetaConversation[] = [];
  let nextUrl: URL | null = initialUrl;

  for (let page = 0; nextUrl && page < MAX_META_PAGES && conversations.length < limit; page += 1) {
    const response = await metaRequest<MetaPage<MetaConversation>>(nextUrl, accessToken);
    conversations.push(...(response.data ?? []).slice(0, limit - conversations.length));
    nextUrl = safeNextUrl(response.paging?.next);
  }

  return conversations;
}

async function fetchConversationMessages(conversationId: string, accessToken: string) {
  const url = buildMetaUrl(`/${conversationId}`, {
    fields: "messages.limit(20){id,created_time,from,to,message,is_unsupported}",
  });
  const response = await metaRequest<MetaConversationMessages>(url, accessToken);
  return response.messages?.data ?? [];
}

async function metaRequest<T>(url: URL, accessToken: string): Promise<T> {
  const env = getEnv();
  const requestUrl = new URL(url);
  const attachedAppSecretProof = Boolean(env.META_APP_SECRET && !requestUrl.searchParams.has("appsecret_proof"));
  if (attachedAppSecretProof && env.META_APP_SECRET) {
    requestUrl.searchParams.set(
      "appsecret_proof",
      createHmac("sha256", env.META_APP_SECRET).update(accessToken).digest("hex"),
    );
  }

  let { response, payload } = await fetchInstagramPage<T>(requestUrl, accessToken);
  if (attachedAppSecretProof && isInvalidMetaAppSecretProof(payload.error)) {
    const retryUrl = new URL(requestUrl);
    retryUrl.searchParams.delete("appsecret_proof");
    ({ response, payload } = await fetchInstagramPage<T>(retryUrl, accessToken));
  }

  if (!response.ok || payload.error) {
    const code = payload.error?.code ? ` (${payload.error.code})` : "";
    throw new Error(`Instagram Conversations API sorğusu uğursuz oldu${code}.`);
  }

  return payload;
}

async function fetchInstagramPage<T>(url: URL, accessToken: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const payload = await response.json().catch(() => ({})) as T & {
    error?: { message?: string; code?: number; error_subcode?: number };
  };
  return { response, payload };
}

function buildMetaUrl(path: string, params: Record<string, string>) {
  const version = getEnv().META_GRAPH_API_VERSION;
  const url = new URL(`https://${META_INSTAGRAM_HOST}/${version}${path}`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

function safeNextUrl(value?: string) {
  if (!value) return null;
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== META_INSTAGRAM_HOST) {
    throw new Error("Instagram pagination ünvanı etibarlı deyil.");
  }
  return url;
}
