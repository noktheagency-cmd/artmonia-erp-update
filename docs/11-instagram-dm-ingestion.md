# Instagram DM ingestion

Instagram DM ingestion collects and normalizes messages; DM Intelligence provides period-scoped operational metrics and daily AI analysis snapshots.

## Flow

1. A one-time or controlled history sync reads conversations from Meta's Conversations API.
2. New inbound and outbound messages arrive through the signed Meta webhook.
3. Both sources are normalized into the same account, participant, conversation, and message tables.
4. Message IDs and webhook payload hashes prevent duplicate counts.
5. Every new or edited message marks its conversation as `PENDING` for the later AI stage.

## Server configuration

Set these server-only environment values:

```text
META_APP_SECRET=
META_GRAPH_API_VERSION=v25.0
META_INSTAGRAM_ACCOUNT_ID=
META_INSTAGRAM_WEBHOOK_ACCOUNT_ID=
META_INSTAGRAM_ACCESS_TOKEN=
META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN=
META_INSTAGRAM_SYNC_CONVERSATION_LIMIT=100
CRON_SECRET=
```

The access token needs the current Instagram messaging permissions for the selected Meta login flow. Never expose these values through `NEXT_PUBLIC_*` variables.

`META_INSTAGRAM_ACCOUNT_ID` is used by the Conversations API. Set
`META_INSTAGRAM_WEBHOOK_ACCOUNT_ID` to the ID Meta sends in webhook `entry.id`
when it differs from the account ID returned for the access token. If omitted,
the webhook falls back to `META_INSTAGRAM_ACCOUNT_ID`.

## Meta webhook

Callback URL:

```text
https://<erp-domain>/api/integrations/meta-instagram/webhook
```

Use `META_INSTAGRAM_WEBHOOK_VERIFY_TOKEN` as the Meta Dashboard verification token and subscribe to Instagram messaging events. The endpoint:

- answers Meta's `GET` verification challenge;
- validates `X-Hub-Signature-256` with `META_APP_SECRET`;
- rejects payloads larger than 2 MiB;
- stores only signed Instagram payloads;
- returns `EVENT_RECEIVED` after normalized data is committed.

## Initial history sync

Run the protected endpoint after applying the database migration:

```text
POST /api/integrations/meta-instagram/sync
Authorization: Bearer <CRON_SECRET>
```

The sync imports up to `META_INSTAGRAM_SYNC_CONVERSATION_LIMIT` conversations and the latest message details Meta makes available for each conversation. It is safe to repeat: existing Meta message IDs are not counted twice.

Meta currently limits retrievable details for older messages and may omit inactive Requests-folder conversations. The webhook is therefore the source of truth from activation onward.

## Storage security

All DM tables live in the `erp` schema, have RLS enabled, and revoke access from `anon` and `authenticated`. The browser does not receive raw message text during this stage.

## Daily DM Intelligence

- Apply the `20260905134611_instagram_dm_daily_analysis` migration before deploying the daily analysis code.
- Configure `OPENROUTER_API_KEY` on the ERP web service (not only the Meta sync service). The selected model is `google/gemini-3.8-flash`. The existing Google direct fallback is used only when the OpenRouter key is absent.
- OpenRouter routing retains `data_collection: deny`, `zdr: true`, and `require_parameters: true`. Do not send `temperature` to this model: its Vertex ZDR endpoints do not advertise support for that parameter.
- First access to a selected header date range each Baku calendar day claims one database snapshot. Completed READY/NO_DATA snapshots are reused across refreshes, users and process restarts. A different date range gets its own snapshot.
- Failed or abandoned attempts may retry after 15 minutes. Generation is limited to five minutes and two concurrent batches. There is no scheduled run when nobody opens DM Intelligence, and missed days are not fabricated.
- Snapshots represent the selected period as known at first access (month-to-date for the current month), not isolated daily message totals. Do not add daily snapshot counts/percentages together to obtain monthly results. Previous snapshots are retained; the UI lists the latest 31 for that exact period.
- `metrics`, aggregate `result`, model/version, cutoff and per-conversation classifications are stored in `erp.instagram_dm_daily_analyses`. Raw message text is not duplicated in this table or sent to the frontend.
- All in-period conversations with inbound text are eligible, without the old 120-conversation/60-message/260-character truncation. Large input is batched; an oversized individual conversation fails explicitly rather than being silently truncated. Phone numbers, email addresses and URLs are masked before model calls; free-text names may remain, so this is not full anonymization.
- Active conversations includes outbound-only threads. It is not a new-customer, Meta ad lead or unique new lead count. AI analyzes only collected text; audio/image meaning and uncollected history are not covered.
- The statistics refresh timestamp and the AI generation timestamp are distinct. A refresh during the same day can update live metrics without regenerating the saved AI snapshot.
- Errors log only a safe error code, model and period; never log the full provider error, request payload or API key. HTTP 401/403 means key/access, 402 balance/limit, 404 model/routing, 429 throttling.
