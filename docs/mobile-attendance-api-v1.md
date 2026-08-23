# Artmonia ERP mobile attendance API v1

ERP is the source of truth for lesson sessions, enrollment, and attendance. The mobile application never connects to PostgreSQL and never receives an ERP database or Supabase privileged key.

## Runtime flow

1. An authorized ERP user opens the QR dialog for today's class slot.
2. ERP creates a 60-second opaque QR token and stores only its SHA-256 hash.
3. The mobile app scans `artmonia://attendance/check-in?v=1&token=...`.
4. The mobile backend/Edge Function resolves the signed-in user to the immutable ERP `Student.id` UUID.
5. The mobile backend calls `POST /api/mobile/v1/attendance/check-ins` using its server-only token.
6. ERP validates the token, time window, active enrollment, and slot assignment before writing `PRESENT`.
7. `POST /api/cron/attendance-finalize` marks the remaining scheduled students `ABSENT` after the window closes.

## Mobile backend configuration

Configure these only in the mobile backend or Supabase Edge Function secrets:

```text
ERP_API_BASE_URL=https://<erp-host>
ERP_ATTENDANCE_SERVER_TOKEN=<one value configured in MOBILE_ATTENDANCE_SERVER_TOKENS>
```

Do not put `ERP_ATTENDANCE_SERVER_TOKEN` in Expo `EXPO_PUBLIC_*`, application source, logs, or analytics.

## Check-in request

```http
POST /api/mobile/v1/attendance/check-ins
Authorization: Bearer <ERP_ATTENDANCE_SERVER_TOKEN>
Idempotency-Key: <UUID>
X-Request-Id: <UUID>
Content-Type: application/json
```

```json
{
  "erpStudentId": "f5ad90e2-13ba-460b-bf76-4a8519685b58",
  "clientEventId": "7d94f164-a19b-48fc-86fd-50889a667ad2",
  "qrToken": "K8mQf2pX9dN4sV7yT1cR6w",
  "scannedAt": "2026-08-23T12:20:41.225Z"
}
```

The server uses its own receive time for attendance decisions. `scannedAt` is audit metadata only. A retry must reuse the same `Idempotency-Key` and body.

## Operational configuration

- Configure `MOBILE_ATTENDANCE_SERVER_TOKENS` in ERP with at least one 32-character random secret. Two comma-separated secrets can remain active during rotation.
- Call `/api/cron/attendance-finalize` every five minutes with `Authorization: Bearer <ATTENDANCE_CRON_SECRET>`.
- Apply the Prisma migration before deploying the application.
- Default check-in window: 15 minutes before the lesson until 30 minutes after it ends.
- Default QR lifetime: 60 seconds; the ERP screen refreshes it every 30 seconds.

The machine-readable contract is [mobile-attendance-openapi.yaml](./mobile-attendance-openapi.yaml).
