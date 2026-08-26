# Artmonia ümumi davamiyyət QR v2 — mobil təhvil

## Deep link

```text
artmonia://attendance/check-in?v=2&token=<PERMANENT_SITE_TOKEN>
```

Mobil tərəf QR-dən yalnız `token` dəyərini çıxarır. `Student.id`, `sessionId`, slot və dərs tarixi göndərilmir.

## Gateway request

Endpoint əvvəlki ilə eynidir:

```http
POST https://erp.artmoniya.com/api/mobile/v1/attendance/check-ins
Authorization: Bearer <ERP_ATTENDANCE_SERVER_TOKEN>
X-Student-Authorization: Bearer <SUPABASE_ACCESS_TOKEN>
Idempotency-Key: <UUID>
X-Request-Id: <UUID>
Content-Type: application/json
```

```json
{
  "clientEventId": "<UUID>",
  "qrToken": "<PERMANENT_SITE_TOKEN>",
  "deviceInstallationId": "<PERSISTENT_APP_INSTALLATION_UUID>",
  "scannedAt": "2026-08-26T14:30:00.000Z"
}
```

`deviceInstallationId` hər fiziki app installation üçün bir dəfə yaradılıb SecureStore/Keychain-də saxlanmalıdır. Retry eyni body, `clientEventId` və `Idempotency-Key` ilə edilməlidir.

## ERP seçimi

ERP server vaxtına görə:

1. aktiv site QR tokenini;
2. JWT → tələbə mapping-ini;
3. tələbəyə bağlı cihazı;
4. aktiv enrollment və slot assignment-ı;
5. həmin günün `scheduled` və ya `rescheduled` sessiyasını;
6. giriş pəncərəsini;
7. əvvəlki davamiyyət qeydini yoxlayır.

Uğurlu cavabda `mode: "site_qr"`, site, avtomatik tapılmış lesson və attendance qaytarılır.

## Yeni xəta kodları

```text
DEVICE_REQUIRED     400  deviceInstallationId göndərilməyib
DEVICE_MISMATCH     403  hesab başqa cihaza bağlıdır
NO_ACTIVE_LESSON    422  hazırda açıq dərs yoxdur
LESSON_CANCELLED    422  həmin vaxtdakı dərs ləğv edilib
```

Dinamik `v=1` QR əvvəlki body ilə işləməyə davam edir və fallback kimi saxlanılır.
