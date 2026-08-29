# Instagram DM ingestion

This stage only collects and normalizes Instagram DM data. AI classification and the behavior dashboard are intentionally deferred.

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
