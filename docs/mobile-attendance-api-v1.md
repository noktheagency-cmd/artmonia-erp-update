# Artmonia ERP mobile attendance API v2

ERP is the source of truth for lesson sessions, enrollment, and attendance. The mobile application never connects to PostgreSQL and never receives an ERP database or Supabase privileged key.

## Runtime flow

1. ERP-də yaradılan daimi akademiya QR-ı bir dəfə çap edilir.
2. Mobil tətbiq `artmonia://attendance/check-in?v=2&token=...` deep link-ini scan edir.
3. ERP tələbənin JWT mapping-i, bağlı cihazı, aktiv planı və server vaxtı əsasında uyğun dərsi özü tapır.
4. The mobile backend/Edge Function forwards the signed-in student's Supabase access token to ERP.
5. ERP validates that JWT and resolves it through the one-to-one mobile account mapping. The client cannot choose a `Student.id`.
6. The mobile backend calls `POST /api/mobile/v1/attendance/check-ins` using its server-only token.
7. ERP validates the site token, bound device, time window, active enrollment, and slot assignment before writing `PRESENT`.
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
X-Student-Authorization: Bearer <SUPABASE_STUDENT_ACCESS_TOKEN>
Idempotency-Key: <UUID>
X-Request-Id: <UUID>
Content-Type: application/json
```

```json
{
  "clientEventId": "7d94f164-a19b-48fc-86fd-50889a667ad2",
  "qrToken": "K8mQf2pX9dN4sV7yT1cR6w",
  "deviceInstallationId": "ac4d6e49-3e86-4289-b9ee-cb4a650eb98b",
  "scannedAt": "2026-08-23T12:20:41.225Z"
}
```

`deviceInstallationId` tətbiqin ilk açılışında yaradılan və cihazda təhlükəsiz saxlanılan daimi UUID-dir. İlk uğurlu ümumi QR cəhdində cihaz tələbə hesabına bağlanır. Başqa cihaz `DEVICE_MISMATCH` alır; ERP-də tələbə profilindən “Cihazı sıfırla” əməliyyatı mümkündür.

The server uses its own receive time for attendance decisions. `scannedAt` is audit metadata only. A retry must reuse the same `Idempotency-Key` and body. `erpStudentId` is no longer required; if a legacy client sends it, ERP rejects the request unless it matches the authenticated student's mapping.

## Operational configuration

- Configure `MOBILE_ATTENDANCE_SERVER_TOKENS` in ERP with at least one 32-character random secret. Two comma-separated secrets can remain active during rotation.
- Call `/api/cron/attendance-finalize` every five minutes with `Authorization: Bearer <ATTENDANCE_CRON_SECRET>`.
- Apply the Prisma migration before deploying the application.
- Default check-in window: 15 minutes before the lesson until 30 minutes after it ends.
- Daimi v2 QR müddətsizdir, lakin ERP-dən rotasiya edilərək köhnə çap dərhal etibarsızlaşdırıla bilər.
- Dinamik v1 QR fallback kimi qalır: token ömrü 60 saniyə, ekran yenilənməsi 30 saniyədir.

The machine-readable contract is [mobile-attendance-openapi.yaml](./mobile-attendance-openapi.yaml).
