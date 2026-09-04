const baseUrl = process.env.META_SYNC_BASE_URL ?? process.env.NEXT_PUBLIC_APP_URL;
const cronSecret = process.env.CRON_SECRET;

if (!baseUrl || !cronSecret) {
  throw new Error("META_SYNC_BASE_URL və CRON_SECRET konfiqurasiya edilməlidir.");
}

const url = new URL("/api/integrations/meta-ads/sync", baseUrl);
const response = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${cronSecret}`,
    Accept: "application/json",
  },
  signal: AbortSignal.timeout(180_000),
});

const body = await response.text();
if (!response.ok) {
  throw new Error(`Meta Ads sync HTTP ${response.status}: ${body.slice(0, 500)}`);
}

const result = JSON.parse(body);
console.log(JSON.stringify({
  status: "ok",
  accountName: result.accountName,
  since: result.since,
  until: result.until,
  insightRows: result.insightRows,
  syncedAt: result.syncedAt,
}));
